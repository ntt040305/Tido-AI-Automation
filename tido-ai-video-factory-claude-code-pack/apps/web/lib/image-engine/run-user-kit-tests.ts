import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * The creative memory attached to a person.
 *
 * Credentials are no longer tested here: Firebase owns identity now, and the
 * custom password and session code this file used to cover has been deleted.
 * What remains is the half that is still ours -- isolation between one
 * person's memory and another's, and the rule that memory ASSISTS and never
 * CONTROLS.
 *
 * That rule is the load-bearing one. An observed preference must stay beneath
 * the current brief, and something the system merely noticed must never be
 * able to present itself as something the user said.
 *
 * Paths are redirected to a temp directory before anything is imported, so a
 * run of this suite cannot read or write a real person's kit.
 */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "tido-kit-"));
process.env.TIDO_KITS_PATH = path.join(TMP, "kits");

/* eslint-disable @typescript-eslint/no-var-requires */
const { emptyKit, recordPreference, preferenceDecisions, summarizeUserKit } = require("./evolution/experiment/UserKit");
const { extractPreferences, learnFromSignal, APPROVAL_KINDS } = require("./evolution/experiment/UserKitLearning");
const { fileKitStore, loadOrCreateKit } = require("../user-kit/kit-store");

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log("\nA kit belongs to exactly one person");

check("A kit round-trips through the store", () => {
  const uid = "aaaaaaaa-1111-2222-3333-444444444444";
  let kit = emptyKit(uid);
  kit = recordPreference(kit, { area: "visual", value: "cinematic", stated: true, occurrences: 1, negative: false });
  fileKitStore.save(kit);
  const back = fileKitStore.load(uid);
  assert.strictEqual(back.preferences.length, 1);
  assert.strictEqual(back.preferences[0].value, "cinematic");
});

check("One user cannot read another's kit", () => {
  const a = "aaaaaaaa-1111-2222-3333-444444444444";
  const b = "bbbbbbbb-5555-6666-7777-888888888888";
  assert.ok(fileKitStore.load(a), "the first kit vanished");
  assert.strictEqual(fileKitStore.load(b), null, "a second user read the first user's memory");
});

check("A path-traversing id cannot escape the kits directory", () => {
  // The id now arrives from a verified Firebase token, so it should always be
  // a well-formed uid. It is still untrusted at this layer, because a `..`
  // here is a read of any file on the machine.
  assert.strictEqual(fileKitStore.load("../../../../etc/passwd"), null);
  assert.strictEqual(fileKitStore.load("a/b"), null);
  fileKitStore.save({ user_id: "../escape", preferences: [], observed_runs: 0 });
  assert.ok(!fs.existsSync(path.join(TMP, "..", "escape.json")), "a kit was written outside its directory");
});

check("A new user starts with an empty kit rather than nothing", () => {
  const kit = loadOrCreateKit("11111111-2222-3333-4444-555555555555");
  assert.strictEqual(kit.preferences.length, 0);
  assert.strictEqual(kit.observed_runs, 0);
});

console.log("\nMemory assists; it never controls");

const INTELLIGENCE = {
  selected_direction: "morning ritual",
  visual_strategy: { what: "low warm light", why: "because" },
  typography_reasoning: { what: "quiet, set small" },
  layout_reasoning: {
    what: "Centred intimacy framed by quiet breathable space that mirrors the mental calm the product is selling to a commuter.",
  },
};

check("Only acts of approval teach anything", () => {
  // The brief is explicit: do not learn from every generation. A render nobody
  // kept is not a preference.
  assert.deepStrictEqual([...APPROVAL_KINDS].sort(), [
    "approve", "download", "favorite", "repeat_edit", "save",
  ]);
  const before = emptyKit("u1");
  const r = learnFromSignal(before, { kind: "viewed" as any, generation_id: "g", at: "", intelligence: INTELLIGENCE });
  assert.strictEqual(r.kit.observed_runs, 0, "an unrecognised event was learned from");
  assert.strictEqual(r.learned, 0);
});

check("A download teaches, and what it teaches is observed not stated", () => {
  const r = learnFromSignal(emptyKit("u1"), {
    kind: "download", generation_id: "g", at: "", intelligence: INTELLIGENCE,
  });
  assert.ok(r.learned > 0, "a download taught nothing");
  for (const p of r.kit.preferences) {
    assert.strictEqual(p.stated, false, "something the user never said was recorded as stated");
  }
});

