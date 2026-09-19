import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { isClientLockedDimension } from "./service/ArtDirectionResolverService";
import { ArtDirectionResolverService } from "./service/ArtDirectionResolverService";

/**
 * Phase 0.4 — compiler transmission, and product identity protection.
 *
 *   npx tsx lib/image-engine/run-phase04-transmission-tests.ts
 *
 * Offline. Two defects, both measured on real renders before being fixed:
 *
 *   A. Creative Director decisions did not reach the compiled prompt. E2 ran
 *      12 renders with authority off and 12 with it on; the tier ladder moved
 *      every dimension from USER to CREATIVE_DIRECTOR in 12/12, and the header
 *      announcing those lines as "EXPLICIT CLIENT DIRECTIVES ... never
 *      substitute a house default" appeared in 12/12 prompts of BOTH arms.
 *      Scored across 24 renders the difference was +0.14, which is what a
 *      change that does not reach the model looks like.
 *
 *   B. Campaign copy replaced the product's own label. Across the same 24
 *      renders the label survived in five of six scenarios and was destroyed in
 *      4/4 renders of the hero scenario, in both arms and both runs.
 *
 * The compiler is async and repository-backed, so the prompt-level assertions
 * here drive the two pure pieces the fix actually turns on — the shared lock
 * predicate and the resolver — plus the compiler source itself. What proves the
 * end-to-end byte difference is the live benchmark, which writes both prompts
 * and compares their hashes; `run-phase04-prompt-delta.ts` does that without a
 * model or a render.
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

const COMPILER = path.join(process.cwd(), "lib", "image-engine", "compiler", "MasterPromptCompilerService.ts");
const RESOLVER = path.join(process.cwd(), "lib", "image-engine", "service", "ArtDirectionResolverService.ts");
const compilerSrc = fs.readFileSync(COMPILER, "utf-8");
const resolverSrc = fs.readFileSync(RESOLVER, "utf-8");

const lockedIntent = (over: any = {}): any => ({
  subject: ["the bottle"],
  environment: ["a steel counter"],
  mood: ["early"],
  style: [],
  emotional_goal: "recognition",
  camera_requirements: ["eye-level with the centre of the bottle"],
  lighting_requirements: ["one window source, no fill"],
  composition_requirements: ["off-centre left"],
  material_requirements: ["glass reads cold"],
  ...over,
});

console.log("\n=== Phase 0.4 — compiler transmission + identity protection ===\n");

// ── A1. one definition of a client lock ─────────────────────────────────────

check("With authority off every dimension is the client's, as before", () => {
  for (const dim of ["camera", "lighting", "composition", "materials", "environment"]) {
    assert.strictEqual(isClientLockedDimension(dim, {}), true, dim);
    assert.strictEqual(isClientLockedDimension(dim, { creativeDirectorAuthority: false }), true, dim);
  }
});

check("With authority on an un-locked dimension is the director's", () => {
  const opts = { creativeDirectorAuthority: true, userLockedDimensions: {} };
  for (const dim of ["camera", "lighting", "composition", "materials"]) {
    assert.strictEqual(isClientLockedDimension(dim, opts), false, dim);
  }
});

check("With authority on a client-locked dimension stays the client's", () => {
  const opts = { creativeDirectorAuthority: true, userLockedDimensions: { camera: true } };
  assert.strictEqual(isClientLockedDimension("camera", opts), true);
  assert.strictEqual(isClientLockedDimension("lighting", opts), false);
});

check("The resolver and the compiler share ONE definition, not two copies", () => {
  // The defect being fixed was precisely that the resolver knew and the
  // compiler did not. Two predicates that can drift is the same bug renamed.
  assert.ok(/export function isClientLockedDimension/.test(resolverSrc), "the predicate is not exported");
  assert.ok(/isClientLockedDimension\(dimension, input\)/.test(resolverSrc), "the resolver does not use it");
  assert.ok(/isClientLockedDimension/.test(compilerSrc), "the compiler does not use it");
  assert.ok(
    !/creativeDirectorAuthority && !locks\[/.test(compilerSrc),
    "the compiler re-implements the rule instead of importing it"
  );
});

// ── A2. the tier ladder still behaves ───────────────────────────────────────

const resolve = (over: any = {}) =>
  ArtDirectionResolverService.resolve({
    lockedIntent: lockedIntent(),
    assetType: "product_hero",
    aspectRatio: "1:1",
    ...over,
  } as any);

check("Authority off resolves camera to USER", () => {
  assert.strictEqual(resolve().provenance.camera, "USER");
});

check("Authority on resolves camera to CREATIVE_DIRECTOR", () => {
  const r = resolve({ creativeDirectorAuthority: true, userLockedDimensions: {} });
  assert.strictEqual(r.provenance.camera, "CREATIVE_DIRECTOR");
  assert.strictEqual(r.provenance.lighting, "CREATIVE_DIRECTOR");
  assert.strictEqual(r.provenance.composition, "CREATIVE_DIRECTOR");
});

check("Atmosphere stays USER under authority — it is the client's own words", () => {
  const r = resolve({ creativeDirectorAuthority: true, userLockedDimensions: {} });
  assert.strictEqual(r.provenance.atmosphere, "USER", "the client's mood was captured by the director");
});

check("A client lock survives authority", () => {
  const r = resolve({ creativeDirectorAuthority: true, userLockedDimensions: { camera: true } });
  assert.strictEqual(r.provenance.camera, "USER");
  assert.strictEqual(r.provenance.lighting, "CREATIVE_DIRECTOR");
});

// ── A3. the prompt text itself now differs ──────────────────────────────────

check("The compiler emits a second, differently-worded directive block", () => {
  assert.ok(/EXPLICIT CLIENT DIRECTIVES/.test(compilerSrc), "the client block was removed");
  assert.ok(/ART DIRECTOR'S DECISIONS/.test(compilerSrc), "the director block was not added");
});

check("The director block does not claim the client demanded it", () => {
  const block = compilerSrc.slice(compilerSrc.indexOf("ART DIRECTOR'S DECISIONS"));
  const line = block.slice(0, block.indexOf("`,"));
  assert.ok(!/never substitute a house default/.test(line), "the director block reuses the client's language");
  assert.ok(/not dictated by the client/.test(line), "the director block does not say whose decision it is");
});

check("Directive lines are split by who decided them, not emitted twice", () => {
  // Both blocks printing every line would be the duplicate-carrier defect, and
  // would also put the same instruction under two different authorities.
  assert.ok(/const clientAsks = askLines\.filter\(/.test(compilerSrc), "the client lines are not filtered");
  assert.ok(/const directorAsks = askLines\.filter\(/.test(compilerSrc), "the director lines are not filtered");
  assert.ok(/!isClientLockedDimension\(a\.dimension, authorityOpts\)/.test(compilerSrc), "the split is not complementary");
});

check("Each directive line carries the dimension the lock predicate is keyed on", () => {
  for (const dim of ["camera", "lighting", "composition", "materials"]) {
    assert.ok(
      new RegExp(`dimension: "${dim}"`).test(compilerSrc),
      `${dim} lines are not tagged with their dimension`
    );
  }
});

// ── B. product identity protection ──────────────────────────────────────────

check("The four protected properties are all stated", () => {
  const block = compilerSrc.slice(compilerSrc.indexOf("PRODUCT IDENTITY PROTECTION"));
  for (const prop of ["Label:", "Logo:", "Packaging shape:", "Product colour:"]) {
    assert.ok(block.includes(prop), `${prop} is not protected`);
  }
});

check("Protection is unconditional, not dependent on a reference manifest", () => {
  // The locks that already existed are inside `if (refManifest)`, and the
  // failure happens exactly when that data is absent.
  const idx = compilerSrc.indexOf("PRODUCT IDENTITY PROTECTION");
  const preceding = compilerSrc.slice(Math.max(0, idx - 1400), idx);
  assert.ok(
    /Phase 0\.4-B/.test(preceding),
    "the protection block is not where the fix documents it"
  );
  assert.ok(
    !/if \(refManifest[\s\S]{0,80}$/.test(preceding),
    "the protection block sits inside a reference-manifest branch"
  );
});

check("A blank label is named as a failure, not left implied", () => {
  // Two of E2's 24 renders produced a completely blank label and one produced
  // four unlabelled bottles. Nothing in the prompt said that was wrong.
  assert.ok(
    /blank, partial or illegible label is a failed render/.test(compilerSrc),
    "a blank label is still an acceptable outcome"
  );
});

check("Campaign copy is told where it goes, and where it does not", () => {
  assert.ok(
    /These strings are campaign copy\. They belong to the layout, not to the product/.test(compilerSrc),
    "copy placement is not stated"
  );
  assert.ok(
    /never on the label, cap, packaging or any other product surface/.test(compilerSrc),
    "copy is not kept off the product"
  );
  assert.ok(
    /do not replace them with any string above/.test(compilerSrc),
    "the label's own words are not protected from substitution"
  );
});

check("Protection names properties, never a product category or house style", () => {
  const block = compilerSrc.slice(
    compilerSrc.indexOf("PRODUCT IDENTITY PROTECTION"),
    compilerSrc.indexOf("productInstanceRequirementsText")
  );
  assert.ok(
    !/\b(skincare|cosmetic|beauty|fashion|apparel|beverage|electronics|automotive)\b/i.test(block),
    "a product category appears in the protection block"
  );
  assert.ok(!/\b(premium|luxur\w+|minimal\w*)\b/i.test(block), "a house style appears in the protection block");
});

// ── the boundaries this phase must not cross ────────────────────────────────

check("No Art Director or Photographer agent was added", () => {
  const root = path.join(process.cwd(), "lib", "image-engine");
  const names = fs.readdirSync(path.join(root, "evolution", "experiment"));
  for (const n of names) {
    assert.ok(!/ArtDirectorAgent|PhotographerAgent|ArtDirectorV/.test(n), `an agent was added: ${n}`);
  }
  assert.ok(!/class ArtDirector|class Photographer/.test(compilerSrc), "the compiler grew an agent");
});

check("The compiler still reads no feature flags", () => {
  // The architectural boundary: `evolution/` reads flags, the compiler is
  // handed resolved values. Phase 1.1D established this and 0.4 keeps it.
  assert.ok(!/isEnabled\(|featureFlags|DEFAULT_FLAGS/.test(compilerSrc), "the compiler reads flags directly");
});

check("The compiler makes no new model call", () => {
  const calls = (compilerSrc.match(/generateChatCompletion|createChatCompletion|\.chat\(/g) || []).length;
  assert.strictEqual(calls, 0, "the compiler now calls a model");
});

// ── the delta harness exists and is honest ──────────────────────────────────

check("A prompt-delta benchmark exists and compares hashes of both arms", () => {
  const p = path.join(process.cwd(), "lib", "image-engine", "run-phase04-prompt-delta.ts");
  assert.ok(fs.existsSync(p), "the OFF vs ON prompt benchmark is missing");
  const src = fs.readFileSync(p, "utf-8");
  assert.ok(/creativeDirectorAuthority: false/.test(src), "the benchmark has no OFF arm");
  assert.ok(/creativeDirectorAuthority: true/.test(src), "the benchmark has no ON arm");
  assert.ok(/createHash/.test(src), "the benchmark does not hash the prompts");
  // Imports and calls only — "render" appears in the prose explaining why this
  // benchmark deliberately does not render.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/from ".*(?:Provider|PipelineRouter|imgstudio)/i.test(code), "the prompt benchmark imports a provider");
  assert.ok(!/PipelineRouter\.run|generateImage\(/.test(code), "the prompt benchmark generates images");
});

check("Hashing distinguishes the two blocks, so the benchmark can fail", () => {
  const off = "EXPLICIT CLIENT DIRECTIVES — these are requirements, not suggestions.\n- camera: eye-level";
  const on = "ART DIRECTOR'S DECISIONS — chosen for this brief, not dictated by the client.\n- camera: eye-level";
  const h = (s: string) => crypto.createHash("md5").update(s).digest("hex");
  assert.notStrictEqual(h(off), h(on), "the two blocks hash identically");
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74) + "\n");
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
