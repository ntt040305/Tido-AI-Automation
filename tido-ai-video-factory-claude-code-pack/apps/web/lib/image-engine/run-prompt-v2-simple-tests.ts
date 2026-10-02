/**
 * The simplified v2 engine, offline. No API calls: the model is a stub everywhere.
 *
 * What this suite is for
 * ----------------------
 *   1. THE TEMPLATES load from disk for every asset type, the version comes from the
 *      filename, and an unfilled slot throws rather than briefing a model about
 *      `{{COPY}}`.
 *   2. THE PARSER survives what a model really returns: a fence around everything,
 *      prose before and after, a tag it forgot to close, tags out of order, an empty
 *      `<copy_final>`. It never invents an `<image_prompt>`.
 *   3. THE THREE CHECKS catch what cannot be recovered downstream, and -- the part
 *      worth testing hardest -- do NOT fire on the client's own words. A brief whose
 *      copy is "Giảm 50% hôm nay" must not be rejected for stating a percentage.
 *   4. ONE REPAIR, then stop. Two calls is the ceiling, counted.
 *
 * Every model reply here is a fixture written by hand. Nothing in this file can
 * reach a provider.
 */
import assert from "assert";

import {
  budgetFromPlaybook,
  buildMetaPrompt,
  buildSimplePrompt,
  claimWarnings,
  decidePolicy,
  simpleTelemetry,
  WORD_MAX,
  WORD_MIN,
  type SimpleInput,
} from "./prompt-v2/build-simple";
import { checkPrompt, FORBIDDEN_WORDS } from "./prompt-v2/checks";
import { parseTaggedReply, TAGS } from "./prompt-v2/tags";
import {
  clearTemplateCache,
  fillSlots,
  LAYOUT_BY_RATIO,
  loadTemplates,
  playbookNameFor,
  PLAYBOOK_NAMES,
  RATIO_SENTENCE,
  templateVersion,
  type AspectRatio,
} from "./prompt-v2/templates";
import { fallbackToV1 } from "./prompt-v2/engine-selector";

let passed = 0;
let failed = 0;
const failures: string[] = [];
const pending: Array<Promise<void>> = [];

function check(name: string, fn: () => void | Promise<void>) {
  const pass = () => {
    passed++;
    console.log(`  ✓ ${name}`);
  };
  const fail = (e: Error) => {
    failed++;
    failures.push(`${name}\n    ${e.message.split("\n")[0]}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message.split("\n")[0]}`);
  };
  try {
    const out = fn();
    if (out && typeof (out as Promise<void>).then === "function") {
      pending.push((out as Promise<void>).then(pass, fail));
      return;
    }
    pass();
  } catch (e: unknown) {
    fail(e as Error);
  }
}

const RATIOS: AspectRatio[] = ["1:1", "9:16", "16:9"];

/** 19 words. Repeated to reach a word count without tripping any check. */
const SENTENCE = "The light falls from the left and the shadow stretches away to the right and softens as it goes.";

function prose(words: number): string {
  return Array.from({ length: Math.ceil(words / 19) }, () => SENTENCE).join(" ");
}

/** A prompt that passes all three checks. The control for every negative case. */
function goodPrompt(copy: string[], ratio: AspectRatio = "1:1", extra = ""): string {
  const quoted = copy.map((c) => `The line "${c}" is set as text in the open wall above the subject.`).join(" ");
  return [prose(230), quoted, extra, RATIO_SENTENCE[ratio]].filter(Boolean).join(" ");
}

const COPY = ["Dịu da sau 14 ngày", "Phục hồi hàng rào bảo vệ da", "Mua ngay"];

function baseInput(over: Partial<SimpleInput> = {}): SimpleInput {
  return {
    assetType: "poster",
    aspectRatio: "1:1",
    concept: "Làn da dịu lại sau hai tuần",
    brand: "SKIN1004",
    productLine: "Madagascar Centella",
    copy: [...COPY],
    products: [{ ref_index: 1, description: "chai serum thủy tinh mờ 100ml", imageUrl: "data:image/png;base64,AAA" }],
    includeLabelText: true,
    ...over,
  };
}

