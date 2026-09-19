import assert from "assert";
import fs from "fs";
import path from "path";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";
import { DEFAULT_FLAGS } from "./evolution/feature-flags";

/**
 * Phase 1.1D — Creative Director authority over art direction.
 *
 *   npx tsx lib/image-engine/run-creative-director-authority-tests.ts
 *
 * The defect these lock down
 * --------------------------
 * `lockedIntent` is not the client. It comes from `CreativeInterpretation`,
 * whose three sources — LLM_STRUCTURED, ROUTER_STRUCTURED_INTENT and
 * DETERMINISTIC_FALLBACK — are all readings OF the brief, never the brief
 * itself. Its camera, lighting, composition, material and environment arrays
 * were pushed at USER, the top tier, and the compiler printed them under
 * "EXPLICIT CLIENT DIRECTIVES — these are requirements, not suggestions.
 * Execute them exactly; never substitute a house default."
 *
 * Measured on the Cafe Florian product-hero brief: the client wrote one sentence
 * about bottled cold brew. The prompt carried "camera: Eye-level, square-on",
 * "lighting: Chiaroscuro studio lighting" and "composition: Dead-center vertical
 * alignment" as explicit client directives. The client said none of it.
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

/** A locked intent shaped exactly as `CreativeInterpretation` produces one. */
const inferred = () => ({
  subject: ["a bottle of cold brew"],
  environment: ["a dark slate plinth"],
  mood: ["premium"],
  style: [],
  camera_requirements: ["Eye-level with the centre of the bottle, square-on"],
  lighting_requirements: ["Chiaroscuro studio lighting with a rear edge-light"],
  composition_requirements: ["Dead-centre vertical alignment in a 1:1 frame"],
  material_requirements: ["Sculpted glass bottle"],
  non_negotiable_constraints: [],
  important_user_requirements: [],
  emotional_goal: "refined",
});

const resolve = (extra: Record<string, unknown> = {}) =>
  ArtDirectionResolverService.resolve({ lockedIntent: inferred(), ...extra } as any);

const sourceOf = (r: any, dim: string) =>
  r?.provenance?.[dim] ?? r?.fields?.[dim]?.source ?? r?.[dim]?.source ?? null;

console.log("\n=== Phase 1.1D — Creative Director authority ===\n");

// ── the flag is a real switch ─────────────────────────────────────────────

check("OFF — tiering is exactly what it has always been", () => {
  const r: any = resolve();
  for (const dim of ["camera", "lighting", "composition", "materials", "environment"]) {
    assert.strictEqual(sourceOf(r, dim), "USER", `${dim} changed tier with the flag off`);
  }
});

check("OFF — an absent option behaves identically to an explicit false", () => {
  assert.deepStrictEqual(
    JSON.stringify(resolve()),
    JSON.stringify(resolve({ creativeDirectorAuthority: false })),
    "the default and an explicit false differ"
  );
});

// ── with authority on ─────────────────────────────────────────────────────

check("ON — inferred art direction is tiered CREATIVE_DIRECTOR, not USER", () => {
  const r: any = resolve({ creativeDirectorAuthority: true });
  for (const dim of ["camera", "lighting", "composition", "materials", "environment"]) {
    assert.strictEqual(
      sourceOf(r, dim),
      "CREATIVE_DIRECTOR",
      `${dim} is still impersonating a client instruction`
    );
  }
});

check("ON — a genuine client lock still wins", () => {
  // The priority rule: USER > CREATIVE_DIRECTOR. A dimension the client chose
  // in the visual direction panel is a real instruction and keeps the top tier.
  const r: any = resolve({
    creativeDirectorAuthority: true,
    userLockedDimensions: { camera: true },
  });
  assert.strictEqual(sourceOf(r, "camera"), "USER", "a real client lock was demoted");
  assert.strictEqual(sourceOf(r, "lighting"), "CREATIVE_DIRECTOR", "an inference was promoted");
});

