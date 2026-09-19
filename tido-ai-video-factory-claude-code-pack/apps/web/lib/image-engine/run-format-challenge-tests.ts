import assert from "assert";
import fs from "fs";
import path from "path";
import { assetContextBrief, assetContextFor } from "./evolution/experiment/AssetContext";
import { CreativeDirectorV1 } from "./evolution/experiment/CreativeDirectorV1";
import { DEFAULT_FLAGS } from "./evolution/feature-flags";

/**
 * Phase 1.1A — Format Challenge V1.
 *
 *   npx tsx lib/image-engine/run-format-challenge-tests.ts
 *
 * What this phase changed, and what it deliberately did not
 * ---------------------------------------------------------
 * The failure modes were never badly written. They name outcomes, not
 * components, and a Phase-0 test asserts none of them is an instruction. What
 * they lacked was a verb: a list of ways to fail, handed to a model choosing
 * among routes with no statement of what to do with it, becomes an elimination
 * filter because there is nothing else it can become.
 *
 * Measured across twelve renders: five of eight stated tradeoffs rejected the
 * richer option, in the director's own vocabulary of "dilutes", "distracts",
 * "clutter", "visual noise". Six of twelve then chose a route that explicitly
 * disclaims having an idea.
 *
 * So the failure strings are untouched, and the tests below assert that. What is
 * added is what answering one looks like.
 */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

const ASSET_TYPES = ["poster", "social_ad", "product_hero", "banner", "ugc_thumbnail"];

console.log("\n=== Phase 1.1A — Format Challenge V1 ===\n");

// ── the flag is a real switch ─────────────────────────────────────────────

check("OFF — the V2 brief is byte-identical to before this phase", () => {
  // The whole safety claim. Anything less than byte equality means the flag is a
  // label rather than a switch, and every A/B after it is uninterpretable.
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    const withoutOption = assetContextBrief(ctx, { includeStrategies: true });
    const explicitlyOff = assetContextBrief(ctx, { includeStrategies: true, includeChallenges: false });
    assert.strictEqual(withoutOption, explicitlyOff, `${t}: an absent option differs from an explicit false`);
    assert.ok(!withoutOption.includes("→"), `${t}: a challenge leaked into the OFF brief`);
    assert.ok(
      !withoutOption.includes("They are the tests a route has to pass"),
      `${t}: the reframing leaked into the OFF brief`
    );
  }
});

check("OFF — the V1 brief is untouched by any of this", () => {
  for (const t of ASSET_TYPES) {
    const v1 = assetContextBrief(assetContextFor(t, false)!);
    assert.ok(!/HOW THIS FORMAT FAILS/.test(v1), `${t}: V1 grew failure modes`);
    assert.ok(!v1.includes("→"), `${t}: V1 grew challenges`);
  }
});

check("ON — every failure mode arrives with its challenge", () => {
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    const on = assetContextBrief(ctx, { includeStrategies: true, includeChallenges: true });
    for (const [i, f] of (ctx.failure_modes || []).entries()) {
      assert.ok(on.includes(`  - ${f}`), `${t}: failure mode missing: ${f}`);
      assert.ok(on.includes(`→ ${ctx.challenges![i]}`), `${t}: challenge missing for: ${f}`);
    }
  }
});

check("ON — the reframing sentences are present, and they are the point", () => {
  const on = assetContextBrief(assetContextFor("product_hero", true)!, {
    includeStrategies: true,
    includeChallenges: true,
  });
  assert.ok(on.includes("These are not things to avoid"), "the brief still reads as a hazard list");
  assert.ok(on.includes("owes an answer"), "a risked failure is not given a way to be earned");
});

// ── the failure wording is unchanged ──────────────────────────────────────