/** A model reply, assembled from parts so each test can break exactly one. */
function reply(parts: { plan?: string; copy?: string[]; warnings?: string[]; prompt?: string }): string {
  return [
    `<plan>${parts.plan ?? "One idea: the skin calms. The eye reads the bottle, then the headline."}</plan>`,
    `<copy_final>\n${(parts.copy ?? COPY).join("\n")}\n</copy_final>`,
    `<warnings>\n${(parts.warnings ?? []).join("\n")}\n</warnings>`,
    `<image_prompt>${parts.prompt ?? goodPrompt(COPY)}</image_prompt>`,
  ].join("\n\n");
}

/** A stub model. Returns each scripted reply in turn and records every call. */
function stub(replies: string[]) {
  const calls: Array<{ purpose: string; messages: Array<{ role: string; content: unknown }> }> = [];
  return {
    calls,
    deps: {
      chat: async (messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>, purpose: string) => {
        calls.push({ purpose, messages });
        const next = replies[calls.length - 1];
        if (next === undefined) throw new Error(`the stub was called ${calls.length} times but only ${replies.length} replies were scripted`);
        return next;
      },
    },
  };
}

function main(): void {
  console.log("\nPrompt engine v2 — simplified, offline\n");

  // ── 1. the templates ────────────────────────────────────────────────────
  console.log("1 — the templates are files, and the version is in the filename");

  check("the default version is v1", () => {
    assert.strictEqual(templateVersion({}), "v1");
    assert.strictEqual(templateVersion({ PROMPT_V2_TEMPLATE_VERSION: "v3" }), "v3");
  });

  check("a version that is not vN is refused, so it cannot become a path", () => {
    for (const bad of ["../../etc", "v1/../v2", "V1; rm -rf", "latest", ""]) {
      assert.strictEqual(templateVersion({ PROMPT_V2_TEMPLATE_VERSION: bad }), "v1", bad);
    }
  });

  check("every playbook name maps from at least one asset type the UI sends", () => {
    const cases: Array<[string, string]> = [
      ["poster", "poster"],
      ["Poster A2", "poster"],
      ["banner", "banner"],
      ["web ad leaderboard", "banner"],
      ["social ad", "social"],
      ["instagram story", "social"],
      ["product hero", "hero"],
      ["packshot", "hero"],
      ["ugc", "ugc"],
      ["unboxing selfie", "ugc"],
      ["", "poster"],
    ];
    for (const [input, want] of cases) assert.strictEqual(playbookNameFor(input), want, input);
  });

  check("all five playbooks and the meta-prompt exist on disk at v1", () => {
    clearTemplateCache();
    for (const name of PLAYBOOK_NAMES) {
      const t = loadTemplates(name === "hero" ? "product hero" : name === "social" ? "social ad" : name);
      assert.strictEqual(t.playbookName, name);
      assert.ok(t.metaPrompt.length > 500, `meta-prompt too short: ${t.metaPrompt.length}`);
      assert.ok(t.playbook.length > 200, `${name} playbook too short: ${t.playbook.length}`);
      assert.strictEqual(t.version, "v1");
      assert.strictEqual(t.files.length, 2);
    }
  });

  check("an unfilled slot throws instead of reaching the model", () => {
    assert.throws(() => fillSlots("a {{COPY}} b {{BRAND}}", { BRAND: "x" }), /slots not filled: \{\{COPY\}\}/);
    assert.strictEqual(fillSlots("a {{BRAND}} b", { BRAND: "x" }), "a x b");
  });

  check("a slot value containing $ is inserted literally", () => {
    assert.strictEqual(fillSlots("{{COPY}}", { COPY: "Giá chỉ $9.99 — $& $1" }), "Giá chỉ $9.99 — $& $1");
  });

  check("every asset type x ratio fills the whole meta-prompt", () => {
    for (const name of PLAYBOOK_NAMES) {
      for (const ratio of RATIOS) {
        const { system } = buildMetaPrompt(baseInput({ assetType: name, aspectRatio: ratio }), "exact");
        assert.ok(!/\{\{[A-Z_]+\}\}/.test(system), `${name} ${ratio} left a slot`);
        assert.ok(system.includes(LAYOUT_BY_RATIO[ratio]), `${name} ${ratio} lost the layout`);
        assert.ok(system.includes(RATIO_SENTENCE[ratio]), `${name} ${ratio} lost the ratio sentence`);
      }
    }
  });

  check("the brief reaches the meta-prompt verbatim, diacritics and all", () => {
    const { system } = buildMetaPrompt(baseInput(), "exact");
    for (const line of COPY) assert.ok(system.includes(line), line);
    assert.ok(system.includes("Làn da dịu lại sau hai tuần"), "the concept was altered");
    assert.ok(system.includes("chai serum thủy tinh mờ 100ml"), "the product description was altered");
  });

  check("the forbidden words the check enforces are the ones the model is shown", () => {
    const { system } = buildMetaPrompt(baseInput(), "exact");
    for (const w of FORBIDDEN_WORDS) assert.ok(system.includes(w), `${w} is rejected but never stated`);
  });

  check("the label rule flips with the flag, and both modes keep the reference", () => {
    const on = buildMetaPrompt(baseInput({ includeLabelText: true }), "exact").system;
    const off = buildMetaPrompt(baseInput({ includeLabelText: false }), "exact").system;
    assert.ok(/quote it in the prompt/i.test(on));
    assert.ok(/Do not quote any label lettering/i.test(off));
    for (const s of [on, off]) assert.ok(s.includes("exactly as in attached photo"), "the reference instruction was lost");
  });

  check("a brief with no copy and no products still briefs cleanly", () => {
    const { system } = buildMetaPrompt(baseInput({ copy: [], products: [] }), "exact");
    assert.ok(system.includes("this frame carries no words"));
    assert.ok(system.includes("(none attached)"));
  });

  // ── 2. the copy policy ──────────────────────────────────────────────────
  console.log("\n2 — exact unless the asset physically cannot carry the copy");

  check("every shipped playbook states a budget this code can read", () => {
    for (const name of PLAYBOOK_NAMES) {
      const t = loadTemplates(name === "hero" ? "product hero" : name === "social" ? "social ad" : name);
      const b = budgetFromPlaybook(t.playbook);
      assert.ok(b.maxStrings !== null, `${name}: no string budget found`);
      assert.ok(b.headlineMaxWords !== null, `${name}: no headline budget found`);
    }
  });

  check("the budgets read back are the numbers the files state", () => {
    const b = (asset: string) => budgetFromPlaybook(loadTemplates(asset).playbook);
    assert.deepStrictEqual(b("poster"), { maxStrings: 3, headlineMaxWords: 8 });
    assert.deepStrictEqual(b("banner"), { maxStrings: 2, headlineMaxWords: 7 });
    assert.deepStrictEqual(b("social ad"), { maxStrings: 3, headlineMaxWords: 6 });
    assert.deepStrictEqual(b("product hero"), { maxStrings: 1, headlineMaxWords: 5 });
    assert.deepStrictEqual(b("ugc"), { maxStrings: 1, headlineMaxWords: 6 });
  });

  check("a budget the playbook does not state yields no limit, not a wrong one", () => {
    assert.deepStrictEqual(budgetFromPlaybook("ASSET: something new.\nNo budget sentence here."), {
      maxStrings: null,
      headlineMaxWords: null,
    });
  });

  check("three short strings on a poster stay exact", () => {
    const d = decidePolicy(COPY, loadTemplates("poster").playbook);
    assert.strictEqual(d.policy, "exact");
    assert.deepStrictEqual(d.warnings, []);
  });

  check("three strings on a product hero become adapt, and say why", () => {
    const d = decidePolicy(COPY, loadTemplates("product hero").playbook);
    assert.strictEqual(d.policy, "adapt");
    assert.strictEqual(d.warnings.length, 1);
    assert.ok(/longer than this asset carries/.test(d.warnings[0]));
  });

  check("one over-long headline is enough to force adapt", () => {
    const long = ["Phục hồi hàng rào bảo vệ da chỉ sau mười bốn ngày sử dụng đều đặn mỗi tối"];
    assert.strictEqual(decidePolicy(long, loadTemplates("poster").playbook).policy, "adapt");
    assert.strictEqual(decidePolicy(["Dịu da"], loadTemplates("poster").playbook).policy, "exact");
  });

  check("a caller that asked for adapt is not argued with", () => {
    const d = decidePolicy(["Dịu da"], loadTemplates("poster").playbook, "adapt");
    assert.strictEqual(d.policy, "adapt");
    assert.deepStrictEqual(d.warnings, []);
  });

  check("a claim with a deadline or an absolute is reported, never edited", () => {
    const w = claimWarnings(["Dịu da sau 14 ngày", "Hết mụn 100%", "Dưỡng ẩm nhẹ dịu"]);
    assert.strictEqual(w.length, 2, JSON.stringify(w));
    assert.ok(w.every((x) => /advertising-claim review/.test(x)));
  });

  // ── 3. the parser ───────────────────────────────────────────────────────
  console.log("\n3 — the parser is tolerant, except about the prompt");

  check("the ordinary reply parses into four fields", () => {
    const r = parseTaggedReply(reply({}));
    assert.deepStrictEqual(r.missing, []);
    assert.deepStrictEqual(r.copy_final, COPY);
    assert.ok(r.plan.startsWith("One idea"));
    assert.ok(r.image_prompt.includes("Square 1:1 frame."));
    assert.strictEqual(r.stray, "");
  });

  check("prose before and after the tags is reported, not used", () => {
    const r = parseTaggedReply(`Sure, here you go!\n\n${reply({})}\n\nHope that helps.`);
    assert.deepStrictEqual(r.missing, []);
    assert.ok(/here you go/.test(r.stray) && /Hope that helps/.test(r.stray));
    assert.ok(!/here you go/.test(r.image_prompt));
  });

  check("a fence around the whole reply is wrapping, not content", () => {
    const r = parseTaggedReply("```xml\n" + reply({}) + "\n```");
    assert.deepStrictEqual(r.missing, []);
    assert.ok(!r.image_prompt.includes("```"));
  });

  check("an unclosed image_prompt at the end of the reply is still read", () => {
    const raw = `<plan>p</plan>\n<copy_final>\nMua ngay\n</copy_final>\n<warnings></warnings>\n<image_prompt>${goodPrompt(["Mua ngay"])}`;
    const r = parseTaggedReply(raw);
    assert.ok(r.image_prompt.endsWith("Square 1:1 frame."), r.image_prompt.slice(-40));
    assert.deepStrictEqual(r.missing, []);
  });

  check("an unclosed tag stops at the next opening tag", () => {
    const r = parseTaggedReply("<plan>thinking out loud\n<copy_final>\nMua ngay\n</copy_final>\n<image_prompt>P</image_prompt>");
    assert.strictEqual(r.plan, "thinking out loud");
    assert.deepStrictEqual(r.copy_final, ["Mua ngay"]);
    assert.strictEqual(r.image_prompt, "P");
    assert.deepStrictEqual(r.missing, ["warnings"]);
  });

  check("the tags may arrive in any order", () => {
    const r = parseTaggedReply("<image_prompt>P</image_prompt>\n<warnings>w</warnings>\n<copy_final>c</copy_final>\n<plan>pl</plan>");
    assert.strictEqual(r.image_prompt, "P");
    assert.deepStrictEqual(r.copy_final, ["c"]);
    assert.deepStrictEqual(r.warnings, ["w"]);
    assert.strictEqual(r.plan, "pl");
  });

  check("attributes and loose whitespace on the tag are tolerated", () => {
    const r = parseTaggedReply('< plan lang="en" >pl</ plan >\n<IMAGE_PROMPT>P</IMAGE_PROMPT>');
    assert.strictEqual(r.plan, "pl");
    assert.strictEqual(r.image_prompt, "P");
  });

  check("bullets and blank lines in copy_final become clean strings", () => {
    const r = parseTaggedReply("<copy_final>\n- Dịu da sau 14 ngày\n\n* Mua ngay\n</copy_final>");
    assert.deepStrictEqual(r.copy_final, ["Dịu da sau 14 ngày", "Mua ngay"]);
  });

  check("an empty copy_final and an empty warnings are legitimate", () => {
    const r = parseTaggedReply("<plan>p</plan><copy_final>\n\n</copy_final><warnings></warnings><image_prompt>P</image_prompt>");
    assert.deepStrictEqual(r.copy_final, []);
    assert.deepStrictEqual(r.warnings, []);
    assert.deepStrictEqual(r.missing, []);
  });

  check("a missing image_prompt is never invented", () => {
    for (const raw of ["", "I cannot help with that.", "<plan>p</plan><copy_final>c</copy_final>", reply({}).replace(/<\/?image_prompt>/g, "")]) {
      const r = parseTaggedReply(raw);
      assert.strictEqual(r.image_prompt, "", JSON.stringify(raw.slice(0, 30)));
      assert.ok(r.missing.includes("image_prompt"));
    }
  });

  check("the parser never throws, whatever it is handed", () => {
    for (const raw of ["<<<>>>", "<image_prompt", "</image_prompt>", "<plan>".repeat(500), "\u0000"]) {
      assert.doesNotThrow(() => parseTaggedReply(raw), raw.slice(0, 20));
    }
    assert.strictEqual(TAGS.length, 4);
  });

  // ── 4. the three checks ─────────────────────────────────────────────────
  console.log("\n4 — three checks, and they do not fire on the client's own words");

  const baseOpts = { copyOriginal: COPY, copyFinal: COPY, policy: "exact" as const, aspectRatio: "1:1" as AspectRatio };

  check("the control prompt passes everything", () => {
    const r = checkPrompt(goodPrompt(COPY), baseOpts);
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
    assert.ok(r.stats.words >= WORD_MIN && r.stats.words <= WORD_MAX, String(r.stats.words));
  });

  check("exact: a changed copy string is caught", () => {
    const changed = ["Diu da sau 14 ngay", COPY[1], COPY[2]];
    const r = checkPrompt(goodPrompt(changed), { ...baseOpts, copyFinal: changed });
    assert.strictEqual(r.ok, false);
    assert.ok(r.failures.some((f) => f.code === "copy" && /character for character/.test(f.message)));
  });

  check("exact: a string the client never wrote is caught", () => {
    const added = [...COPY, "Giảm 50% hôm nay"];
    const r = checkPrompt(goodPrompt(added), { ...baseOpts, copyFinal: added });
    assert.ok(r.failures.some((f) => f.code === "copy" && /did not write/.test(f.message)));
  });

  check("a copy string drawn twice is caught, and so is one drawn never", () => {
    const twice = checkPrompt(goodPrompt(COPY) + ` And again: "${COPY[2]}".`, baseOpts);
    assert.ok(twice.failures.some((f) => f.code === "copy" && /appears 2 time/.test(f.message)));
    const never = checkPrompt(goodPrompt([COPY[0], COPY[1]]), baseOpts);
    assert.ok(never.failures.some((f) => f.code === "copy" && /appears 0 time/.test(f.message)));
  });

  check("NFD copy from the client matches the NFC the model returns", () => {
    const original = COPY.map((c) => c.normalize("NFD"));
    const r = checkPrompt(goodPrompt(COPY), { ...baseOpts, copyOriginal: original, copyFinal: COPY });
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  });

  check("adapt: shortened strings are allowed, an empty set is not", () => {
    const short = ["Dịu da sau 14 ngày"];
    const ok = checkPrompt(goodPrompt(short), { ...baseOpts, policy: "adapt", copyFinal: short });
    assert.strictEqual(ok.ok, true, JSON.stringify(ok.failures));
    const empty = checkPrompt(goodPrompt([]), { ...baseOpts, policy: "adapt", copyFinal: [] });
    assert.ok(empty.failures.some((f) => f.code === "copy" && /empty although the client supplied copy/.test(f.message)));
  });

  check("a brief with no copy at all passes the copy check", () => {
    const r = checkPrompt(goodPrompt([]), { ...baseOpts, copyOriginal: [], copyFinal: [] });
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  });

  check("a missing ratio is caught, and the message says what to write", () => {
    const r = checkPrompt(prose(250) + ` The line "${COPY[0]}" sits above. ` + COPY.slice(1).map((c) => `"${c}"`).join(" "), {
      ...baseOpts,
    });
    const f = r.failures.find((x) => x.code === "ratio");
    assert.ok(f, JSON.stringify(r.failures));
    assert.ok(f!.message.includes("Square 1:1 frame."));
  });

  check("a prompt describing a different frame than the user chose is caught", () => {
    const r = checkPrompt(goodPrompt(COPY, "1:1") + " Wide 16:9 frame.", baseOpts);
    assert.ok(r.failures.some((f) => f.code === "ratio" && /mentions 16:9 but the user chose 1:1/.test(f.message)));
  });

  check("every supported ratio passes its own check", () => {
    for (const ratio of RATIOS) {
      const r = checkPrompt(goodPrompt(COPY, ratio), { ...baseOpts, aspectRatio: ratio });
      assert.strictEqual(r.ok, true, `${ratio}: ${JSON.stringify(r.failures)}`);
    }
  });

  check("too short and too long are both caught", () => {
    const short = checkPrompt(prose(40) + ` "${COPY[0]}" "${COPY[1]}" "${COPY[2]}" Square 1:1 frame.`, baseOpts);
    assert.ok(short.failures.some((f) => f.code === "shape" && /must be between/.test(f.message)));
    const long = checkPrompt(goodPrompt(COPY) + " " + prose(400), baseOpts);
    assert.ok(long.failures.some((f) => f.code === "shape" && /must be between/.test(f.message)));
  });

  check("a word that grades the picture is caught in the prose", () => {
    const r = checkPrompt(goodPrompt(COPY, "1:1", "The result is a premium, cinematic look."), baseOpts);
    const f = r.failures.find((x) => x.code === "shape" && /grade the picture/.test(x.message));
    assert.ok(f, JSON.stringify(r.failures));
    assert.ok(/premium/.test(f!.message) && /cinematic/.test(f!.message));
  });

  check("the SAME word inside the client's copy is not a failure", () => {
    const copy = ["Premium care, cinematic glow"];
    const r = checkPrompt(goodPrompt(copy), { ...baseOpts, copyOriginal: copy, copyFinal: copy });
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  });

  check("a technical parameter is caught in the prose", () => {
    for (const bad of ["Shot at f/2.8.", "A 85mm lens is used.", "Key light at 5600K.", "ISO 400 throughout.", "A 3:1 lighting ratio.", "Two stops under."]) {
      const r = checkPrompt(goodPrompt(COPY, "1:1", bad), baseOpts);
      assert.ok(
        r.failures.some((f) => f.code === "shape" && /technical parameter/.test(f.message)),
        `${bad} was allowed`,
      );
    }
  });

  check("a number inside the client's copy is not a technical parameter", () => {
    const copy = ["Giảm 50% hôm nay", "Dịu da sau 14 ngày"];
    const r = checkPrompt(goodPrompt(copy), { ...baseOpts, copyOriginal: copy, copyFinal: copy });
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  });

  check("the declared ratio is not read as a ratio parameter", () => {
    for (const ratio of RATIOS) {
      const r = checkPrompt(goodPrompt(COPY, ratio), { ...baseOpts, aspectRatio: ratio });
      assert.ok(!r.failures.some((f) => /technical parameter/.test(f.message)), `${ratio}: ${JSON.stringify(r.failures)}`);
    }
  });

  check("the provider's character ceiling is enforced", () => {
    const r = checkPrompt(goodPrompt(COPY) + " " + "x".repeat(200), { ...baseOpts, maxChars: 500 });
    assert.ok(r.failures.some((f) => f.code === "shape" && /over the provider's ceiling/.test(f.message)));
  });

  check("there are exactly three codes, no more", () => {
    const r = checkPrompt("nonsense", { ...baseOpts });
    assert.ok(r.failures.length > 0);
    for (const f of r.failures) assert.ok(["copy", "ratio", "shape"].includes(f.code), f.code);
  });

  // ── 5. the build: one call, one repair, then stop ────────────────────────
  console.log("\n5 — one call, at most one repair, then stop");

  check("the happy path is exactly one model call", async () => {
    const s = stub([reply({})]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.strictEqual(r.ok, true, r.reason);
    assert.strictEqual(r.llmCalls, 1);
    assert.strictEqual(s.calls.length, 1);
    assert.strictEqual(r.copyPolicy, "exact");
    assert.deepStrictEqual(r.copy_final, COPY);
    assert.ok(r.prompt!.includes("Square 1:1 frame."));
    assert.ok(r.plan!.length > 0);
  });

  check("the plan is kept on the job and never sent to the renderer", async () => {
    const s = stub([reply({ plan: "SECRET THINKING" })]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.strictEqual(r.plan, "SECRET THINKING");
    assert.ok(!r.prompt!.includes("SECRET THINKING"));
  });

  check("the photos go in the user turn, in reference order", async () => {
    const s = stub([reply({})]);
    const input = baseInput({
      products: [
        { ref_index: 1, description: "chai lớn", imageUrl: "data:image/png;base64,ONE" },
        { ref_index: 2, description: "chai nhỏ", imageUrl: "data:image/png;base64,TWO" },
      ],
    });
    await buildSimplePrompt(input, s.deps);
    const [system, user] = s.calls[0].messages as Array<{ role: string; content: unknown }>;
    assert.strictEqual(system.role, "system");
    assert.strictEqual(user.role, "user");
    const parts = user.content as Array<Record<string, unknown>>;
    const images = parts.filter((p) => p.type === "image_url").map((p) => (p.image_url as { url: string }).url);
    assert.deepStrictEqual(images, ["data:image/png;base64,ONE", "data:image/png;base64,TWO"]);
    assert.ok(String(parts[0].text).includes("photo 1 to photo 2"));
  });

  check("a product with no image is described but attaches nothing", async () => {
    const s = stub([reply({})]);
    await buildSimplePrompt(baseInput({ products: [{ ref_index: 1, description: "chai serum" }] }), s.deps);
    const parts = (s.calls[0].messages[1].content as Array<Record<string, unknown>>);
    assert.strictEqual(parts.filter((p) => p.type === "image_url").length, 0);
    assert.ok(String(s.calls[0].messages[0].content).includes("chai serum"));
  });

  check("a failing first reply is repaired, and that is the second and last call", async () => {
    const s = stub([reply({ prompt: goodPrompt(COPY) + " Everything looks premium." }), reply({})]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.strictEqual(r.ok, true, r.reason);
    assert.strictEqual(r.llmCalls, 2);
    assert.strictEqual(s.calls.length, 2);
    assert.strictEqual(s.calls[1].purpose, "prompt_v2_repair");
  });

  check("the repair turn carries the failures and the previous reply", async () => {
    const s = stub([reply({ prompt: goodPrompt(COPY) + " Everything looks premium." }), reply({})]);
    await buildSimplePrompt(baseInput(), s.deps);
    const msgs = s.calls[1].messages;
    assert.strictEqual(msgs.length, 4);
    assert.strictEqual(msgs[2].role, "assistant");
    const text = String((msgs[3].content as Array<Record<string, unknown>>)[0].text);
    assert.ok(/premium/.test(text), "the failure was not handed back");
    assert.ok(/Add no new text/.test(text));
  });

  check("two failures in a row stop the build and report, without a third call", async () => {
    const bad = reply({ prompt: goodPrompt(COPY) + " Everything looks premium." });
    const s = stub([bad, bad]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.llmCalls, 2);
    assert.strictEqual(s.calls.length, 2);
    assert.ok(/still failed the checks after one repair/.test(r.reason!), r.reason);
    assert.ok(r.checks!.failures.some((f) => f.code === "shape"));
  });

  check("a reply with no image_prompt is repaired once, then reported", async () => {
    const s = stub(["I cannot do that.", "Still no."]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.llmCalls, 2);
    assert.ok(/no <image_prompt> after one repair/.test(r.reason!), r.reason);
  });

  check("a repair that returns no prompt does not overwrite the first attempt's diagnosis", async () => {
    const s = stub([reply({ prompt: goodPrompt(COPY) + " Everything looks premium." }), "sorry"]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.strictEqual(r.ok, false);
    assert.ok(r.reply!.image_prompt.length > 0, "the readable first attempt was thrown away");
    assert.ok(r.checks!.failures.some((f) => f.code === "shape"));
  });

  check("a model that throws is reported, not retried forever", async () => {
    const r = await buildSimplePrompt(baseInput(), {
      chat: async () => {
        throw new Error("upstream 503");
      },
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.llmCalls, 1);
    assert.ok(/the model call failed/.test(r.reason!), r.reason);
  });

  check("a repair call that throws is reported with both calls counted", async () => {
    let n = 0;
    const r = await buildSimplePrompt(baseInput(), {
      chat: async () => {
        n++;
        if (n === 1) return reply({ prompt: goodPrompt(COPY) + " Everything looks premium." });
        throw new Error("upstream 503");
      },
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.llmCalls, 2);
    assert.ok(/the repair call failed/.test(r.reason!), r.reason);
  });

  check("a template version that is not on disk is reported before any model call", async () => {
    // The version is a parameter, not an environment variable, precisely so this
    // test cannot disturb the other builds running beside it.
    const r = await buildSimplePrompt(baseInput({ templateVersion: "v99" }), {
      chat: async () => {
        throw new Error("the model must not be called");
      },
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.llmCalls, 0);
    assert.ok(/templates did not load/.test(r.reason!), r.reason);
  });

  check("the copy the client typed survives the whole build", async () => {
    const s = stub([reply({})]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.deepStrictEqual(r.copy_original, COPY);
    for (const line of COPY) assert.strictEqual(r.prompt!.split(line).length - 1, 1, line);
  });

  check("a shortened-copy build keeps the original and warns", async () => {
    const short = ["Dịu da 14 ngày"];
    const s = stub([reply({ copy: short, prompt: goodPrompt(short) })]);
    const r = await buildSimplePrompt(baseInput({ assetType: "product hero" }), s.deps);
    assert.strictEqual(r.ok, true, r.reason);
    assert.strictEqual(r.copyPolicy, "adapt");
    assert.deepStrictEqual(r.copy_original, COPY);
    assert.deepStrictEqual(r.copy_final, short);
    assert.ok(r.warnings.some((w) => /longer than this asset carries/.test(w)));
  });

  check("the model's own warnings are kept alongside the engine's", async () => {
    const s = stub([reply({ warnings: ["the second label is out of focus and could not be read"] })]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    assert.ok(r.warnings.some((w) => /out of focus/.test(w)), JSON.stringify(r.warnings));
    assert.ok(r.warnings.some((w) => /advertising-claim review/.test(w)), "the 14-day claim went unreported");
  });

  // ── 6. telemetry carries nothing it should not ───────────────────────────
  console.log("\n6 — telemetry is counts and codes");

  check("telemetry names the version and the playbook, and no content", async () => {
    const s = stub([reply({})]);
    const r = await buildSimplePrompt(baseInput(), s.deps);
    const t = simpleTelemetry(r);
    assert.strictEqual(t.template_version, "v1");
    assert.strictEqual(t.playbook, "poster");
    assert.strictEqual(t.llm_calls, 1);
    assert.strictEqual(t.copy_adapted, false);
    assert.ok((t.prompt_words as number) >= WORD_MIN);
    const blob = JSON.stringify(t);
    for (const line of COPY) assert.ok(!blob.includes(line), `telemetry leaked ${line}`);
    assert.ok(!blob.includes("limestone") && !blob.includes("shadow"), "telemetry leaked the prompt");
  });

  check("telemetry of a failed build reports the codes and the reason only", async () => {
    const bad = reply({ prompt: goodPrompt(COPY) + " Everything looks premium." });
    const r = await buildSimplePrompt(baseInput(), stub([bad, bad]).deps);
    const t = simpleTelemetry(r);
    assert.strictEqual(t.ok, false);
    assert.deepStrictEqual(t.check_codes, ["shape"]);
    assert.ok(String(t.failed_because).length <= 120);
  });

  check("telemetry of nothing is not a crash", () => {
    assert.deepStrictEqual(simpleTelemetry(null), { prompt_v2_simple: false });
  });

  check("the fallback flag is on by default and off only when asked", () => {
    assert.strictEqual(fallbackToV1({}), true);
    assert.strictEqual(fallbackToV1({ V2_FALLBACK: "off" }), false);
    assert.strictEqual(fallbackToV1({ V2_FALLBACK: "v1" }), true);
    assert.strictEqual(fallbackToV1({ V2_FALLBACK: "nonsense" }), true);
  });

  void (async () => {
    await Promise.all(pending);
    console.log(`\n${passed} passed, ${failed} failed\n`);
    if (failures.length) for (const f of failures) console.log(`  ✗ ${f}`);
    if (failed) process.exit(1);
  })();
}

main();
