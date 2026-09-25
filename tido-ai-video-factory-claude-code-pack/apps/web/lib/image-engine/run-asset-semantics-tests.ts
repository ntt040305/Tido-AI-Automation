import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * Phase 3.2.5 — meaning, as opposed to identity.
 *
 * WHAT THIS SUITE COVERS AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------
 * Everything here runs without a database and without a model. It covers the
 * part that is judgement rather than infrastructure: which observed fields
 * answer which question, that nothing is invented where nothing was seen, and
 * that the hash is left alone.
 *
 * Whether the vectors actually separate a same product from a similar one from
 * an unrelated one is a property of a real embedding model, and is measured
 * against the live one by `scripts/verify-asset-semantics.mjs`. A mock
 * embedder here would prove only that the mock separates them, which is a
 * statement about the mock.
 */

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { facetTexts, facetTextsForRow } = require("../persistence/asset-semantics");
const { ASSET_FACETS, PROVISIONAL_FACET_FLOOR, comparableModels } = require("@tido/shared");

const WEB = path.join(__dirname, "..", "..");
const MIGRATION = fs.readFileSync(
  path.join(WEB, "..", "..", "packages", "infrastructure", "migrations", "0008_asset_semantics.sql"),
  "utf-8",
);

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: unknown) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

/** A product observation, as VisualDNAAnalyzer produces one. */
const PRODUCT = {
  form: "a straight-sided cylindrical cup",
  materials: ["unglazed stoneware"],
  palette: ["bone", "warm grey"],
  finish: "matte",
  surface_detail: "faint throwing rings",
  scale_cues: "fits one hand",
  condition: "new, unmarked",
};

/** An AssetDNA reading of it: Decision objects, not bare strings. */
const READING = {
  form: { value: "a thrown vessel", because: "observed", derived_from: "visual_dna", confidence: "high" },
  material: { value: "absorbent, non-specular", because: "observed", derived_from: "visual_dna", confidence: "high" },
  palette: { value: "bone and warm grey", because: "observed", derived_from: "visual_dna", confidence: "medium" },
  texture: { value: "throwing rings", because: "observed", derived_from: "visual_dna", confidence: "medium" },
  personality: { value: "quiet, unfussy", because: "observed", derived_from: "visual_dna", confidence: "low" },
  treatment: { supports: [], contradicts: [] },
};

const LOGO = { letterform: "a geometric sans", weight: "medium", geometry: "even counters", colour: ["ink"] };
const REFERENCE = {
  composition: "subject low and left, deep negative space",
  light_behaviour: "single soft source from the left",
  tonal_range: "compressed, no true black",
};

const byFacet = (texts: { facet: string; sourceText: string }[]) =>
  Object.fromEntries(texts.map((t) => [t.facet, t.sourceText]));

console.log("\nWhich observed fields answer which question");

check("a product yields identity and appearance", () => {
  const t = byFacet(facetTexts(PRODUCT, null));
  assert.ok(t.identity, "no identity facet");
  assert.ok(t.appearance, "no appearance facet");
});

check("identity is about the object, not about how it looks today", () => {
  const t = byFacet(facetTexts(PRODUCT, null));
  assert.ok(t.identity.includes("form:"), "identity lost the form");
  assert.ok(t.identity.includes("unglazed stoneware"), "identity lost the material");
  // The palette is a property of this photograph's colour, not of the object's
  // identity. Two photographs of one cup under different light must still be
  // the same object.
  assert.ok(!t.identity.includes("bone"), "the palette leaked into identity");
});

check("appearance is about what a viewer notices, not what the object is", () => {
  const t = byFacet(facetTexts(PRODUCT, null));
  assert.ok(t.appearance.includes("palette:"), "appearance lost the palette");
  assert.ok(t.appearance.includes("surface:"), "appearance lost the surface detail");
  assert.ok(!t.appearance.includes("scale:"), "scale is an identity fact, not an appearance one");
});

check("a reference yields style, and style alone", () => {
  const t = byFacet(facetTexts(REFERENCE, null));
  assert.ok(t.style, "no style facet");
  assert.ok(t.style.includes("composition:") && t.style.includes("light:") && t.style.includes("tone:"));
  assert.strictEqual(t.identity, undefined, "a reference photograph is not an object");
  assert.strictEqual(t.appearance, undefined);
});

check("a logo is identified by its letterforms and seen by its colour", () => {
  const t = byFacet(facetTexts(LOGO, null));
  assert.ok(t.identity.includes("letterform:"), "identity lost the letterform");
  assert.ok(t.appearance.includes("colour:"), "appearance lost the colour");
  assert.ok(!t.identity.includes("colour:"), "a recoloured logo is still the same mark");
});