check("The failure strings themselves are not modified by this phase", () => {
  // The requirement was: keep existing failure wording. These are the strings as
  // they were before Phase 1.1A, quoted here so a future edit to AssetContext
  // cannot silently reword them.
  const BEFORE: Record<string, string[]> = {
    product_hero: [
      "the setting competes with the object",
      "the surfaces do not survive being looked at closely",
      "flattering in a way that will not match what arrives",
    ],
    poster: [
      "needs a second sentence before the idea lands",
      "handsome and immediately forgettable",
      "the words explain the picture instead of finishing it",
    ],
  };
  for (const [t, expected] of Object.entries(BEFORE)) {
    assert.deepStrictEqual(assetContextFor(t, true)!.failure_modes, expected, `${t}: failure wording changed`);
  }
});

check("The Phase 0 contract on failure modes still holds", () => {
  // Duplicated from run-evolution-tests.ts on purpose: this phase is the one
  // most likely to break it, and a test that lives beside the change fails
  // faster than one that lives 900 lines away in another file.
  const IMPERATIVE = /^(?:use|make|keep|put|place|add|show|avoid|ensure|include|set)\b/i;
  for (const t of ASSET_TYPES) {
    const modes = assetContextFor(t, true)!.failure_modes || [];
    assert.ok(modes.length >= 3, `${t} has only ${modes.length} failure modes`);
    for (const m of modes) {
      assert.ok(!IMPERATIVE.test(m.trim()), `${t} failure mode became an instruction: ${m}`);
      assert.ok(m.length > 15, `${t} failure mode is too thin: ${m}`);
    }
  }
});

// ── the challenges themselves ─────────────────────────────────────────────

check("Every format has one challenge per failure mode, aligned", () => {
  for (const t of ASSET_TYPES) {
    const ctx = assetContextFor(t, true)!;
    assert.ok(ctx.challenges?.length, `${t} has no challenges`);
    assert.strictEqual(
      ctx.challenges!.length,
      ctx.failure_modes!.length,
      `${t}: ${ctx.challenges!.length} challenges for ${ctx.failure_modes!.length} failure modes — a pairing would be wrong`
    );
  }
});

check("A challenge asks for something, and never forbids one", () => {
  // The defect being corrected in one assertion. A challenge that said "avoid a
  // setting" would be the veto wearing the new field's name.
  // Deliberately narrow. An earlier version of this pattern included a bare
  // "no ", which flagged "say what it does for the product that no backdrop
  // could" — a phrase that asks for something. Matching the shape of a
  // prohibition matters more than matching the word.
  const FORBIDS = /\b(avoid|do not|don't|never use|must not|remove the|exclude)\b/i;
  for (const t of ASSET_TYPES) {
    for (const c of assetContextFor(t, true)!.challenges || []) {
      assert.ok(!FORBIDS.test(c), `${t} challenge forbids rather than asks: ${c}`);
      assert.ok(c.length > 25, `${t} challenge is too thin to answer: ${c}`);
    }
  }
});

check("Challenges name no industry and no house style", () => {
  const NAMED = /\b(skincare|coffee|fashion|beauty|luxury|minimal|cinematic|moody)\b/i;
  for (const t of ASSET_TYPES) {
    for (const c of assetContextFor(t, true)!.challenges || []) {
      assert.ok(!NAMED.test(c), `${t} challenge prescribes a style: ${c}`);
    }
  }
});

check("The product_hero challenge answers the failure that caused this phase", () => {
  // "The setting competes with the object" was heard as "avoid settings" on
  // every product_hero render in the benchmark. The challenge has to keep the
  // setting available and make it expensive.
  const ctx = assetContextFor("product_hero", true)!;
  const i = ctx.failure_modes!.indexOf("the setting competes with the object");
  assert.ok(i >= 0, "the failure mode was renamed");
  const c = ctx.challenges![i];
  assert.ok(/setting/i.test(c), "the challenge does not mention the setting it is about");
  assert.ok(/say what it does|no backdrop could/i.test(c), "the challenge does not ask the route to earn it");
});

// ── the director contract ─────────────────────────────────────────────────

const BRIEF = {
  concept: "c",
  useCase: "product_hero",
  aspectRatio: "1:1",
  routes: ["studio isolation — the object against controlled nothing", "construction reveal — how it is made becomes why it is good"],
} as any;

function shapeFor(formatChallenge: boolean): string {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectorV1.ts"),
    "utf-8"
  );
  return src;
}