check("An observed preference cannot outrank the user until it recurs", () => {
  // The safety rail. One occurrence is an event, not a preference.
  let kit = learnFromSignal(emptyKit("u1"), {
    kind: "download", generation_id: "g1", at: "", intelligence: INTELLIGENCE,
  }).kit;
  assert.strictEqual(preferenceDecisions(kit).length, 0, "a single render became a standing preference");

  for (const id of ["g2", "g3"]) {
    kit = learnFromSignal(kit, { kind: "download", generation_id: id, at: "", intelligence: INTELLIGENCE }).kit;
  }
  const active = preferenceDecisions(kit);
  assert.ok(active.length > 0, "three repeats still taught nothing");
  for (const a of active) {
    assert.strictEqual(a.decision.derived_from, "strategy", "an observed preference entered at user tier");
    assert.strictEqual(a.decision.confidence, "low", "an inference about a person claimed high confidence");
    assert.ok(/yields to the current brief/.test(a.decision.because), a.decision.because);
  }
});

check("A stated preference does enter at user tier", () => {
  let kit = emptyKit("u2");
  kit = recordPreference(kit, { area: "visual", value: "no plastic AI look", stated: true, occurrences: 1, negative: true });
  const [d] = preferenceDecisions(kit);
  assert.strictEqual(d.decision.derived_from, "user");
  assert.strictEqual(d.decision.confidence, "high");
  assert.ok(/^Avoid: /.test(d.decision.value), d.decision.value);
});

check("Prose is not stored as a preference", () => {
  // A value that cannot recur can never reach the three-occurrence threshold,
  // so storing it would produce a memory that looks like it is learning and
  // is not. It is reported as unextracted instead.
  const r = extractPreferences(INTELLIGENCE);
  const values = r.preferences.map((p: any) => p.value);
  assert.ok(values.includes("morning ritual"), "the short, recurrable value was dropped");
  assert.ok(
    !values.some((v: string) => v.length > 48),
    `a sentence was stored as a preference: ${values.find((v: string) => v.length > 48)}`,
  );
  assert.ok(r.unextracted.length > 0, "the long value was silently discarded rather than reported");
});

check("A correction teaches nothing about what was wanted", () => {
  // That someone edited twice says they were dissatisfied, not what they
  // wanted instead. Reading a preference out of that learns the opposite.
  const r = learnFromSignal(emptyKit("u3"), {
    kind: "repeat_edit", generation_id: "g", at: "", intelligence: INTELLIGENCE,
  });
  assert.strictEqual(r.learned, 0, "a preference was read out of a correction");
  assert.strictEqual(r.kit.observed_runs, 1, "the event was not counted at all");
});

check("An approval with no intelligence records the act and learns nothing", () => {
  const r = learnFromSignal(emptyKit("u4"), { kind: "save", generation_id: "g", at: "", intelligence: null });
  assert.strictEqual(r.learned, 0);
  assert.strictEqual(r.kit.observed_runs, 1);
});

check("The summary describes only what qualified", () => {
  let kit = emptyKit("u5");
  kit = recordPreference(kit, { area: "visual", value: "cinematic", stated: true, occurrences: 1, negative: false });
  const s = summarizeUserKit(kit);
  assert.ok(s && s.includes("cinematic"), `summary was: ${s}`);
  assert.strictEqual(summarizeUserKit(emptyKit("u6")), undefined, "an empty kit produced a summary");
});

console.log("\nThe engine still knows nothing about people");

check("The image engine reaches neither identity nor the database", () => {
  // The property worth keeping: lib/image-engine takes a request and returns
  // a picture. It receives plain data and has no path to an account, a
  // database or an identity provider.
  const walk = (d: string, out: string[] = []): string[] => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) walk(full, out);
      else if (f.name.endsWith(".ts")) out.push(full);
    }
    return out;
  };
  const offenders: string[] = [];
  for (const file of walk(path.join(__dirname, "evolution"))) {
    const code = fs.readFileSync(file, "utf-8");
    if (/from\s+["'].*(identity\/verify|identity\/firebase-admin|db\/client|db\/repositories)["']/.test(code)) offenders.push(path.basename(file));
  }
  assert.deepStrictEqual(offenders, [], `the engine reaches outside its boundary: ${offenders.join(", ")}`);
});

check("Learning is pure and does no I/O", () => {
  const src = fs.readFileSync(path.join(__dirname, "evolution/experiment/UserKitLearning.ts"), "utf-8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of ["fs.", "readFileSync", "writeFileSync", "fetch("]) {
    assert.ok(!code.includes(forbidden), `the learner does I/O: ${forbidden}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