check("the three facets ask genuinely different questions", () => {
  // If two facets produced the same text they would rank identically, and the
  // feature would be one feature wearing three names.
  const t = byFacet(facetTexts({ ...PRODUCT, ...REFERENCE }, READING));
  const texts = ASSET_FACETS.map((f: string) => t[f]).filter(Boolean);
  assert.strictEqual(new Set(texts).size, texts.length, "two facets produced identical text");
});

console.log("\nNothing is invented where nothing was seen");

check("an unobserved field contributes no line", () => {
  const t = byFacet(facetTexts({ form: "a cup" }, null));
  assert.strictEqual(t.identity, "form: a cup");
  assert.ok(!t.identity.includes("material"), "a material was invented");
  assert.strictEqual(t.appearance, undefined, "an appearance was invented from nothing");
});

check("an empty observation yields no facets at all", () => {
  // Not an empty string embedded -- that would place every unread asset at one
  // point in the space, where they would all be returned as each other's
  // nearest neighbours. A confident wrong answer that looks like it works.
  assert.deepStrictEqual(facetTexts({}, null), []);
  assert.deepStrictEqual(facetTexts(null, null), []);
  assert.deepStrictEqual(facetTexts({ form: "   " }, null), []);
});

check("no category, industry or style vocabulary is introduced", () => {
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "asset-semantics.ts"), "utf-8");
  // The trap AssetDNA was written to avoid, and this file inherits: a lookup
  // table that makes every coffee brand's poster look the same.
  for (const banned of ["skincare", "cosmetic", "luxury", "minimalist", "cafe", "beverage", "industry"]) {
    assert.ok(!new RegExp(`["'\`]${banned}`, "i").test(src), `a ${banned} vocabulary entered the builder`);
  }
});

check("the reasoning behind a decision is not embedded, only its value", () => {
  const t = byFacet(facetTexts(null, READING));
  assert.ok(t.identity.includes("a thrown vessel"), "the decision's value was dropped");
  assert.ok(!t.identity.includes("because"), "explanatory prose reached the embedding");
  assert.ok(!t.identity.includes("visual_dna"), "provenance reached the embedding");
});

console.log("\nThe text is stable enough to skip re-embedding");

check("the same observation always produces byte-identical text", () => {
  // What lets an unchanged asset cost nothing. If field order followed the
  // document's own key order, a re-serialised observation would look changed
  // and be re-embedded for no reason.
  const a = facetTexts(PRODUCT, READING);
  const b = facetTexts({ ...PRODUCT }, { ...READING });
  assert.deepStrictEqual(a, b);
});

check("key order in the source document does not change the text", () => {
  const reversed = Object.fromEntries(Object.entries(PRODUCT).reverse());
  assert.deepStrictEqual(facetTexts(PRODUCT, null), facetTexts(reversed, null));
});

check("a changed observation does produce different text", () => {
  const a = byFacet(facetTexts(PRODUCT, null));
  const b = byFacet(facetTexts({ ...PRODUCT, finish: "high gloss" }, null));
  assert.notStrictEqual(a.identity, b.identity);
});

check("a field is never repeated within one facet", () => {
  // `finish` is reachable from both the observation and the reading.
  const t = byFacet(facetTexts(PRODUCT, READING));
  for (const facet of Object.keys(t)) {
    const labels = t[facet].split(" | ").map((p: string) => p.split(":")[0]);
    assert.strictEqual(new Set(labels).size, labels.length, `${facet} repeated a label`);
  }
});

check("the text stays inside the column's limit", () => {
  const huge = { form: "x".repeat(9000), materials: ["y".repeat(9000)] };
  for (const t of facetTexts(huge, null)) {
    assert.ok(t.sourceText.length <= 4000, `${t.facet} was ${t.sourceText.length} characters`);
  }
});

check("a stored row goes in the same way an in-flight observation does", () => {
  assert.deepStrictEqual(
    facetTextsForRow({ observed: PRODUCT, treatment: READING }),
    facetTexts(PRODUCT, READING),
  );
});

console.log("\nHash is identity, embedding is meaning");

check("the field name travels with the value", () => {
  // Without the label, two assets sharing the word "warm" in unrelated fields
  // -- a warm palette, a warm light -- are pulled together by a coincidence of
  // vocabulary rather than by a resemblance.
  const t = byFacet(facetTexts({ palette: ["warm grey"] }, null));
  assert.ok(t.appearance.startsWith("palette:"), t.appearance);
});

check("vectors from two models are never compared", () => {
  assert.strictEqual(comparableModels("gemini-embedding-2", "gemini-embedding-2"), true);
  assert.strictEqual(comparableModels("gemini-embedding-2", "other-model"), false);
  assert.strictEqual(comparableModels("", ""), false);
});

check("the score floors are provisional, and stated as scores not verdicts", () => {
  for (const facet of ASSET_FACETS) {
    const floor = PROVISIONAL_FACET_FLOOR[facet];
    assert.ok(typeof floor === "number" && floor > 0 && floor < 1, `${facet}: ${floor}`);
  }
});