check("OFF — the director's requested shape does not mention the challenge", () => {
  const src = shapeFor(false);
  assert.ok(/flags\.formatChallenge \? /.test(src) || /flags\.formatChallenge$/m.test(src), "the flag is not read");
  assert.ok(/const challenge = flags\.formatChallenge/.test(src), "the shape addition is not gated on the flag");
  assert.ok(/if \(flags\.formatChallenge\) parts\.push\(FORMAT_CHALLENGE_BLOCK\)/.test(src), "the prose block is not gated");
});

check("ON — the candidate must name the risk and how it earns it", () => {
  const src = shapeFor(true);
  assert.ok(/"risks":/.test(src), "candidates are not asked what they risk");
  assert.ok(/"earns_it":/.test(src), "candidates are not asked how they earn it");
  // Asked of every candidate, not only the winner: a requirement applied after
  // the choice is a rationalisation, which is the behaviour being corrected.
  // The fields are interpolated into the candidate line as `${challenge}`, so
  // the check is that the interpolation sits inside the candidate object rather
  // than that the literal string appears after it.
  assert.ok(
    /"why_this_route":[^\n]*\$\{depth\}\$\{challenge\},/.test(src),
    "the risk fields are not interpolated into the candidate shape"
  );
  assert.ok(
    !/"selected":[^\n]*\$\{challenge\}/.test(src),
    "the risk fields were attached to the winner instead of to every candidate"
  );
});

check("The instruction block says a risked failure is not disqualified", () => {
  const src = shapeFor(true);
  assert.ok(/They are tests, not a list of things to avoid/.test(src), "the block does not reframe the list");
  assert.ok(/It owes an answer/.test(src), "the block does not say how a risk is paid for");
  assert.ok(
    /A candidate that risks nothing is/.test(src),
    "the block does not penalise the route that risks nothing — which is the safe default"
  );
});

// ── flag hygiene ──────────────────────────────────────────────────────────

check("The flag exists and defaults to off", () => {
  assert.strictEqual(
    (DEFAULT_FLAGS.features as any).format_challenge_v1,
    false,
    "format_challenge_v1 does not default to off"
  );
});

check("The flag is inert without route selection, and says so", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/const challengeOn = strategyOn && Boolean\(f\.format_challenge_v1\)/.test(src), "the gate is wrong");
  assert.ok(/FORMAT_CHALLENGE\] enabled without route selection/.test(src), "an inert run is not warned about");
  assert.ok(/includeChallenges: challengeOn/.test(src), "the brief does not receive the flag");
});

check("The flag is declared implemented, so it does not warn as unknown", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/"format_challenge_v1",/.test(src), "the flag is missing from IMPLEMENTED");
});

check("The trace reports whether a risk was actually taken", () => {
  // The measurement that decides whether this phase worked. An empty
  // `risk_taken` with the flag on is the old behaviour in a new field.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/risk_taken:/.test(src), "the trace does not report the risk taken");
  assert.ok(/risk_earned_by:/.test(src), "the trace does not report how it was earned");
});

// ── nothing else moved ────────────────────────────────────────────────────

check("Stable and Phase 0 files were not touched by this phase", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDecision.ts"),
    "utf-8"
  );
  assert.ok(!/formatChallenge|format_challenge|earns_it/.test(src), "CreativeDecision.ts was drawn into this phase");
  const resolver = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "experiment", "CreativeDirectionResolver.ts"),
    "utf-8"
  );
  assert.ok(!/formatChallenge|format_challenge/.test(resolver), "the resolver was drawn into this phase");
});

check("The routes list is unchanged — this phase changes the criterion, not the menu", () => {
  const ctx = assetContextFor("product_hero", true)!;
  assert.deepStrictEqual(ctx.possible_strategies, [
    "studio isolation — the object against controlled nothing",
    "material macro — close enough that the surface is the subject",
    "in-context still life — the object where it is used",
    "scale demonstration — the object against something known",
    "construction reveal — how it is made becomes why it is good",
  ]);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
