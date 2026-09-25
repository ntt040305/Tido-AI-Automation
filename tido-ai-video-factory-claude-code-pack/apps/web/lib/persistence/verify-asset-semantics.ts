/**
 * Phase 3.2.5 against the live database and the live embedding model.
 *
 * WHY THIS IS A TypeScript SCRIPT AND NOT ANOTHER .mjs PROBE
 * -----------------------------------------------------------
 * The other verification scripts talk to Postgres directly with `pg`, which is
 * the right tool for checking that a constraint bites. This one has to check
 * something else: that the REPOSITORY -- the code an application actually calls
 * -- returns the right neighbours. Half of that logic is SQL and half is
 * TypeScript, and a probe that reimplemented the TypeScript half in SQL would
 * be testing its own replica.
 *
 * So it calls `getInfrastructure().assetSemantics` exactly as the application
 * would, and embeds with the same `EmbeddingService` the indexer uses. Nothing
 * here is mocked. `pg` does not resolve from `apps/web`, so setup and teardown
 * use a service-role Supabase client, which is the same key the repositories
 * hold.
 *
 * THE CORPUS
 * ----------
 * Four descriptions where the right answer is known before the model is asked:
 * the same cup photographed twice, a different object sharing its surface, and
 * something unrelated. The claim under test is an ORDERING -- same > similar >
 * unrelated -- rather than any particular number, because the numbers belong to
 * the model and will move when it does. The ordering is the property the
 * feature rests on.
 *
 * Every account and row it creates is removed, including on failure.
 */

import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Actor, AssetFacet } from "@tido/shared";
import { PROVISIONAL_FACET_FLOOR } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
import { EmbeddingService } from "@/lib/image-engine/retrieval/EmbeddingService";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import { facetTexts } from "./asset-semantics";
import { indexAssetSemantics } from "./record-asset-semantics";

/**
 * Loads `.env.local` in process.
 *
 * `node --env-file` would be tidier, but this runs under `tsx` and tsx is not a
 * local dependency, so `--import tsx` cannot resolve. Reading the file here
 * keeps the invocation to one command and keeps the credentials out of it.
 */
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadEnv();

const MODEL = IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL;
const UID_A = "semantics-probe-alice";
const UID_B = "semantics-probe-bob";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

const sha = async (s: string) => {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(s).digest("hex");
};

