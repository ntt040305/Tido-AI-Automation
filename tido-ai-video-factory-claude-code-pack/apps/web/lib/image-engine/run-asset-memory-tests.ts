import assert from "assert";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Phase 3.2 — asset memory, keyed by bytes.
 *
 * WHAT THIS SUITE COVERS AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------
 * Everything here runs without a database or a model. It covers the half that
 * is application logic: hashing, the alignment between an attachment and the
 * observation made of it, the anti-degradation merge, and the boundaries the
 * phase must not cross.
 *
 * Isolation, the uniqueness key, RLS and retrieval speed are properties of
 * Postgres and are proved against a live database by
 * `scripts/verify-asset-memory.mjs`. Asserting them here against a mock would
 * test the mock.
 */

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/* eslint-disable @typescript-eslint/no-require-imports */
const { contentHash, assetRows } = require("../persistence/record-assets");
const { branchForRole } = require("./evolution/experiment/VisualDNAAnalyzer");
const { buildAssetDNA } = require("./evolution/experiment/AssetDNA");
// From the contract, which is where the merge rule lives -- not from the
// Supabase implementation, which only applies it.
const {
  isSameAnalysis,
  mergeAssetDocument: mergeDocument,
  hasAssetContent: hasContent,
  normalizeContentHash: validHash,
} = require("@tido/shared");