check("nothing in this phase touches asset identity", () => {
  const assetMemory = fs.readFileSync(
    path.join(WEB, "..", "..", "packages", "infrastructure", "migrations", "0006_asset_memory.sql"),
    "utf-8",
  );
  assert.ok(/unique \(user_id, content_hash\)/.test(assetMemory), "0006 was altered");
  // 0008 may reference asset_memory, but must not alter it.
  assert.ok(!/alter table public\.asset_memory/.test(MIGRATION), "0008 alters asset_memory");
  assert.ok(!/drop .*asset_memory/i.test(MIGRATION), "0008 drops part of asset_memory");
});

console.log("\nWhat the migration is required to say");

check("a vector's width is fixed by the type, not checked in code", () => {
  assert.ok(/embedding\s+vector\(768\) not null/.test(MIGRATION), "the width is not pinned");
});

check("the text that was embedded is kept, so a result can be explained", () => {
  assert.ok(/source_text\s+text not null/.test(MIGRATION));
  assert.ok(/model\s+text not null/.test(MIGRATION));
});

check("one vector per question per asset", () => {
  assert.ok(/unique \(asset_id, facet\)/.test(MIGRATION));
});

check("meaning is forgotten when the asset is", () => {
  assert.ok(
    /asset_id\s+bigint not null references public\.asset_memory\(id\) on delete cascade/.test(MIGRATION),
    "embeddings outlive their asset",
  );
});

check("row level security is on, and no client can write a vector", () => {
  assert.ok(/alter table public\.asset_embeddings enable row level security/.test(MIGRATION));
  const policies = [...MIGRATION.matchAll(/create policy (\w+) on public\.asset_embeddings\s+for (\w+)/g)];
  assert.ok(policies.length >= 1, "no policy");
  for (const [, name, verb] of policies) assert.strictEqual(verb, "select", `${name} grants ${verb}`);
});

check("the search is scoped by the owner inside the query, not after it", () => {
  // A post-filter on a `limit 10` returns an empty page while the neighbours it
  // dropped were someone else's.
  const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.search_asset_embeddings"));
  assert.ok(/where am\.user_id = p_user/.test(fn), "the owner filter is not in the query");
  assert.ok(/limit greatest/.test(fn), "the result size is unbounded");
  assert.ok(fn.indexOf("am.user_id = p_user") < fn.indexOf("order by"), "the filter runs after the ordering");
});

check("the search function is server-only", () => {
  assert.ok(/revoke all on function public\.search_asset_embeddings[\s\S]*?from anon/.test(MIGRATION));
  assert.ok(/revoke all on function public\.search_asset_embeddings[\s\S]*?from authenticated/.test(MIGRATION));
});

console.log("\nThe boundaries Phase 3.2.5 must not cross");

check("the engine still cannot reach a database", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.startsWith("run-")) continue;
      const src = fs.readFileSync(full, "utf-8");
      if (/from ["']@tido\/infrastructure["']|from ["']@supabase|persistence\/asset-semantics|persistence\/record-asset/.test(src)) {
        offenders.push(path.relative(WEB, full));
      }
    }
  };
  walk(path.join(WEB, "lib", "image-engine"));
  assert.deepStrictEqual(offenders, [], `the engine reached persistence: ${offenders.join(", ")}`);
});

check("no second embedding service was written", () => {
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-asset-semantics.ts"), "utf-8");
  assert.ok(/EmbeddingService/.test(src), "the existing embedder is not being used");
  assert.ok(!/GoogleGenAI|generativelanguage|fetch\(/.test(src), "a second embedding path was written");
});

check("similarity retrieval is not wired into generation", () => {
  const route = fs.readFileSync(
    path.join(WEB, "app", "api", "image", "generate-simple", "route.ts"),
    "utf-8",
  );
  assert.ok(!/assetSemantics|similar\(|record-asset-semantics/.test(route), "the render path searches asset memory");
  // Nor indirectly, through the layer that records a render.
  const record = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-generation.ts"), "utf-8");
  assert.ok(!/assetSemantics\.similar|sameProduct|visuallySimilar/.test(record));
});

check("indexing runs, because a foundation with nothing in it retrieves nothing", () => {
  // The write side is deliberately connected; only the read side is deferred.
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-assets.ts"), "utf-8");
  assert.ok(/indexAssetSemantics/.test(src), "nothing indexes an asset");
});

check("a missing embedder disables indexing rather than faking a vector", () => {
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-asset-semantics.ts"), "utf-8");
  assert.ok(/GEMINI_API_KEY/.test(src), "indexing does not check for an embedder");
  for (const banned of ["Math.random", "new Array(768)", "fill(0)"]) {
    assert.ok(!src.includes(banned), `a synthetic vector could be produced via ${banned}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
