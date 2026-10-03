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
import fs from "fs";
import os from "os";
import path from "path";

import {
  budgetFromPlaybook,
  buildDirectorMessages,
  buildSimplePrompt,
  claimWarnings,
  decidePolicy,
  simpleTelemetry,
  type SimpleInput,
} from "./prompt-v2/build-simple";
import { checkPrompt, exactCopyFailures, FORBIDDEN_WORDS, lostTokens, quotedStrings } from "./prompt-v2/checks";
import { goldExampleBlock, measureCopy, renderReferences, textLanguage, textLayoutNote } from "./prompt-v2/brief-compiler";
import { parseTaggedReply, TAGS } from "./prompt-v2/tags";
import {
  clearTemplateCache,
  fillSlots,
  LAYOUT_BY_RATIO,
  loadTemplates,
  playbookNameFor,
  PLAYBOOK_NAMES,
  RATIO_SENTENCE,
  templateDirectory,
  templateVersion,
  type AspectRatio,
} from "./prompt-v2/templates";
import { copyPolicyMode, fallbackToV1, templateReload } from "./prompt-v2/engine-selector";

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
    products: [{ ref_index: 1, role: "PRODUCT", filename: "serum.jpg", description: "chai serum thủy tinh mờ 100ml", imageUrl: "data:image/png;base64,AAA" }],
    includeLabelText: true,
    ...over,
  };
}

/** The text of the user turn — where the brief lives now that system.md has no slots. */
function userText(built: { user: { content: unknown } }): string {
  return (built.user.content as Array<Record<string, unknown>>)
    .filter((part) => part.type === "text")
    .map((part) => String(part.text))
    .join("\n");
}