check("ON — what the client SAID is untouched; only art direction moves", () => {
  // `mood` and `emotional_goal` are readings of the client's own words, not art
  // direction invented for them. They stay USER in both arms.
  const r: any = resolve({ creativeDirectorAuthority: true });
  assert.strictEqual(sourceOf(r, "atmosphere"), "USER", "the client's stated mood was demoted");
});

// ── the tier itself ───────────────────────────────────────────────────────

check("CREATIVE_DIRECTOR outranks REFERENCE and is outranked by USER", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "service", "ArtDirectionResolverService.ts"),
    "utf-8"
  );
  const rank = (t: string) => Number(new RegExp(`${t}:\\s*([0-9.]+),`).exec(src)?.[1]);
  assert.ok(rank("USER") < rank("CREATIVE_DIRECTOR"), "a client lock no longer outranks the director");
  assert.ok(rank("CREATIVE_DIRECTOR") < rank("REFERENCE"), "the director does not outrank an image analysis");
  // Existing ranks unchanged: eight test files read them.
  assert.strictEqual(rank("USER"), 1);
  assert.strictEqual(rank("REFERENCE"), 2);
  assert.strictEqual(rank("STRATEGY"), 3);
  assert.strictEqual(rank("KNOWLEDGE"), 4);
  assert.strictEqual(rank("ASSET_DEFAULT"), 5);
});

check("Its weight sits between a client lock and a reference analysis", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "service", "ArtDirectionResolverService.ts"),
    "utf-8"
  );
  const w = src.slice(src.indexOf("TIER_WEIGHT"));
  const val = (t: string) => Number(new RegExp(`${t}:\\s*([0-9.]+),`).exec(w)?.[1]);
  assert.ok(val("USER") > val("CREATIVE_DIRECTOR"), "the director weighs as much as the client");
  assert.ok(val("CREATIVE_DIRECTOR") > val("REFERENCE"), "the director weighs less than an image analysis");
});

// ── flag hygiene and honesty ──────────────────────────────────────────────

check("The flag exists and defaults to off", () => {
  assert.strictEqual(
    (DEFAULT_FLAGS.features as any).creative_director_authority_v1,
    false,
    "it does not default off"
  );
});

check("The flag documents the route it is wired by", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "feature-flags.ts"),
    "utf-8"
  );
  assert.ok(/Wired by Route 1/.test(src), "the flag does not say how it reaches the resolver");
  assert.ok(!/NOT YET WIRED/.test(src), "the flag still claims to be unwired");
});

check("The decision log reports the decision, not the flag", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"),
    "utf-8"
  );
  assert.ok(/\[CREATIVE_DIRECTOR_DECISION\]/.test(src), "the log is missing");
  for (const field of ["concept", "camera", "typography", "composition_reasoning"]) {
    assert.ok(new RegExp(`${field}:`).test(src), `the log omits ${field}`);
  }
});

// ── Phase 1.1D wiring: Route 1, through the compiler input ───────────────

check("CASE A — brief says only 'luxury serum advertisement': camera = CREATIVE_DIRECTOR", () => {
  // Nothing about a camera was stated. Whatever camera reaches the prompt is
  // the system's decision, and it should be tiered as one.
  const li = {
    subject: ["a luxury serum bottle"],
    environment: [], mood: ["luxury"], style: [],
    camera_requirements: ["Macro three-quarter view at 85mm"],
    lighting_requirements: ["Soft directional key with a gradient falloff"],
    composition_requirements: ["Centred with generous negative space"],
    material_requirements: [], non_negotiable_constraints: [], important_user_requirements: [],
  };
  const r: any = ArtDirectionResolverService.resolve({
    lockedIntent: li, creativeDirectorAuthority: true, userLockedDimensions: {},
  } as any);
  assert.strictEqual(sourceOf(r, "camera"), "CREATIVE_DIRECTOR", "an unstated camera is still labelled the client's");
  assert.strictEqual(sourceOf(r, "lighting"), "CREATIVE_DIRECTOR");
  assert.strictEqual(sourceOf(r, "composition"), "CREATIVE_DIRECTOR");
});