const WEB = path.join(__dirname, "..", "..");
const MIGRATION = fs.readFileSync(
  path.join(WEB, "..", "..", "packages", "infrastructure", "migrations", "0006_asset_memory.sql"),
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

/** A VisualDNA exactly as the analyzer produces one. */
function visualDna(over: Record<string, unknown> = {}) {
  return {
    observed: {
      product: {
        form: "a straight-sided cylindrical cup",
        materials: ["unglazed stoneware"],
        palette: ["bone", "warm grey"],
        finish: "matte",
      },
      logo: { letterform: "a geometric sans", colour: ["ink"] },
    },
    inferred: [],
    provenance: {
      derived_from_image: true,
      analyzed_roles: ["PRODUCT", "LOGO"],
      source_hashes: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"],
      model_calls: 1,
      analyzed_at: new Date().toISOString(),
    },
    ...over,
  };
}

function render(over: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = { success: true, generationId: "gen_test_1" };
  // Non-enumerable, exactly as the pipeline attaches it.
  Object.defineProperty(result, "visualDna", {
    value: visualDna(),
    enumerable: false,
    configurable: true,
  });
  for (const [k, v] of Object.entries(over)) {
    Object.defineProperty(result, k, { value: v, enumerable: false, configurable: true });
  }
  return result;
}

const PRODUCT_BYTES = Buffer.from("a photograph of a cup, as bytes");
const LOGO_BYTES = Buffer.from("a logo, as bytes");

function request(images: unknown[]) {
  return { concept: "a cup", images } as never;
}

console.log("\nThe identity of an asset");

check("the key is the whole sha-256, not the engine's truncation", () => {
  const hash = contentHash(PRODUCT_BYTES);
  assert.strictEqual(hash.length, 64, `got ${hash.length} characters`);
  assert.ok(/^[0-9a-f]{64}$/.test(hash), "not lower-case hex");
  // The engine's hash is the first 16 of the same digest, so a store that
  // keyed on it would be keying on a 64-bit prefix.
  assert.strictEqual(
    hash.slice(0, 16),
    crypto.createHash("sha256").update(PRODUCT_BYTES).digest("hex").slice(0, 16),
  );
});

check("the same bytes always produce the same key", () => {
  assert.strictEqual(contentHash(PRODUCT_BYTES), contentHash(Buffer.from(PRODUCT_BYTES)));
});

check("different bytes produce different keys", () => {
  assert.notStrictEqual(contentHash(PRODUCT_BYTES), contentHash(LOGO_BYTES));
});

check("one flipped byte changes the key", () => {
  const altered = Buffer.from(PRODUCT_BYTES);
  altered[0] = altered[0] ^ 0x01;
  assert.notStrictEqual(contentHash(PRODUCT_BYTES), contentHash(altered));
});

console.log("\nHash collision handling");

check("a truncated hash is refused as a key", () => {
  // The exact mistake the store is built to make impossible: reaching for
  // `VisualDNAAnalyzer.hash` because it is the one already in scope.
  assert.strictEqual(validHash("aaaaaaaaaaaaaaaa"), null);
  assert.strictEqual(validHash(contentHash(PRODUCT_BYTES).slice(0, 63)), null);
  assert.ok(validHash(contentHash(PRODUCT_BYTES)));
});

check("the database refuses a truncated hash too", () => {
  assert.ok(
    /content_hash\s+text not null check \(content_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(MIGRATION),
    "0006 does not constrain the hash to a full digest",
  );
});

check("two assets sharing a 16-character prefix stay distinct", () => {
  // Cannot be produced by hashing, which is the point: under the engine's
  // truncation these would be one asset, and under the full digest they are two.
  const a = "a".repeat(16) + "1".repeat(48);
  const b = "a".repeat(16) + "2".repeat(48);
  assert.notStrictEqual(validHash(a), validHash(b));
  assert.strictEqual(a.slice(0, 16), b.slice(0, 16));
});

check("a malformed hash is not an error, it is an absence", () => {
  // A caller asking about a hash nobody could have uploaded gets the same
  // answer as one asking about an asset nobody uploaded.
  assert.strictEqual(validHash("not-a-hash"), null);
  assert.strictEqual(validHash(null), null);
  assert.strictEqual(validHash(undefined), null);
  assert.strictEqual(validHash(12345), null);
});

check("case is normalised so one digest cannot become two rows", () => {
  const hash = contentHash(PRODUCT_BYTES);
  assert.strictEqual(validHash(hash.toUpperCase()), hash);
});

console.log("\nThe same asset uploaded twice");

check("the same file attached twice in one request is one asset", () => {
  const rows = assetRows(
    request([
      { role: "PRODUCT", buffer: PRODUCT_BYTES, mimeType: "image/png" },
      { role: "PRODUCT", buffer: PRODUCT_BYTES, mimeType: "image/png" },
    ]),
    render(),
  );
  assert.strictEqual(rows.length, 1, `got ${rows.length} rows for one file`);
});

check("the same file across two renders produces the same key", () => {
  const first = assetRows(request([{ role: "PRODUCT", buffer: PRODUCT_BYTES }]), render());
  const second = assetRows(
    request([{ role: "PRODUCT", buffer: Buffer.from(PRODUCT_BYTES) }]),
    render(),
  );
  assert.strictEqual(first[0].contentHash, second[0].contentHash);
});

check("a re-analysis that lost a field does not erase what was known", () => {
  // The anti-degradation rule. Vision calls are not deterministic, and an
  // upsert would turn one flaky response into permanent data loss.
  const stored = { form: "a cylindrical cup", materials: ["unglazed stoneware"], finish: "matte" };
  const thin = { form: "a cup" };
  const merged = mergeDocument(stored, thin);
  assert.deepStrictEqual(merged.materials, ["unglazed stoneware"], "materials were erased");
  assert.strictEqual(merged.finish, "matte", "finish was erased");
  assert.strictEqual(merged.form, "a cup", "the newer reading did not win where it had one");
});

check("an empty re-analysis changes nothing", () => {
  const stored = { form: "a cup", materials: ["stoneware"] };
  assert.deepStrictEqual(mergeDocument(stored, {}), stored);
  assert.deepStrictEqual(mergeDocument(stored, null), stored);
});

check("an empty string, an empty array and null never overwrite", () => {
  const stored = { form: "a cup", materials: ["stoneware"], finish: "matte" };
  const merged = mergeDocument(stored, { form: "", materials: [], finish: null });
  assert.deepStrictEqual(merged, stored);
});

check("a nested branch merges rather than being swapped wholesale", () => {
  const stored = { product: { material: "stoneware", palette: "bone" } };
  const merged = mergeDocument(stored, { product: { material: "unglazed stoneware" } });
  assert.strictEqual((merged.product as Record<string, unknown>).palette, "bone");
  assert.strictEqual((merged.product as Record<string, unknown>).material, "unglazed stoneware");
});

check("a richer re-analysis does improve the row", () => {
  const merged = mergeDocument({ form: "a cup" }, { form: "a cup", materials: ["stoneware"] });
  assert.deepStrictEqual(merged.materials, ["stoneware"]);
});

console.log("\nWhat is stored, and what is refused");

check("an asset with nothing observed and nothing read is not stored", () => {
  assert.strictEqual(hasContent(null), false);
  assert.strictEqual(hasContent({}), false);
  assert.strictEqual(hasContent({ form: "" }), false);
  assert.strictEqual(hasContent({ materials: [] }), false);
  assert.strictEqual(hasContent({ form: "a cup" }), true);
});

check("each asset carries only the observation made of it", () => {
  const rows = assetRows(
    request([
      { role: "PRODUCT", buffer: PRODUCT_BYTES },
      { role: "LOGO", buffer: LOGO_BYTES },
    ]),
    render(),
  );
  assert.strictEqual(rows.length, 2);
  const product = rows.find((r: { branch: string }) => r.branch === "product");
  const logo = rows.find((r: { branch: string }) => r.branch === "logo");
  assert.ok(product.observed.materials, "the product lost its observation");
  assert.ok(logo.observed.letterform, "the logo lost its observation");
  assert.strictEqual(
    (product.observed as Record<string, unknown>).letterform,
    undefined,
    "the logo's observation was filed under the product's hash",
  );
});

check("the product's reading goes to the product, the logo's to the logo", () => {
  const rows = assetRows(
    request([
      { role: "PRODUCT", buffer: PRODUCT_BYTES },
      { role: "LOGO", buffer: LOGO_BYTES },
    ]),
    render(),
  );
  const product = rows.find((r: { branch: string }) => r.branch === "product");
  const logo = rows.find((r: { branch: string }) => r.branch === "logo");
  // AssetDNA's product branch carries `material`; its logo branch carries
  // `safe_area`. Neither should appear on the other.
  assert.ok(product.treatment, "the product has no reading");
  assert.strictEqual(product.treatment.safe_area, undefined, "logo rules reached the product");
  if (logo.treatment) assert.strictEqual(logo.treatment.material, undefined);
});

check("per-render staging is not filed as a fact about the asset", () => {
  // `supporting` describes what a director put in one frame. Stored under a
  // content hash it would harden into a permanent property of the object.
  const dna = buildAssetDNA({
    visualDNA: visualDna() as never,
    supportingRoles: ["a brass tray", "linen cloth"],
  });
  assert.ok(dna.supporting.length > 0, "the fixture no longer exercises supporting");
  const rows = assetRows(request([{ role: "PRODUCT", buffer: PRODUCT_BYTES }]), render({ assetDna: dna }));
  assert.strictEqual(
    JSON.stringify(rows[0].treatment ?? {}).includes("brass tray"),
    false,
    "one render's staging was stored as a property of the photograph",
  );
});

check("nothing is stored when no model looked at the image", () => {
  const unanalyzed = { success: true, generationId: "g" };
  Object.defineProperty(unanalyzed, "visualDna", {
    value: { observed: {}, inferred: [], provenance: { derived_from_image: false, analyzed_roles: [], source_hashes: [] } },
    enumerable: false,
    configurable: true,
  });
  const rows = assetRows(request([{ role: "PRODUCT", buffer: PRODUCT_BYTES }]), unanalyzed as never);
  for (const row of rows) {
    assert.strictEqual(row.analyzed, false);
    assert.strictEqual(row.observed, null, "an observation was invented");
    assert.strictEqual(row.preparedHash, null, "a hash was claimed for an analysis that never ran");
  }
});

check("a role the analyzer never looks at is not stored", () => {
  assert.strictEqual(branchForRole("SOMETHING_ELSE"), null);
  const rows = assetRows(request([{ role: "SOMETHING_ELSE", buffer: PRODUCT_BYTES }]), render());
  assert.strictEqual(rows.length, 0);
});

check("an attachment with no bytes is not stored", () => {
  const rows = assetRows(request([{ role: "PRODUCT", buffer: Buffer.alloc(0) }]), render());
  assert.strictEqual(rows.length, 0);
});

check("the engine's short hash is kept as a hint, never as the key", () => {
  const rows = assetRows(request([{ role: "PRODUCT", buffer: PRODUCT_BYTES }]), render());
  assert.strictEqual(rows[0].preparedHash, "aaaaaaaaaaaaaaaa");
  assert.strictEqual(rows[0].preparedHash!.length, 16);
  assert.strictEqual(rows[0].contentHash.length, 64);
  assert.notStrictEqual(rows[0].contentHash, rows[0].preparedHash);
});

check("the analyser's timestamp is carried, so a cache hit is not a vision call", () => {
  // `derived_from_image` is true of a REUSED analysis as well as a fresh one:
  // the analyzer returns the previous object untouched when the hashes match.
  // Counting on that flag alone recorded cache hits as calls, and made the one
  // number that justifies this table -- the saving -- wrong in its own favour.
  const rows = assetRows(request([{ role: "PRODUCT", buffer: PRODUCT_BYTES }]), render());
  assert.ok(rows[0].analyzedAt, "the timestamp was dropped");
  assert.strictEqual(typeof rows[0].analyzedAt, "string");
});

check("Postgres and JavaScript spellings of one instant are the same analysis", () => {
  // The defect this replaced: Postgres renders `+00:00`, JavaScript renders
  // `Z`, and `===` therefore reported every cache hit as a fresh vision call.
  // Invisible in production, because the number it corrupts is the one nobody
  // else can check.
  assert.strictEqual(
    isSameAnalysis("2026-09-24T01:33:00.808+00:00", "2026-09-24T01:33:00.808Z"),
    true,
  );
  assert.strictEqual(
    isSameAnalysis("2026-09-24T01:33:00.808Z", "2026-09-24T01:33:01.808Z"),
    false,
  );
});

check("an unknown timestamp is never treated as a match", () => {
  // Non-match is the conservative side: the caller counts it as a reuse, which
  // under-reports the saving rather than inflating it.
  assert.strictEqual(isSameAnalysis(null, "2026-09-24T01:33:00.808Z"), false);
  assert.strictEqual(isSameAnalysis("", ""), false);
  assert.strictEqual(isSameAnalysis("not a date", "not a date"), false);
});

check("an unanalysed asset claims no timestamp", () => {
  const unanalyzed = { success: true, generationId: "g" };
  Object.defineProperty(unanalyzed, "visualDna", {
    value: { observed: {}, inferred: [], provenance: { derived_from_image: false, analyzed_roles: [], source_hashes: [] } },
    enumerable: false,
    configurable: true,
  });
  const rows = assetRows(request([{ role: "PRODUCT", buffer: PRODUCT_BYTES }]), unanalyzed as never);
  for (const row of rows) assert.strictEqual(row.analyzedAt, null);
});

check("the role and the branch are both kept", () => {
  const rows = assetRows(request([{ role: "PRODUCT_REFERENCE", buffer: PRODUCT_BYTES }]), render());
  assert.strictEqual(rows[0].role, "PRODUCT_REFERENCE");
  assert.strictEqual(rows[0].branch, "product");
});

console.log("\nThe boundaries Phase 3.2 must not cross");

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
      if (/from ["']@tido\/infrastructure["']|from ["']@supabase|firebase-admin|persistence\/record-assets/.test(src)) {
        offenders.push(path.relative(WEB, full));
      }
    }
  };
  walk(path.join(WEB, "lib", "image-engine"));
  assert.deepStrictEqual(offenders, [], `the engine reached persistence: ${offenders.join(", ")}`);
});