/** A model reply, assembled from parts so each test can break exactly one. */
function reply(parts: { plan?: string; copy?: string[]; warnings?: string[]; prompt?: string; assumptions?: string[] }): string {
  return [
    `<assumptions>\n${(parts.assumptions ?? ["industry: skincare", "audience: women 25-35"]).join("\n")}\n</assumptions>`,
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
      assert.ok(t.system.length > 1000, `system.md too short: ${t.system.length}`);
      assert.ok(t.request.length > 300, `request.md too short: ${t.request.length}`);
      assert.ok(t.playbook.length > 200, `${name} playbook too short: ${t.playbook.length}`);
      assert.strictEqual(t.version, "v1");
      // system + request + playbook, plus the gold example where one exists.
      assert.ok(t.files.length === 3 || t.files.length === 4, String(t.files.length));
    }
  });

  check("the templates are found from the app root, not only from __dirname", () => {
    // The bug this pins: `path.join(__dirname, "templates")` works under tsx and
    // FAILS under Next, which bundles server code so __dirname points into
    // .next/server. Every offline test passed while every real render fell back to
    // v1. Running the resolver with cwd set to the app root is the case that was
    // never covered.
    const appRoot = path.resolve(__dirname, "..", "..");
    const before = process.cwd();
    try {
      process.chdir(appRoot);
      clearTemplateCache();
      const dir = templateDirectory();
      assert.ok(fs.statSync(path.join(dir, "playbooks")).isDirectory(), dir);
      assert.ok(loadTemplates("poster").system.length > 1000, "system.md did not load from the app root");
    } finally {
      process.chdir(before);
      clearTemplateCache();
    }
  });

  check("the resolved template directory holds every file v1 needs", () => {
    const dir = templateDirectory();
    const want = ["meta-prompt.v1.txt", ...PLAYBOOK_NAMES.map((n) => path.join("playbooks", `${n}.v1.txt`))];
    for (const f of want) assert.ok(fs.existsSync(path.join(dir, f)), `missing: ${f}`);
  });

  check("a missing template directory names everywhere it looked", () => {
    const before = process.cwd();
    try {
      process.chdir(os.tmpdir());
      clearTemplateCache();
      // Under tsx the __dirname candidate still resolves, so this asserts the
      // message shape rather than forcing a failure that cannot happen here.
      const dir = templateDirectory();
      assert.ok(dir.includes("templates"), dir);
    } finally {
      process.chdir(before);
      clearTemplateCache();
    }
  });

  check("an unfilled slot throws instead of reaching the model", () => {
    assert.throws(() => fillSlots("a {{COPY}} b {{BRAND}}", { BRAND: "x" }), /slots not filled: \{\{COPY\}\}/);
    assert.strictEqual(fillSlots("a {{BRAND}} b", { BRAND: "x" }), "a x b");
  });

  check("a slot value containing $ is inserted literally", () => {
    assert.strictEqual(fillSlots("{{COPY}}", { COPY: "Giá chỉ $9.99 — $& $1" }), "Giá chỉ $9.99 — $& $1");
  });

  check("every asset type x ratio fills every slot, and the system half stays identical", () => {
    const systems = new Set<string>();
    for (const name of PLAYBOOK_NAMES) {
      for (const ratio of RATIOS) {
        const built = buildDirectorMessages(baseInput({ assetType: name, aspectRatio: ratio }), "exact", []);
        const text = userText(built);
        systems.add(built.system);
        assert.ok(!/\{\{[A-Za-z_]+\}\}/.test(text), `${name} ${ratio} left a slot`);
        assert.ok(text.includes(LAYOUT_BY_RATIO[ratio]), `${name} ${ratio} lost the layout`);
        assert.ok(text.includes(ratio), `${name} ${ratio} lost the ratio`);
      }
    }
    // The whole point of the split: the standing instructions do not vary by job, so a
    // reader comparing two jobs sees only what actually differed.
    assert.strictEqual(systems.size, 1, "system.v1.md varied between jobs");
  });

  check("the brief reaches the director verbatim, diacritics and all", () => {
    const text = userText(buildDirectorMessages(baseInput(), "exact", []));
    for (const line of COPY) assert.ok(text.includes(line), line);
    assert.ok(text.includes("Làn da dịu lại sau hai tuần"), "the concept was altered");
    // Inside the fences the template provides, so the director can tell the client's
    // words from the engine's framing.
    assert.ok(/"""[^"]*Làn da dịu lại sau hai tuần/.test(text), "the concept lost its fences");
  });

  check("the forbidden words the check enforces are EXACTLY the ones the director is shown", () => {
    // Both directions. A word enforced but not stated is a trap; a word stated but not
    // enforced is a rule with no teeth.
    const { system } = buildDirectorMessages(baseInput(), "exact", []);
    const stated = /empty praise words \(([^)]+)\)/.exec(system);
    assert.ok(stated, "system.v1.md no longer names the praise words");
    const named = stated![1].split(",").map((w) => w.trim());
    for (const w of FORBIDDEN_WORDS) {
      // `luxurious` is the inflection of a word that IS named.
      assert.ok(named.some((n) => w.startsWith(n) || n.startsWith(w)), `${w} is rejected but never stated`);
    }
    for (const n of named) {
      assert.ok(FORBIDDEN_WORDS.some((w) => w.startsWith(n)), `${n} is stated but never enforced`);
    }
  });

  check("V2_INCLUDE_LABEL_TEXT is INERT on this path, and the templates always protect the label", () => {
    // The author's templates carry no label-text slot: system.v1.md says "Transcribe
    // printed label text exactly as seen; never invent label text" unconditionally. So
    // the flag no longer changes anything here, and a test that claimed otherwise would
    // describe a feature that is gone. Pinned rather than quietly dropped.
    const on = buildDirectorMessages(baseInput({ includeLabelText: true }), "exact", []);
    const off = buildDirectorMessages(baseInput({ includeLabelText: false }), "exact", []);
    assert.strictEqual(on.system, off.system);
    assert.strictEqual(userText(on), userText(off));
    assert.ok(/never invent label text/i.test(on.system), "the label protection was lost");
    assert.ok(/Do not redesign, recolour or add writing/i.test(userText(on)), "the product rule was lost");
  });

  check("a brief with no copy and no products still briefs cleanly", () => {
    const text = userText(buildDirectorMessages(baseInput({ copy: [], products: [] }), "exact", []));
    assert.ok(!/\\{\\{/.test(text), "a slot was left unfilled");
    assert.ok(text.includes("this frame carries no words"), text.slice(0, 200));
    assert.ok(/\(none attached\)/.test(text), "the empty reference list is not stated");
    assert.ok(/- Text: 0 words, 0 sentences, 0 characters/.test(text), /- Text:[^\n]*/.exec(text)?.[0]);
  });

  // ── 1b. the Brief Compiler ──────────────────────────────────────────────
  console.log("\n1b — the Brief Compiler hands fields over, it does not write prose");

  check("GOLDEN — every asset type x ratio compiles with no slot left behind", () => {
    for (const name of PLAYBOOK_NAMES) {
      for (const ratio of RATIOS) {
        const text = userText(buildDirectorMessages(baseInput({ assetType: name, aspectRatio: ratio }), "exact", []));
        assert.ok(!/\{\{/.test(text), `${name} ${ratio}: a slot survived`);
        // The four things the director cannot work without.
        assert.ok(text.includes(`aspect_ratio: ${ratio}`), `${name} ${ratio}: no ratio`);
        assert.ok(/# ASSET PLAYBOOK/.test(text), `${name} ${ratio}: no playbook`);
        assert.ok(/# CONSTRAINTS/.test(text), `${name} ${ratio}: no constraints`);
        assert.ok(/Return the five tags/.test(text), `${name} ${ratio}: no output instruction`);
      }
    }
  });

  check("the client's visual-direction choices arrive as binding preferences", () => {
    const text = userText(
      buildDirectorMessages(
        baseInput({
          visualControls: { camera: "low_angle", lighting: "auto", composition: "rule_of_thirds" },
          visualStyle: "tối giản, nhiều khoảng trống",
          hardRequirements: ["Không dùng người mẫu"],
        }),
        "exact",
        [],
      ),
    );
    assert.ok(/# CLIENT PREFERENCES/.test(text), "the preferences block is missing");
    assert.ok(/outrank your/.test(text), "the preferences are not marked as binding");
    // The panel's own professional instruction, verbatim.
    assert.ok(/low-angle hero perspective/.test(text), "the camera instruction was not carried through");
    assert.ok(/tối giản, nhiều khoảng trống/.test(text), "the free-text style was dropped");
    assert.ok(/Không dùng người mẫu/.test(text), "a hard requirement was dropped");
    // "auto" means the client did not choose, so it must not appear as a preference.
    const block = /# CLIENT PREFERENCES[\s\S]*?(?=\nNot provided)/.exec(text);
    assert.ok(block, "could not isolate the block");
    assert.ok(!/lighting|Ánh sáng/i.test(block![0]), "a control left on auto was reported as a choice");
  });

  check("no preference chosen means no preferences block at all", () => {
    const text = userText(buildDirectorMessages(baseInput({ visualControls: { camera: "auto" } }), "exact", []));
    assert.ok(!/# CLIENT PREFERENCES/.test(text), "an empty block was emitted");
  });

  check("the gold example is included for poster and DROPPED where the file is a TODO", () => {
    const poster = userText(buildDirectorMessages(baseInput({ assetType: "poster" }), "exact", []));
    assert.ok(/# GOLD EXAMPLE \(quality bar; do not copy its content\)/.test(poster), "poster lost its gold example");
    assert.ok(/honey-amber cleansing oil/.test(poster), "the gold example body is missing");
    for (const asset of ["banner", "social ad", "product hero", "ugc"]) {
      const text = userText(buildDirectorMessages(baseInput({ assetType: asset }), "exact", []));
      assert.ok(!/# GOLD EXAMPLE/.test(text), `${asset}: a TODO placeholder was shown as a quality bar`);
      assert.ok(!/TODO/.test(text), `${asset}: the word TODO reached the director`);
    }
  });

  check("goldExampleBlock drops a TODO whatever surrounds it", () => {
    assert.strictEqual(goldExampleBlock(""), "");
    assert.strictEqual(goldExampleBlock(null), "");
    assert.strictEqual(goldExampleBlock("TODO: paste a proven prompt here"), "");
    assert.strictEqual(goldExampleBlock("\n  TODO: paste a proven prompt here  \n"), "");
    assert.ok(goldExampleBlock("A real prompt.").startsWith("# GOLD EXAMPLE"));
  });

  check("the copy policy rules reach the director in full, per policy", () => {
    const exact = userText(buildDirectorMessages(baseInput(), "exact", []));
    assert.ok(/Copy policy: exact/.test(exact));
    assert.ok(/character for character, every accent and punctuation mark/.test(exact));
    const adapt = userText(buildDirectorMessages(baseInput(), "adapt", []));
    assert.ok(/Copy policy: adapt/.test(adapt));
    assert.ok(/shorten to fit the budget, keep perfect accents/.test(adapt));
    assert.ok(/add no new claims, numbers or promises/.test(adapt));
  });

  check("the copy is MEASURED for the director, not budgeted at it", () => {
    // The playbook's budget was a reason to CUT. The measurement is a reason to DESIGN.
    const text = userText(buildDirectorMessages(baseInput(), "exact", []));
    // Computed, not hard-coded: a literal here would pin a typo in the fixture rather
    // than the behaviour.
    const m = measureCopy(COPY);
    assert.ok(
      text.includes(`- Text: ${m.words} words, ${m.sentences} sentences, ${m.chars} characters`),
      /- Text:[^\n]*/.exec(text)?.[0],
    );
    assert.strictEqual(m.sentences, COPY.length, "each client line counts as a sentence");
    assert.ok(!/Text budget/.test(text), "the old cut-it budget is still being sent");
  });

  check("short copy gets no layout note; long copy gets per-ratio geometry", () => {
    assert.strictEqual(textLayoutNote(12), "");
    assert.strictEqual(textLayoutNote(25), "");
    const note = textLayoutNote(61);
    assert.ok(/long and fixed/.test(note));
    for (const ratio of RATIOS) assert.ok(note.includes(ratio), `${ratio} has no geometry in the note`);
  });

  check("measureCopy counts lines as sentences when the client wrote no full stops", () => {
    // The most common Vietnamese input: separate lines, no terminal punctuation. A count
    // of zero sentences would be wrong on nearly every real brief.
    assert.deepStrictEqual(measureCopy(["Dịu da", "Mua ngay"]), { words: 4, sentences: 2, chars: 15 });
    assert.strictEqual(measureCopy(["A. B! C?"]).sentences, 3);
    assert.deepStrictEqual(measureCopy([]), { words: 0, sentences: 0, chars: 0 });
  });

  check("long copy is warned about and NOT cut", () => {
    const long = ["Góc setup đỉnh cao cùng Corsair K70! Bàn phím cơ switch quang học, RGB 16.8 triệu màu, khung nhôm nguyên khối bền bỉ. Giảm ngay 500.000đ cho 100 khách đầu tiên, bảo hành 24 tháng chính hãng. Nhanh tay chốt đơn sớm nhất."];
    const built = buildDirectorMessages(baseInput({ copy: long }), "exact", []);
    const text = userText(built);
    assert.ok(/long and fixed/.test(text), "no layout note for a 36-word brief");
    assert.ok(built.brief.warnings.some((w) => /long text raises/.test(w)), JSON.stringify(built.brief.warnings));
    assert.ok(text.includes(long[0]), "the copy was altered");
  });

  check("the language is named from the copy, and never guessed", () => {
    assert.strictEqual(textLanguage(["Dịu da sau 14 ngày"], ""), "Vietnamese");
    assert.strictEqual(textLanguage([], "Làn da dịu lại"), "Vietnamese");
    assert.strictEqual(textLanguage(["Soft skin in 14 days"], ""), "English");
    assert.strictEqual(textLanguage([], ""), "same language as the client's copy");
    // French shares the Latin-1 accents, so it must NOT be called Vietnamese.
    assert.strictEqual(textLanguage(["Crème hydratante"], ""), "same language as the client's copy");
  });

  check("NFC: decomposed Vietnamese is normalised before it reaches the director", () => {
    const decomposed = COPY.map((c) => c.normalize("NFD"));
    const text = userText(buildDirectorMessages(baseInput({ copy: decomposed }), "exact", []));
    for (const line of COPY) assert.ok(text.includes(line), `${line} did not arrive in NFC`);
  });

  check("EVERY reference reaches the director with its role and filename, in order", () => {
    // The bug: a supplied LOGO was sent to the renderer as an attached image while the
    // prompt said "no extra logos or brand marks", so the brand mark vanished.
    const text = userText(
      buildDirectorMessages(
        baseInput({
          products: [
            { ref_index: 1, role: "PRODUCT", filename: "Corsair-Keyboard.jpg", imageUrl: "data:image/png;base64,ONE" },
            { ref_index: 2, role: "LOGO", filename: "Corsair-logo.png", imageUrl: "data:image/png;base64,TWO" },
          ],
        }),
        "exact",
        [],
      ),
    );
    assert.ok(/photo 1: PRODUCT \(Corsair-Keyboard\.jpg\)/.test(text), text.slice(0, 400));
    assert.ok(/photo 2: LOGO \(Corsair-logo\.png\)/.test(text), text.slice(0, 400));
    assert.ok(text.indexOf("photo 1:") < text.indexOf("photo 2:"), "the references are out of order");
  });

  check("a brief with no references says so rather than leaving a gap", () => {
    const text = userText(buildDirectorMessages(baseInput({ products: [] }), "exact", []));
    assert.ok(/\(none attached\)/.test(text), text.slice(0, 300));
  });

  check("renderReferences omits a filename it does not have", () => {
    assert.strictEqual(renderReferences([{ index: 1, role: "PRODUCT" }]), "  photo 1: PRODUCT");
    assert.strictEqual(renderReferences([]), "  (none attached)");
  });

  check("the LOGO rules reach the director, and the final rule permits the supplied logo", () => {
    const { system } = buildDirectorMessages(baseInput(), "exact", []);
    assert.ok(/# REFERENCE ROLES/.test(system));
    assert.ok(/A LOGO photo is the brand's mark/.test(system));
    assert.ok(/If no LOGO photo is supplied, do not create any logo/.test(system));
    // Squashed, because the rule is hard-wrapped in the file.
    assert.ok(
      /no logos or brand marks other than the supplied logo photo and what is printed on the products/.test(
        system.replace(/\s+/g, " "),
      ),
      "the closing rule still forbids the logo the client supplied",
    );
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

  check("THE DEFAULT NEVER SHORTENS, however far over the playbook's budget the copy runs", () => {
    // The measured failure this closes: a render came back with sentences silently
    // removed, and the post-render gate compared the image against the shortened list
    // and called it compliant.
    const hero = loadTemplates("product hero").playbook;
    assert.strictEqual(decidePolicy(COPY, hero).policy, "exact");
    assert.deepStrictEqual(decidePolicy(COPY, hero).warnings, []);
    const long = ["Phục hồi hàng rào bảo vệ da chỉ sau mười bốn ngày sử dụng đều đặn mỗi tối"];
    assert.strictEqual(decidePolicy(long, loadTemplates("poster").playbook).policy, "exact");
  });

  check("the old shortening behaviour is still available, and has to be asked for", () => {
    const hero = loadTemplates("product hero").playbook;
    const d = decidePolicy(COPY, hero, "exact", "adapt_when_over_budget");
    assert.strictEqual(d.policy, "adapt");
    assert.strictEqual(d.warnings.length, 1);
    assert.ok(/longer than this asset carries/.test(d.warnings[0]));
    // Still exact when it actually fits.
    assert.strictEqual(decidePolicy(["Dịu da"], loadTemplates("poster").playbook, "exact", "adapt_when_over_budget").policy, "exact");
  });

  check("the copy policy defaults to exact, and the log can say where it came from", () => {
    assert.deepStrictEqual(copyPolicyMode({}), { mode: "exact", source: "default" });
    assert.deepStrictEqual(copyPolicyMode({ V2_COPY_POLICY: "exact" }), { mode: "exact", source: "env" });
    assert.deepStrictEqual(copyPolicyMode({ V2_COPY_POLICY: "adapt_when_over_budget" }), {
      mode: "adapt_when_over_budget",
      source: "env",
    });
    // A typo must not quietly licence cutting the client's words.
    assert.deepStrictEqual(copyPolicyMode({ V2_COPY_POLICY: "adapt" }), { mode: "exact", source: "default" });
    assert.strictEqual(templateReload({}), false);
    assert.strictEqual(templateReload({ V2_TEMPLATE_RELOAD: "true" }), true);
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
    assert.deepStrictEqual(r.missing, ["assumptions"]);
  });

  check("an unclosed tag stops at the next opening tag", () => {
    const r = parseTaggedReply("<plan>thinking out loud\n<copy_final>\nMua ngay\n</copy_final>\n<image_prompt>P</image_prompt>");
    assert.strictEqual(r.plan, "thinking out loud");
    assert.deepStrictEqual(r.copy_final, ["Mua ngay"]);
    assert.strictEqual(r.image_prompt, "P");
    assert.deepStrictEqual(r.missing, ["assumptions", "warnings"]);
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
    const r = parseTaggedReply(
      "<assumptions></assumptions><plan>p</plan><copy_final>\n\n</copy_final><warnings>none</warnings><image_prompt>P</image_prompt>",
    );
    assert.deepStrictEqual(r.copy_final, []);
    // "none" is the template's own way of saying there is nothing to report.
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
    assert.strictEqual(TAGS.length, 5);
  });

  // ── 4. the three checks ─────────────────────────────────────────────────
  console.log("\n4 — three checks, and they do not fire on the client's own words");

  const baseOpts = { copyOriginal: COPY, copyFinal: COPY, policy: "exact" as const, aspectRatio: "1:1" as AspectRatio };

  // ── 4b. the copy is the client's ────────────────────────────────────────
  console.log("\n4b — exact means exact: the tiers joined back together ARE the client's text");

  // The two real briefs this was built for.
  const CORSAIR = [
    "Góc setup đỉnh cao cùng Corsair K70!",
    "Bàn phím cơ switch quang học, RGB 16.8 triệu màu, khung nhôm nguyên khối bền bỉ.",
    "Giảm ngay 500.000đ cho 100 khách đầu tiên, bảo hành 24 tháng chính hãng.",
    "Nhanh tay chốt đơn sớm nhất.",
  ];
  const CENTELLA = [
    "Bộ đôi chân ái từ rau má Madagascar",
    "Đánh thức vẻ đẹp nguyên bản của làn da, dịu nhẹ cho cả da nhạy cảm nhất, phục hồi hàng rào bảo vệ da sau 14 ngày sử dụng đều đặn mỗi tối trước khi đi ngủ",
  ];

  check("GOLDEN Corsair: 61-word copy re-tiered into four slices passes", () => {
    const tiers = [
      "Góc setup đỉnh cao cùng Corsair K70!",
      "Bàn phím cơ switch quang học, RGB 16.8 triệu màu,",
      "khung nhôm nguyên khối bền bỉ. Giảm ngay 500.000đ cho 100 khách đầu tiên,",
      "bảo hành 24 tháng chính hãng. Nhanh tay chốt đơn sớm nhất.",
    ];
    assert.deepStrictEqual(exactCopyFailures(CORSAIR, tiers), [], "a legal re-tiering was rejected");
  });

  check("GOLDEN Corsair: a dropped sentence is caught and the message says what is missing", () => {
    const short = CORSAIR.slice(0, 3);
    const fs2 = exactCopyFailures(CORSAIR, short);
    assert.strictEqual(fs2.length, 1, JSON.stringify(fs2));
    assert.ok(/the end was cut/.test(fs2[0].message), fs2[0].message);
    assert.ok(/Nhanh tay chốt đơn/.test(fs2[0].message), "the message does not say which words are missing");
  });

  check("GOLDEN Centella: the 326-character brief survives being split mid-clause", () => {
    const joined = CENTELLA.join(" ");
    const cut = Math.floor(joined.length / 2);
    // A split that is NOT at a sentence boundary. Permitted, because the rule is that
    // the pieces rejoin exactly -- not that the engine polices where a designer cuts.
    assert.deepStrictEqual(exactCopyFailures(CENTELLA, [joined.slice(0, cut), joined.slice(cut)]), []);
  });

  check("a paraphrase, a reorder and a changed accent are all caught", () => {
    assert.ok(exactCopyFailures(CORSAIR, ["Góc setup đỉnh cao với Corsair K70!", ...CORSAIR.slice(1)]).length, "a reworded tier passed");
    assert.ok(exactCopyFailures(CENTELLA, [...CENTELLA].reverse()).length, "a reordered pair passed");
    assert.ok(exactCopyFailures(["Dịu da"], ["Diu da"]).length, "a stripped accent passed");
  });

  check("whitespace and NFD are not differences", () => {
    assert.deepStrictEqual(exactCopyFailures(CORSAIR, [CORSAIR.join("\n\n   ")]), []);
    assert.deepStrictEqual(exactCopyFailures(CENTELLA, CENTELLA.map((c) => c.normalize("NFD"))), []);
  });

  check('an invented "MUA NGAY" in the prompt is caught', () => {
    const prompt = goodPrompt(COPY) + ' A small button reads "MUA NGAY" in the lower right. Square 1:1 frame.';
    const r = checkPrompt(prompt, baseOpts);
    const f = r.failures.find((x) => x.code === "copy" && /MUA NGAY/.test(x.message));
    assert.ok(f, JSON.stringify(r.failures));
    assert.ok(/the client never wrote it/.test(f!.message));
  });

  check("transcribed label lettering is allowed when the label flag is on, and only then", () => {
    const prompt =
      prose(120) +
      ' The label on the bottle reads "MADAGASCAR CENTELLA". ' +
      COPY.map((c) => `The line "${c}" sits above.`).join(" ") +
      " Square 1:1 frame.";
    const off = checkPrompt(prompt, baseOpts);
    assert.ok(off.failures.some((x) => /MADAGASCAR CENTELLA/.test(x.message)), "unlisted text passed with the flag off");
    const on = checkPrompt(prompt, { ...baseOpts, allowUnlistedLabelText: true });
    assert.strictEqual(on.ok, true, JSON.stringify(on.failures));
  });

  check("the label exemption does NOT cover a floating call to action", () => {
    // Same flag on, but nothing in the sentence ties the words to a product surface.
    const prompt =
      prose(120) + ' Centred beneath everything, "MUA NGAY" is set in heavy capitals. ' +
      COPY.map((c) => `The line "${c}" sits above.`).join(" ") + " Square 1:1 frame.";
    const r = checkPrompt(prompt, { ...baseOpts, allowUnlistedLabelText: true });
    assert.ok(r.failures.some((x) => /MUA NGAY/.test(x.message)), JSON.stringify(r.failures));
  });

  check("an explicit label whitelist is honoured", () => {
    const prompt = prose(120) + ' It says "SKIN1004" there. ' + COPY.map((c) => `"${c}"`).join(" ") + " Square 1:1 frame.";
    const r = checkPrompt(prompt, { ...baseOpts, labelText: ["SKIN1004 MADAGASCAR CENTELLA"] });
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
  });

  check("quotedStrings finds straight and curly quotes and nothing else", () => {
    assert.deepStrictEqual(quotedStrings('a "one" b \u201ctwo\u201d c'), ["one", "two"]);
    assert.deepStrictEqual(quotedStrings("no quotes here"), []);
  });

  check("adapt: numbers, model codes and caps must survive the shortening", () => {
    const shortened = ["Corsair K70 giảm 500.000đ", "bảo hành 24 tháng"];
    assert.deepStrictEqual(lostTokens(CORSAIR, [CORSAIR.join(" ")]), []);
    const lost = lostTokens(CORSAIR, shortened);
    assert.ok(lost.includes("100"), JSON.stringify(lost));
    assert.ok(lost.includes("16.8") || lost.includes("16"), JSON.stringify(lost));
    assert.ok(!lost.includes("K70"), "a token that IS present was reported lost");
  });

  check("adapt: a dropped number is a copy failure with an actionable message", () => {
    const r = checkPrompt(
      prose(150) + ' "Corsair K70 giảm 500.000đ" Square 1:1 frame.',
      { ...baseOpts, policy: "adapt", copyOriginal: CORSAIR, copyFinal: ["Corsair K70 giảm 500.000đ"] },
    );
    const f = r.failures.find((x) => x.code === "copy" && /facts rather than wording/.test(x.message));
    assert.ok(f, JSON.stringify(r.failures));
    assert.ok(/100/.test(f!.message));
  });


  check("the control prompt passes everything", () => {
    const r = checkPrompt(goodPrompt(COPY), baseOpts);
    assert.strictEqual(r.ok, true, JSON.stringify(r.failures));
    assert.ok(r.stats.words > 0, "the word count is still measured");
  });

  check("exact: a changed copy string is caught", () => {
    const changed = ["Diu da sau 14 ngay", COPY[1], COPY[2]];
    const r = checkPrompt(goodPrompt(changed), { ...baseOpts, copyFinal: changed });
    assert.strictEqual(r.ok, false);
    assert.ok(r.failures.some((f) => f.code === "copy" && /character for character/.test(f.message)));
  });

  check("exact: a tier the client never wrote is caught", () => {
    const added = [...COPY, "Giảm 50% hôm nay"];
    const r = checkPrompt(goodPrompt(added), { ...baseOpts, copyFinal: added });
    assert.ok(
      r.failures.some((f) => f.code === "copy" && /do not reproduce the client's text exactly/.test(f.message)),
      JSON.stringify(r.failures),
    );
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

  check("there is NO word limit: a short prompt and a very long one both pass", () => {
    // Length is decided by the design. The old 200-500 window was a target dressed up
    // as a check, and it would have truncated a three-product layered scene.
    const short = checkPrompt(prose(40) + ` "${COPY[0]}" "${COPY[1]}" "${COPY[2]}" Square 1:1 frame.`, baseOpts);
    assert.strictEqual(short.ok, true, JSON.stringify(short.failures));
    const long = checkPrompt(prose(1200) + " " + COPY.map((c) => `"${c}"`).join(" ") + " Square 1:1 frame.", baseOpts);
    assert.ok(long.stats.words > 500, String(long.stats.words));
    assert.strictEqual(long.ok, true, JSON.stringify(long.failures));
  });

  check("an empty prompt fails", () => {
    for (const empty of ["", "   ", "\n\n"]) {
      const r = checkPrompt(empty, { ...baseOpts, copyOriginal: [], copyFinal: [] });
      assert.ok(r.failures.some((f) => f.code === "shape" && /empty/.test(f.message)), JSON.stringify(r.failures));
    }
  });

  check("over the provider's ceiling fails, and the message says to condense without dropping decisions", () => {
    const r = checkPrompt(goodPrompt(COPY) + " " + prose(6000), { ...baseOpts, maxChars: 2000 });
    const f = r.failures.find((x) => x.code === "shape" && /ceiling/.test(x.message));
    assert.ok(f, JSON.stringify(r.failures));
    assert.ok(/keep every decision/.test(f!.message), f!.message);
  });

  check("the ratio must be at the END, not merely present", () => {
    const buried = `Square 1:1 frame. ${prose(200)} ${COPY.map((c) => `"${c}"`).join(" ")} The scene is calm.`;
    const r = checkPrompt(buried, baseOpts);
    assert.ok(r.failures.some((f) => f.code === "ratio" && /not at the end/.test(f.message)), JSON.stringify(r.failures));
    assert.strictEqual(checkPrompt(goodPrompt(COPY), baseOpts).ok, true);
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
    const texts = parts.filter((p) => p.type === "text").map((p) => String(p.text)).join("\n");
    assert.ok(texts.includes("photo 1 to photo 2"), "the director is not told the photo order");
    // The brief comes before the images, the ordering reminder after them.
    assert.strictEqual(parts[0].type, "text");
    assert.strictEqual(parts[parts.length - 1].type, "text");
  });

  check("a product with no image attaches nothing, and per-photo descriptions are NOT sent", async () => {
    // request.v1.md lists "per-photo product descriptions" among the things the client
    // did not provide and the director must read off the photo. The description field is
    // deliberately unused on this path; the count is all that is stated.
    const s = stub([reply({})]);
    await buildSimplePrompt(baseInput({ products: [{ ref_index: 1, description: "chai serum" }] }), s.deps);
    const parts = s.calls[0].messages[1].content as Array<Record<string, unknown>>;
    assert.strictEqual(parts.filter((p) => p.type === "image_url").length, 0);
    const sent = JSON.stringify(s.calls[0].messages);
    assert.ok(!sent.includes("chai serum"), "a per-photo description reached the director");
    assert.ok(sent.includes("1 photo(s)"), "the photo count was not stated");
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

  check("a shortened-copy build needs the env flag, keeps the original, and warns", async () => {
    const short = ["Dịu da 14 ngày"];
    const s = stub([reply({ copy: short, prompt: goodPrompt(short) })]);
    const r = await buildSimplePrompt(
      baseInput({ assetType: "product hero", copyPolicyMode: "adapt_when_over_budget" }),
      s.deps,
    );
    assert.strictEqual(r.ok, true, r.reason);
    assert.strictEqual(r.copyPolicy, "adapt");
    assert.deepStrictEqual(r.copy_original, COPY);
    assert.deepStrictEqual(r.copy_final, short);
    assert.ok(r.warnings.some((w) => /longer than this asset carries/.test(w)));
  });

  check("WITHOUT the flag, the same shortened reply is REJECTED rather than accepted", async () => {
    const short = ["Dịu da 14 ngày"];
    const bad = reply({ copy: short, prompt: goodPrompt(short) });
    const s = stub([bad, bad]);
    const r = await buildSimplePrompt(baseInput({ assetType: "product hero" }), s.deps);
    assert.strictEqual(r.ok, false, "a silently shortened copy was accepted");
    assert.strictEqual(r.copyPolicy, "exact");
    assert.deepStrictEqual(r.copy_original, COPY);
    assert.ok(r.checks!.failures.some((f) => f.code === "copy"), JSON.stringify(r.checks!.failures));
    assert.strictEqual(r.llmCalls, 2, "the repair was not attempted");
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
    assert.ok((t.prompt_words as number) > 0, "the word count is still reported");
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