check("CASE B — user locks camera = macro closeup: camera = USER, the rest stay CREATIVE_DIRECTOR", () => {
  const li = {
    subject: ["a luxury serum bottle"], environment: [], mood: [], style: [],
    camera_requirements: ["Macro closeup"],
    lighting_requirements: ["Soft directional key"],
    composition_requirements: ["Centred"],
    material_requirements: [], non_negotiable_constraints: [], important_user_requirements: [],
  };
  const r: any = ArtDirectionResolverService.resolve({
    lockedIntent: li, creativeDirectorAuthority: true,
    userLockedDimensions: { camera: true },
  } as any);
  assert.strictEqual(sourceOf(r, "camera"), "USER", "an explicit user lock was overridden by the director");
  assert.strictEqual(sourceOf(r, "lighting"), "CREATIVE_DIRECTOR", "an inference was promoted alongside it");
  assert.strictEqual(sourceOf(r, "composition"), "CREATIVE_DIRECTOR");
});

check("WIRING — the compiler input carries the fields and the compiler forwards them", () => {
  const types = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", "types.ts"), "utf-8");
  assert.ok(/creativeDirectorAuthority\?: boolean;/.test(types), "the compiler input lacks the field");
  assert.ok(/userLockedDimensions\?: Record<string, boolean>;/.test(types), "the compiler input lacks the locks");
  const comp = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts"), "utf-8");
  assert.ok(/creativeDirectorAuthority: input\.creativeDirectorAuthority/.test(comp), "the compiler does not forward it");
  assert.ok(/userLockedDimensions: input\.userLockedDimensions/.test(comp), "the compiler does not forward the locks");
});

check("WIRING — the compiler still never reads a feature flag", () => {
  // Route 1's whole constraint. The compiler receives a resolved boolean; it
  // does not learn what a flag is.
  // Matched on actual reads, not on the flag's NAME: both files legitimately
  // mention it in a comment explaining where their boolean comes from.
  for (const f of ["compiler/MasterPromptCompilerService.ts", "service/ArtDirectionResolverService.ts"]) {
    const src = fs.readFileSync(path.join(process.cwd(), "lib", "image-engine", f), "utf-8");
    assert.ok(!/readFlags\s*\(/.test(src), `${f} calls readFlags()`);
    assert.ok(!/from ["'][^"']*feature-flags/.test(src), `${f} imports the flag store`);
    assert.ok(!/f\.creative_director_authority_v1|features\.creative_director_authority_v1/.test(src),
      `${f} reads the flag value directly`);
  }
});

check("WIRING — the orchestrator accepts and forwards the option", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "service", "SimpleImageGenerationOrchestratorService.ts"), "utf-8");
  assert.ok(/creativeDirectorAuthority\?: boolean;/.test(src), "the option is not accepted");
  assert.ok(/creativeDirectorAuthority: options\?\.creativeDirectorAuthority/.test(src), "the option is not forwarded");
});

check("WIRING — the pipeline resolves the flag and derives locks from visual_controls", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8");
  assert.ok(/const cdAuthorityOn = Boolean\(f\.creative_director_authority_v1\)/.test(src), "the flag is not read");
  assert.ok(/visual_controls/.test(src), "locks are not derived from the visual direction panel");
  assert.ok(/!== AUTO/.test(src), "'auto' is being treated as a user choice");
  assert.ok((src.match(/\.\.\.cdAuthorityOptions,/g) || []).length === 2, "not threaded on both pipeline paths");
});

check("WIRING — with the flag off nothing is added to the options", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib", "image-engine", "evolution", "ExperimentPipeline.ts"), "utf-8");
  assert.ok(/cdAuthorityOn\s*\?\s*\{ creativeDirectorAuthority: true, userLockedDimensions \}\s*:\s*\{\}/.test(src),
    "the off arm does not spread an empty object");
});

check("Stable behaviour is preserved: the resolver still compiles its old shape", () => {
  const r: any = resolve();
  assert.ok(r, "the resolver returned nothing");
  assert.ok(sourceOf(r, "camera"), "provenance is no longer reported");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