check("the observation rides out non-enumerably and never into a response", () => {
  // The whole reason the engine can hand this over without a database: it is
  // attached with enumerable:false, so every spread that builds the HTTP
  // payload skips it.
  const result = render();
  assert.ok((result as Record<string, unknown>).visualDna, "not attached");
  assert.strictEqual(Object.keys(result).includes("visualDna"), false, "it is enumerable");
  assert.strictEqual(JSON.stringify(result).includes("visualDna"), false, "it reaches JSON");
  assert.strictEqual(JSON.stringify({ ...result }).includes("stoneware"), false, "a spread carried it");
});

check("asset memory is not read by the generation path (Phase 3.4, not 3.2)", () => {
  const route = fs.readFileSync(
    path.join(WEB, "app", "api", "image", "generate-simple", "route.ts"),
    "utf-8",
  );
  assert.ok(
    !/assets\.(get|getMany|recent)|record-assets/.test(route),
    "the render path now reads asset memory",
  );
});

check("nothing in this phase performs a second analysis", () => {
  const src = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-assets.ts"), "utf-8");
  for (const forbidden of ["VisualDNAAnalyzer(", "LLMProvider", "llm.", ".analyze(", "fetch("]) {
    assert.ok(!src.includes(forbidden), `record-assets reaches for ${forbidden}`);
  }
});