/** Observations, written as the analyzer would report them. */
const OBSERVED = {
  cupA: {
    form: "a straight-sided cylindrical cup",
    materials: ["unglazed stoneware"],
    palette: ["bone", "warm grey"],
    finish: "matte",
    surface_detail: "faint throwing rings",
    scale_cues: "fits in one hand",
  },
  // The same object, photographed again: different words, same thing.
  cupB: {
    form: "a cylindrical cup with straight sides",
    materials: ["unglazed stoneware"],
    palette: ["bone white", "grey"],
    finish: "matte, unpolished",
    surface_detail: "visible throwing rings",
    scale_cues: "hand-sized",
  },
  // A different object that shares the surface. Should rank second.
  bowl: {
    form: "a shallow wide stoneware bowl",
    materials: ["unglazed stoneware"],
    palette: ["bone", "sand"],
    finish: "matte",
    surface_detail: "throwing rings on the foot",
    scale_cues: "two hands across",
  },
  // Unrelated in every observed respect. Should be rejected.
  bottle: {
    form: "a faceted rectangular perfume bottle",
    materials: ["polished glass", "anodised aluminium"],
    palette: ["clear", "gunmetal"],
    finish: "high gloss, mirror-bright",
    surface_detail: "sharp bevelled edges",
    scale_cues: "palm-sized",
  },
  styleSoft: {
    composition: "subject low and left, deep negative space above",
    light_behaviour: "a single soft source from the left, long gentle falloff",
    tonal_range: "compressed, no true black",
  },
  styleSoft2: {
    composition: "subject placed low in frame, wide empty space above",
    light_behaviour: "one soft window light from the side, slow falloff",
    tonal_range: "low contrast, lifted shadows",
  },
  styleHard: {
    composition: "subject dead centre, filling the frame",
    light_behaviour: "direct hard flash, sharp specular hits",
    tonal_range: "full range, crushed blacks and blown highlights",
  },
} as const;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is required: this verifies real embeddings, not a mock.");
    process.exit(1);
  }

  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const infra = getInfrastructure();

  /** Registers a probe account through the real path and returns its actor. */
  async function actorFor(uid: string): Promise<Actor> {
    const r = await infra.identity.resolveActor({ firebaseUid: uid, emailVerified: false });
    if (!r.ok) throw new Error(`could not resolve ${uid}: ${r.error}`);
    return r.data;
  }

  /** Stores an asset through the real repository, then returns its row id. */
  async function remember(actor: Actor, name: string, observed: object, branch: "product" | "reference") {
    const hash = await sha(`${actor.profile.id}:${name}`);
    const saved = await infra.assets.remember(actor, [
      {
        contentHash: hash,
        role: branch === "product" ? "PRODUCT" : "INSPIRATION_REFERENCE",
        branch,
        observed: observed as Record<string, unknown>,
        treatment: null,
        analyzed: true,
        analyzedAt: new Date().toISOString(),
        byteSize: 1024,
        mimeType: "image/png",
      },
    ]);
    if (!saved.ok) throw new Error(`remember failed: ${saved.error}`);
    const row = await infra.assets.get(actor, hash);
    if (!row.ok || !row.data) throw new Error(`asset ${name} did not land`);
    return row.data;
  }

  /** Indexes an asset through the real indexer path: build text, embed, store. */
  async function index(actor: Actor, assetId: number, observed: object) {
    const texts = facetTexts(observed as Record<string, unknown>, null);
    const facets = [];
    for (const { facet, sourceText } of texts) {
      facets.push({
        facet,
        sourceText,
        embedding: await EmbeddingService.embedText(sourceText, false),
        model: MODEL,
      });
    }
    const r = await infra.assetSemantics.index(actor, { assetId, facets });
    if (!r.ok) throw new Error(`index failed: ${r.error}`);
    return r.data;
  }

  const created: string[] = [];
  try {
    console.log(`\nAsset semantics, against the live schema and ${MODEL}\n`);

    const alice = await actorFor(UID_A);
    const bob = await actorFor(UID_B);
    created.push(UID_A, UID_B);

    // ── setup ───────────────────────────────────────────────────────────────
    const cupA = await remember(alice, "cupA", OBSERVED.cupA, "product");
    const cupB = await remember(alice, "cupB", OBSERVED.cupB, "product");
    const bowl = await remember(alice, "bowl", OBSERVED.bowl, "product");
    const bottle = await remember(alice, "bottle", OBSERVED.bottle, "product");
    const soft = await remember(alice, "soft", OBSERVED.styleSoft, "reference");
    const soft2 = await remember(alice, "soft2", OBSERVED.styleSoft2, "reference");
    const hard = await remember(alice, "hard", OBSERVED.styleHard, "reference");
    // Bob uploads a description identical to Alice's cup -- the stock-photo case.
    const bobCup = await remember(bob, "cupA", OBSERVED.cupA, "product");

    console.log("Indexing");
    const first = await index(alice, cupA.id, OBSERVED.cupA);
    check("an asset is indexed into its facets", first.stored >= 2, JSON.stringify(first));

    const again = await index(alice, cupA.id, OBSERVED.cupA);
    check("an unchanged observation is not re-embedded",
      again.stored === 0 && again.unchanged >= 2, JSON.stringify(again));

    for (const [asset, observed] of [
      [cupB, OBSERVED.cupB],
      [bowl, OBSERVED.bowl],
      [bottle, OBSERVED.bottle],
      [soft, OBSERVED.styleSoft],
      [soft2, OBSERVED.styleSoft2],
      [hard, OBSERVED.styleHard],
    ] as const) {
      await index(alice, asset.id, observed as object);
    }
    await index(bob, bobCup.id, OBSERVED.cupA);

    const facets = await infra.assetSemantics.facetsFor(alice, cupA.id);
    check("the text that was embedded is kept alongside the vector",
      facets.ok && facets.data.every((f) => f.source_text.length > 0 && f.model === MODEL));
    check("a product has identity and appearance but no style",
      facets.ok && facets.data.map((f) => f.facet).sort().join(",") === "appearance,identity",
      facets.ok ? facets.data.map((f) => f.facet).join(",") : "");

    // ── same asset retrieval ────────────────────────────────────────────────
    console.log("\nSame asset retrieval");

    const identity = await infra.assetSemantics.similar(alice, {
      facet: "identity" as AssetFacet,
      assetId: cupA.id,
      limit: 10,
      minScore: -1,
    });
    check("a search by a held asset returns neighbours", identity.ok && identity.data.length > 0,
      identity.ok ? `${identity.data.length}` : identity.error);
    if (!identity.ok) throw new Error(identity.error);

    const scores = new Map(identity.data.map((r) => [r.asset_id, r.score]));
    check("the asset is not returned as its own neighbour", !scores.has(cupA.id));
    check("the same product photographed again is the nearest neighbour",
      identity.data[0]?.asset_id === cupB.id,
      `top was asset ${identity.data[0]?.asset_id} at ${identity.data[0]?.score?.toFixed(3)}`);

    const sameScore = scores.get(cupB.id) ?? -1;
    const similarScore = scores.get(bowl.id) ?? -1;
    const unrelatedScore = scores.get(bottle.id) ?? -1;
    console.log(
      `    same ${sameScore.toFixed(3)}  ·  similar ${similarScore.toFixed(3)}  ·  unrelated ${unrelatedScore.toFixed(3)}`,
    );

    check("the ordering is same > similar > unrelated",
      sameScore > similarScore && similarScore > unrelatedScore,
      `${sameScore.toFixed(3)} / ${similarScore.toFixed(3)} / ${unrelatedScore.toFixed(3)}`);

    check("the same product clears the provisional floor",
      sameScore >= PROVISIONAL_FACET_FLOOR.identity,
      `${sameScore.toFixed(3)} < ${PROVISIONAL_FACET_FLOOR.identity}`);

    // What the floor does NOT do. A single constant cannot separate the same
    // object from a different object sharing its surface -- both are genuinely
    // related, which is why both clear it. That distinction is answered by
    // rank, and the gap below is what makes rank trustworthy.
    check("the same product is separated from a merely similar one by a clear gap",
      sameScore - similarScore > 0.1,
      `gap ${(sameScore - similarScore).toFixed(3)} between same and similar`);
    check("and that separation is wider than the one the floor provides",
      sameScore - similarScore > similarScore - PROVISIONAL_FACET_FLOOR.identity,
      "the floor is doing work rank should do");

    // ── similar asset retrieval ─────────────────────────────────────────────
    console.log("\nSimilar asset retrieval");

    const appearance = await infra.assetSemantics.similar(alice, {
      facet: "appearance" as AssetFacet,
      assetId: cupA.id,
      limit: 10,
      minScore: -1,
    });
    check("a different object sharing the observed surface is retrieved",
      appearance.ok && appearance.data.some((r) => r.asset_id === bowl.id));
    if (appearance.ok) {
      const a = new Map(appearance.data.map((r) => [r.asset_id, r.score]));
      console.log(
        `    bowl ${(a.get(bowl.id) ?? -1).toFixed(3)}  ·  bottle ${(a.get(bottle.id) ?? -1).toFixed(3)}`,
      );
      check("and it outranks the object that shares nothing",
        (a.get(bowl.id) ?? -1) > (a.get(bottle.id) ?? -1));
    }

    const style = await infra.assetSemantics.similar(alice, {
      facet: "style" as AssetFacet,
      assetId: soft.id,
      limit: 10,
      minScore: -1,
    });
    check("the same style family is retrieved", style.ok && style.data[0]?.asset_id === soft2.id,
      style.ok ? `top was ${style.data[0]?.asset_id}` : style.error);
    if (style.ok) {
      const s = new Map(style.data.map((r) => [r.asset_id, r.score]));
      console.log(
        `    soft light ${(s.get(soft2.id) ?? -1).toFixed(3)}  ·  hard flash ${(s.get(hard.id) ?? -1).toFixed(3)}`,
      );
      check("and a different treatment ranks below it",
        (s.get(soft2.id) ?? -1) > (s.get(hard.id) ?? -1));
    }

    check("style and identity do not return the same ranking",
      identity.data[0]?.asset_id !== (style.ok ? style.data[0]?.asset_id : undefined),
      "the three facets collapsed into one question");

    // ── unrelated asset rejection ───────────────────────────────────────────
    console.log("\nUnrelated asset rejection");

    const floored = await infra.assetSemantics.similar(alice, {
      facet: "identity" as AssetFacet,
      assetId: cupA.id,
      limit: 10,
      minScore: PROVISIONAL_FACET_FLOOR.identity,
    });
    check("the unrelated object is excluded at the provisional floor",
      floored.ok && !floored.data.some((r) => r.asset_id === bottle.id),
      floored.ok ? floored.data.map((r) => r.score.toFixed(2)).join(",") : floored.error);
    check("while the same product survives it",
      floored.ok && floored.data.some((r) => r.asset_id === cupB.id));

    const impossible = await infra.assetSemantics.similar(alice, {
      facet: "identity" as AssetFacet,
      assetId: cupA.id,
      minScore: 0.999,
    });
    check("an unreachable floor returns nothing rather than the best of a bad set",
      impossible.ok && impossible.data.length === 0,
      impossible.ok ? `${impossible.data.length}` : impossible.error);

    // ── user isolation ──────────────────────────────────────────────────────
    console.log("\nUser isolation");

    const aliceSees = await infra.assetSemantics.similar(alice, {
      facet: "identity" as AssetFacet,
      assetId: cupA.id,
      limit: 50,
      minScore: -1,
    });
    check("an identical asset owned by someone else is never returned",
      aliceSees.ok && !aliceSees.data.some((r) => r.asset_id === bobCup.id),
      "another customer's product appeared in this search");

    const bobSees = await infra.assetSemantics.similar(bob, {
      facet: "identity" as AssetFacet,
      assetId: bobCup.id,
      limit: 50,
      minScore: -1,
    });
    check("and the isolation is symmetric",
      bobSees.ok && bobSees.data.length === 0,
      bobSees.ok ? `Bob saw ${bobSees.data.length} of Alice's assets` : bobSees.error);

    const crossRead = await infra.assetSemantics.similar(bob, {
      facet: "identity" as AssetFacet,
      assetId: cupA.id,
      limit: 10,
      minScore: -1,
    });
    check("searching by an asset id you do not own yields nothing",
      crossRead.ok && crossRead.data.length === 0);

    const crossFacets = await infra.assetSemantics.facetsFor(bob, cupA.id);
    check("nor can you read which facets it has",
      crossFacets.ok && crossFacets.data.length === 0);

    const crossIndex = await infra.assetSemantics.index(bob, {
      assetId: cupA.id,
      facets: [
        { facet: "identity", sourceText: "form: solid gold", embedding: new Array(768).fill(0.01), model: MODEL },
      ],
    });
    check("nor write a vector onto it",
      crossIndex.ok && crossIndex.data.stored === 0 && crossIndex.data.skipped === 1,
      JSON.stringify(crossIndex.ok ? crossIndex.data : crossIndex.error));

    // ── the identity/meaning line ───────────────────────────────────────────
    console.log("\nHash is still identity");

    const byHash = await infra.assets.get(alice, cupA.content_hash);
    check("the hash still finds exactly one asset", byHash.ok && byHash.data?.id === cupA.id);
    check("two photographs of one product remain two assets",
      cupA.content_hash !== cupB.content_hash && cupA.id !== cupB.id,
      "similarity collapsed two uploads into one identity");

    const wrongModel = await infra.assetSemantics.similar(alice, {
      facet: "identity" as AssetFacet,
      embedding: new Array(768).fill(0.01),
      model: "some-other-model",
      minScore: -1,
    });
    check("a query from another model matches nothing, rather than nonsense",
      wrongModel.ok && wrongModel.data.length === 0,
      wrongModel.ok ? `${wrongModel.data.length}` : wrongModel.error);

    // ── retrieval cost ──────────────────────────────────────────────────────
    console.log("\nRetrieval cost");
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      await infra.assetSemantics.similar(alice, {
        facet: "identity" as AssetFacet,
        assetId: cupA.id,
        limit: 10,
        minScore: -1,
      });
    }
    const perQuery = (Date.now() - t0) / 5;
    console.log(`    ${perQuery.toFixed(0)}ms per search, including the round trip`);
    check("a search costs far less than the vision call it replaces", perQuery < 2000,
      `${perQuery.toFixed(0)}ms`);

    // ── erasure ─────────────────────────────────────────────────────────────
    console.log("\nThe path a render actually takes");

    // Everything above drives the repository directly. This drives
    // `indexAssetSemantics` -- the function `recordAssets` invokes after a real
    // render -- so the wiring between them is covered too. Without it the suite
    // would prove the destination works while saying nothing about whether
    // anything arrives, which is the exact gap the Phase 3 audit found in seven
    // modules.
    const fresh = await remember(alice, "cupC", OBSERVED.bowl, "product");
    const before = await infra.assetSemantics.facetsFor(alice, fresh.id);
    check("a newly remembered asset starts with no vectors", before.ok && before.data.length === 0);

    const indexed = await indexAssetSemantics({ actor: alice, contentHashes: [fresh.content_hash] });
    check("the indexer reached the database from the render path", indexed.stored > 0,
      JSON.stringify(indexed));
    check("it embedded only what it stored", indexed.embedded === indexed.stored, JSON.stringify(indexed));
    check("it reported no failures", indexed.failed === 0, JSON.stringify(indexed));

    const afterIndex = await infra.assetSemantics.facetsFor(alice, fresh.id);
    check("and the vectors are there afterwards", afterIndex.ok && afterIndex.data.length > 0,
      afterIndex.ok ? `${afterIndex.data.length}` : afterIndex.error);

    const rerun = await indexAssetSemantics({ actor: alice, contentHashes: [fresh.content_hash] });
    check("a second render of the same asset embeds nothing again",
      rerun.embedded === 0 && rerun.unchanged > 0, JSON.stringify(rerun));

    const anonymous = await indexAssetSemantics({ actor: null, contentHashes: [fresh.content_hash] });
    check("an anonymous render indexes nothing", anonymous.considered === 0);

    console.log("\nErasure");
    await db.from("asset_memory").delete().eq("id", bottle.id);
    const orphans = await db.from("asset_embeddings").select("id").eq("asset_id", bottle.id);
    check("forgetting an asset forgets its meaning at the same moment",
      !orphans.error && (orphans.data || []).length === 0,
      `${orphans.data?.length} vector(s) left`);

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed === 0 ? 0 : 1;
  } catch (e) {
    console.error("verification failed:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    try {
      const profiles = await db.from("user_profiles").select("id").in("firebase_uid", [UID_A, UID_B]);
      const ids = (profiles.data || []).map((p: { id: string }) => p.id);
      if (ids.length) {
        const members = await db.from("workspace_members").select("org_id").in("user_id", ids);
        const orgIds = (members.data || []).map((m: { org_id: string }) => m.org_id);
        // Profiles cascade to assets and, through them, to embeddings. The
        // personal organisation does NOT cascade from a profile, which is the
        // litter Phase 3.1 already learned to clean up after itself.
        await db.from("user_profiles").delete().in("id", ids);
        if (orgIds.length) await db.from("organizations").delete().in("id", orgIds);
      }
      const left = await db.from("asset_embeddings").select("id");
      const assets = await db.from("asset_memory").select("id");
      const users = await db.from("user_profiles").select("id");
      console.log(
        `cleanup: embeddings=${left.data?.length ?? "?"} assets=${assets.data?.length ?? "?"} profiles=${users.data?.length ?? "?"}`,
      );
    } catch (e) {
      console.error("CLEANUP FAILED — inspect the database:", e instanceof Error ? e.message : String(e));
    }
  }
}

void main();
