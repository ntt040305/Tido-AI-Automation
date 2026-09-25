/**
 * Phase 5, against the live database: Brand Kits and the design document.
 *
 *   a person saves a Brand Kit with a logo -> it lists without the logo bytes ->
 *   a render loads it with them -> another person can neither read nor edit it
 *   -> a render made with it stores its design document, linked to the brand.
 *
 * Drives the real store and persistence code with two database-only probe
 * identities (`firebase_uid` strings, no Firebase account). Every row it
 * creates is removed.
 *
 * Usage: npm run verify:design-output   (from apps/web)
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
import { recordGeneration, runUuid } from "./record-generation";
import { saveBrandKit, listBrandKits, loadBrandKitForRender } from "@/lib/brand-kit/brand-kit-store";
import { buildGeometry } from "@/lib/image-engine/evolution/experiment/LayoutGeometry";
import { buildTypographySystem, assignTextRoles, geometryRolesFor } from "@/lib/image-engine/evolution/experiment/TypographySystem";
import { buildCreativeDocument } from "@/lib/image-engine/evolution/experiment/CreativeDocument";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}
loadEnv();
process.env.TIDO_PATTERN_EMBEDDINGS = "off";

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

const STAMP = Date.now();
const probe = (who: string): VerifiedIdentity => ({
  firebaseUid: `design-probe-${who}-${STAMP}`,
  email: `design-probe-${who}-${STAMP}@example.invalid`,
  displayName: `Design Probe ${who}`,
  emailVerified: true,
});
const OWNER = probe("owner");
const OTHER = probe("other");

const LINES = ["Summer Sale 50%", "Chỉ trong tuần này", "Đặt ngay 0901 234 567"];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const infra = getInfrastructure();
  const gen = `gen-design-probe-${STAMP}`;
  const runId = runUuid(gen);

  try {
    console.log("\nBrand Kit and design document, against the live schema\n");
    const owner = await infra.identity.resolveActor(OWNER);
    const other = await infra.identity.resolveActor(OTHER);
    if (!owner.ok || !other.ok) throw new Error("probe identities did not resolve");

    // ── 5.4 storage ───────────────────────────────────────────────────────
    console.log("Brand Kit storage (5.4)");
    // A 1200px logo: large on purpose, to prove it is normalised on the way in.
    const bigLogo = await sharp({ create: { width: 1200, height: 600, channels: 4, background: { r: 245, g: 196, b: 0, alpha: 1 } } }).png().toBuffer();
    const saved = await saveBrandKit(owner.data, {
      kit: {
        name: "Lumi Coffee",
        colors: [{ hex: "#1a2b3c", role: "primary" }, { hex: "#f5c400", role: "accent" }],
        fonts: { heading: "Playfair Display", body: "Inter" },
        style: { preferred: ["minimal"], forbidden: ["neon"], typography_preference: "serif headline" },
      },
      logo: bigLogo,
    });
    check("a person saves a Brand Kit in their own workspace", saved.ok, saved.ok ? "" : saved.error);
    if (!saved.ok) throw new Error(saved.error);
    const kitId = saved.data.id;

    const row = (await db.from("projects").select("org_id, name, brand_context").eq("id", kitId).single()).data;
    const stored = row?.brand_context?.brand_kit;
    check("stored in projects.brand_context.brand_kit, in the owner's workspace",
      row?.org_id === owner.data.memberships[0]?.org_id && stored?.version === 1 && stored?.name === "Lumi Coffee");
    check("colours, fonts, preferred and forbidden styles all stored",
      stored?.colors?.length === 2 && stored?.fonts?.heading === "Playfair Display" && stored?.style?.forbidden?.[0] === "neon" && stored?.style?.typography_preference === "serif headline");
    check("the logo is normalised to a PNG of at most 512px, with a checksum",
      stored?.logo?.mime === "image/png" && stored.logo.width === 512 && stored.logo.height === 256 && /^[0-9a-f]{64}$/.test(stored.logo.sha256),
      JSON.stringify({ w: stored?.logo?.width, h: stored?.logo?.height }));

    const listed = await listBrandKits(owner.data);
    const mine = listed.ok ? listed.data.find((k) => k.id === kitId) : null;
    check("listing returns the kit with has_logo and without the bytes",
      Boolean(mine?.kit.has_logo) && !JSON.stringify(mine).includes(stored?.logo?.data_base64?.slice(0, 40) || "~"));

    const loaded = await loadBrandKitForRender(owner.data, kitId);
    const meta = loaded?.logo ? await sharp(loaded.logo.buffer).metadata() : null;
    check("a render loads the kit with its real logo image", meta?.format === "png" && meta.width === 512);

    // ── isolation ─────────────────────────────────────────────────────────
    console.log("\nIsolation (Supabase security)");
    check("another person cannot load it for a render", (await loadBrandKitForRender(other.data, kitId)) === null);
    const otherList = await listBrandKits(other.data);
    check("another person does not see it in their list", otherList.ok && !otherList.data.some((k) => k.id === kitId));
    const hijack = await saveBrandKit(other.data, { id: kitId, kit: { name: "Hijacked" } });
    check("another person cannot overwrite it", !hijack.ok);
    const intoForeign = await saveBrandKit(other.data, { kit: { name: "Squatter" }, orgId: owner.data.memberships[0]?.org_id });
    check("another person cannot create a kit in the owner's workspace", !intoForeign.ok);
    if (intoForeign.ok) await db.from("projects").delete().eq("id", intoForeign.data.id);
    const still = (await db.from("projects").select("name").eq("id", kitId).single()).data;
    check("the kit is unchanged after both attempts", still?.name === "Lumi Coffee");

    const updated = await saveBrandKit(owner.data, { id: kitId, kit: { ...saved.data.kit, name: "Lumi Coffee" }, removeLogo: true });
    check("the owner can update it, and remove the logo", updated.ok && updated.data.kit.has_logo === false);

    // ── 5.1 persistence ───────────────────────────────────────────────────
    console.log("\nDesign document persistence (5.1)");
    const kit = saved.data.kit;
    const lines = assignTextRoles(LINES);
    const geometry = buildGeometry({ ratio: "4:5", copyRoles: geometryRolesFor(lines), productCount: 1, hasLogo: true, compositionHint: "product placed right of centre", brandKit: kit });
    const typography = buildTypographySystem({ geometry, lines, brandKit: kit });
    const designDocument = buildCreativeDocument({ geometry, typography, brandKit: kit, canvasLongEdge: 2048 });

    const result: Record<string, unknown> = {
      success: true,
      generationId: gen,
      status: "COMPLETED",
      imageUrl: `/api/image/generated/${gen}`,
      useCase: "Poster",
      aspectRatio: "4:5",
    };
    for (const [k, value] of Object.entries({
      routingDecision: { pipeline: "experiment", pipeline_version: "V4.0.5_EXPERIMENT", features_enabled: ["execution_layer_v1"] },
      compiledPrompt: "PROMPT",
      layoutGeometry: geometry,
      typographySystem: typography,
      designDocument,
      visionTrace: {
        selected: 1,
        versions: [{ version: 1, analysis: { analyzed_image: true, text_check: { mode: "exact", required: LINES, compliant: true, missing: [], incorrect: [], unwanted: [], case_styled: [] } } }],
      },
    })) Object.defineProperty(result, k, { value, enumerable: false, configurable: true });

    await recordGeneration({
      request: { concept: "cold brew launch", useCase: "Poster", aspectRatio: "4:5", copyItems: LINES, images: [] } as never,
      result: result as never,
      identity: OWNER,
      projectId: kitId,
      orgId: saved.data.org_id,
    });

    const run = (await db.from("creative_runs").select("project_id, org_id").eq("id", runId).maybeSingle()).data;
    check("the run is linked to the brand's project and workspace", run?.project_id === kitId && run?.org_id === saved.data.org_id, JSON.stringify(run));

    const bp = (await db.from("creative_blueprints").select("design_document").eq("run_id", runId).maybeSingle()).data;
    const doc = bp?.design_document;
    check("creative_blueprints.design_document is stored with the run", Boolean(doc));
    check("it has the canvas, the brand and version 2",
      doc?.version === 2 && doc?.canvas?.width === 1638 && doc?.canvas?.height === 2048 && doc?.brand?.name === "Lumi Coffee");
    const texts = (doc?.elements || []).filter((e: { type: string }) => e.type === "text");
    check("its text layers hold the client's exact lines, byte for byte",
      JSON.stringify(texts.map((t: { content: string }) => t.content)) === JSON.stringify(LINES), JSON.stringify(texts.map((t: { content: string }) => t.content)));
    check("each text layer is editable and carries its typography",
      texts.every((t: { editable: boolean; style?: { font_family?: string; font_size_px?: number } }) => t.editable && t.style?.font_size_px && t.style?.font_family));
    check("it is synchronised with the render: generation id and verified text layers",
      doc?.sync?.generation_id === gen && doc?.sync?.text_layers === 3 && doc?.sync?.text_layers_verified === 3 && doc?.sync?.raster_is_flat === true,
      JSON.stringify(doc?.sync));
    const full = (await db.from("creative_blueprints").select("layout, typography").eq("run_id", runId).maybeSingle()).data;
    const d = full?.layout?.decisions;
    check("layout decisions are stored: product center-right, headline top-left, CTA bottom",
      d?.product_placement === "center-right" && d?.headline_placement === "top-left" && d?.cta_placement === "bottom area" && d?.whitespace?.label,
      JSON.stringify(d));
    check("typography decisions are stored: exact lines, brand fonts, CTA contrast",
      JSON.stringify((full?.typography?.specs || []).map((s: { text: string }) => s.text)) === JSON.stringify(LINES) &&
        full?.typography?.specs?.[0]?.font_family === "Playfair Display" &&
        full?.typography?.specs?.find((s: { role: string }) => s.role === "cta")?.contrast?.ratio >= 4.5);
  } catch (e) {
    failed++;
    console.error("verification failed:", e instanceof Error ? e.message : String(e));
  } finally {
    try {
      const r = await db.from("creative_runs").delete().eq("id", runId);
      if (r.error) console.error("run cleanup:", r.error.message);
      for (const who of [OWNER, OTHER]) {
        const prof = (await db.from("user_profiles").select("id").eq("firebase_uid", who.firebaseUid).maybeSingle()).data;
        if (!prof?.id) continue;
        const orgs = ((await db.from("workspace_members").select("org_id").eq("user_id", prof.id)).data || []).map((m) => m.org_id);
        if (orgs.length) await db.from("projects").delete().in("org_id", orgs);
        await db.from("creative_requests").delete().eq("user_id", prof.id);
        const p = await db.from("user_profiles").delete().eq("id", prof.id);
        if (p.error) console.error("profile cleanup:", p.error.message);
        if (orgs.length) await db.from("organizations").delete().in("id", orgs);
      }
      const left = await Promise.all([
        db.from("user_profiles").select("id", { count: "exact", head: true }).in("firebase_uid", [OWNER.firebaseUid, OTHER.firebaseUid]),
        db.from("creative_runs").select("id", { count: "exact", head: true }).eq("id", runId),
        db.from("projects").select("id", { count: "exact", head: true }).eq("name", "Lumi Coffee"),
      ]);
      console.log(`\ncleanup: profiles=${left[0].count} runs=${left[1].count} probe-kits=${left[2].count}`);
    } catch (e) {
      console.error("CLEANUP FAILED — inspect manually:", e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