check("the role-to-branch map exists in exactly one place", () => {
  const analyzer = fs.readFileSync(
    path.join(__dirname, "evolution/experiment/VisualDNAAnalyzer.ts"),
    "utf-8",
  );
  assert.ok(/export function branchForRole/.test(analyzer), "the map is not exported");
  const persistence = fs.readFileSync(path.join(WEB, "lib", "persistence", "record-assets.ts"), "utf-8");
  assert.ok(
    !/PRODUCT_REFERENCE\s*:|INSPIRATION_REFERENCE\s*:/.test(persistence),
    "the persistence layer keeps its own copy of the map",
  );
});

console.log("\nWhat the migration is required to say");

check("asset memory has row level security enabled", () => {
  assert.ok(/alter table public\.asset_memory\s+enable row level security/.test(MIGRATION));
});

check("no client can write to it", () => {
  const policies = [...MIGRATION.matchAll(/create policy (\w+) on public\.asset_memory\s+for (\w+)/g)];
  assert.ok(policies.length >= 1, "no policy at all");
  for (const [, name, verb] of policies) {
    assert.strictEqual(verb, "select", `${name} grants ${verb}`);
  }
});

check("one person's asset library cannot be another's", () => {
  assert.ok(/unique \(user_id, content_hash\)/.test(MIGRATION), "the key is not per person");
  assert.ok(
    /user_id\s+uuid not null references public\.user_profiles\(id\) on delete cascade/.test(MIGRATION),
    "assets do not belong to anyone, or do not cascade",
  );
});

check("the retrieval key is indexed", () => {
  // `unique (user_id, content_hash)` is itself the index the lookup uses.
  assert.ok(/unique \(user_id, content_hash\)/.test(MIGRATION));
  assert.ok(/create index if not exists asset_memory_user_seen_idx/.test(MIGRATION));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
