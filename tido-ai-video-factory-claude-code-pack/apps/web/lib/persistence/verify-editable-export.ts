/**
 * Phase 5.5, against the live database: who may download an editable file.
 *
 *   a person renders in Editable mode -> the design is stored on the run ->
 *   they download PSD, Canva, SVG and Figma -> nobody else can -> a render made
 *   without Editable mode says so instead of serving a flattened file.
 *
 * Drives the real export service with two database-only probe identities
 * (`firebase_uid` strings, no Firebase account). Every row and file it creates
 * is removed.
 *
 * Usage: npm run verify:editable-export   (from apps/web)
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { readPsd } from "ag-psd";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VerifiedIdentity } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
import { recordGeneration, runUuid } from "./record-generation";
import { saveBrandKit } from "@/lib/brand-kit/brand-kit-store";
import { buildGeometry } from "@/lib/image-engine/evolution/experiment/LayoutGeometry";
import { buildTypographySystem, assignTextRoles, geometryRolesFor } from "@/lib/image-engine/evolution/experiment/TypographySystem";
import { buildCreativeDocument } from "@/lib/image-engine/evolution/experiment/CreativeDocument";
import { composeEditable } from "@/lib/image-engine/evolution/experiment/EditableDesign";
import { buildExport, generationDir } from "@/lib/design-export/export-service";

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
  firebaseUid: `export-probe-${who}-${STAMP}`,
  email: `export-probe-${who}-${STAMP}@example.invalid`,
  displayName: `Export Probe ${who}`,
  emailVerified: true,
});
const OWNER = probe("owner");
const OTHER = probe("other");
const LINES = ["Summer Sale 50%", "Chỉ trong tuần này", "Đặt ngay 0901 234 567"];

/**
 * A line with the layout engine's breaks collapsed back to spaces.
 *
 * Wrapping is a treatment, not an edit: a headline set on two lines is still
 * the client's one line, and the typography engine wraps to keep the headline
 * dominant rather than shrinking it. Comparing against this means a changed
 * WORD still fails while a changed BREAK does not.
 */
const oneLine = (t: string) => String(t).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** One `<text>` element's content, its `<tspan>` children rejoined. */
const svgTextOf = (el: string) =>
  oneLine([...el.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]).join(" ") || (/>([^<]*)<\/text>/.exec(el)?.[1] ?? ""));

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const infra = getInfrastructure();
  const editableGen = `gen-export-probe-${STAMP}`;
  const plainGen = `gen-export-plain-${STAMP}`;
  const runIds = [runUuid(editableGen), runUuid(plainGen)];

  try {
    console.log("\nEditable export, against the live schema\n");
    const owner = await infra.identity.resolveActor(OWNER);
    const other = await infra.identity.resolveActor(OTHER);
    if (!owner.ok || !other.ok) throw new Error("probe identities did not resolve");

    const logo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><circle cx="150" cy="150" r="140" fill="#1f3a2e"/></svg>')).png().toBuffer();
    const kitRow = await saveBrandKit(owner.data, {
      kit: {
        name: "Lumi Export",
        colors: [{ hex: "#1f3a2e", role: "primary" }, { hex: "#e8b04a", role: "accent" }, { hex: "#f4efe6", role: "background" }],
        fonts: { heading: "Playfair Display", body: "Montserrat" },
        style: { preferred: ["minimal"], forbidden: ["neon"] },
      },
      logo,
    });
    if (!kitRow.ok) throw new Error(kitRow.error);
    const kit = kitRow.data.kit;

    // ── an Editable-mode render, exactly as the pipeline produces one ──────
    console.log("Editable render");
    const lines = assignTextRoles(LINES);
    const geometry = buildGeometry({ ratio: "1:1", copyRoles: geometryRolesFor(lines), productCount: 1, hasLogo: true, brandKit: kit });
    const typography = buildTypographySystem({ geometry, lines, brandKit: kit });
    const document = buildCreativeDocument({ geometry, typography, brandKit: kit, canvasLongEdge: 2048 });
    const scene = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#e9e2d6" } }).png().toBuffer();
    const composed = await composeEditable({ document, brandKit: kit, scene, logo });

    // The pipeline stores these beside the render; the export service reads them.
    const dir = generationDir(editableGen)!;
    for (const [rel, buf] of Object.entries(composed.files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), buf);
    }
    fs.writeFileSync(path.join(dir, "output.png"), composed.composite);

    const resultFor = (gen: string, doc: unknown) => {
      const r: Record<string, unknown> = { success: true, generationId: gen, status: "COMPLETED", imageUrl: `/api/image/generated/${gen}`, useCase: "Poster", aspectRatio: "1:1" };
      for (const [k, value] of Object.entries({
        routingDecision: { pipeline: "experiment", pipeline_version: "V4.0.5_EXPERIMENT", features_enabled: ["execution_layer_v1"] },
        compiledPrompt: "PROMPT",
        designDocument: doc,
      })) Object.defineProperty(r, k, { value, enumerable: false, configurable: true });
      return r;
    };
    const request = { concept: "cold brew launch", useCase: "Poster", aspectRatio: "1:1", copyItems: LINES, images: [] };
    await recordGeneration({
      request: request as never,
      result: resultFor(editableGen, { ...document, version: 3, editable_mode: true, editable: composed.design }) as never,
      identity: OWNER, projectId: kitRow.data.id, orgId: kitRow.data.org_id,
    });
    // A second, ordinary render: no Editable mode, so no layers.
    await recordGeneration({
      request: request as never,
      result: resultFor(plainGen, document) as never,
      identity: OWNER, projectId: kitRow.data.id, orgId: kitRow.data.org_id,
    });

    const bp = (await db.from("creative_blueprints").select("design_document").eq("run_id", runIds[0]).maybeSingle()).data;
    check("the editable design is stored on the run's blueprint", bp?.design_document?.editable?.version === 3);
    check("its text layers hold the client's exact lines",
      JSON.stringify((bp?.design_document?.editable?.layers || []).filter((l: { kind: string }) => l.kind === "text").map((l: { content: string }) => l.content)) === JSON.stringify(LINES));

    // ── the owner downloads every format ──────────────────────────────────
    console.log("\nDownloads (the owner)");
    const built: Record<string, Buffer> = {};
    for (const format of ["psd", "pptx", "svg", "figma"] as const) {
      const out = await buildExport({ actor: owner.data, generationId: editableGen, format });
      check(`${format}: served from stored design data`, out.ok, out.ok ? "" : out.error);
      if (out.ok) built[format] = out.body;
    }
    if (built.psd) {
      const psd = readPsd(built.psd, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
      const walk = (ns: { name?: string; text?: { text: string }; children?: unknown[] }[]): { name?: string; text?: { text: string } }[] =>
        ns.flatMap((n) => [n, ...(n.children ? walk(n.children as never) : [])]);
      const all = walk(psd.children as never);
      const psdText = all.filter((n) => n.text).map((n) => oneLine(n.text!.text));
      check("the PSD has separate layers, with the exact lines as live text",
        all.length >= 7 && LINES.every((l) => psdText.includes(l)),
        `layers=${all.length} text=${JSON.stringify(psdText)}`);
    }
    if (built.svg) {
      const svg = built.svg.toString("utf-8");
      const svgText = [...svg.matchAll(/<text[\s\S]*?<\/text>/g)].map((m) => svgTextOf(m[0]));
      check("the SVG keeps the lines as text", LINES.every((l) => svgText.includes(l)), JSON.stringify(svgText));
    }
    if (built.pptx) check("the Canva file is a real package", built.pptx.subarray(0, 2).toString("latin1") === "PK");

    const cached = await buildExport({ actor: owner.data, generationId: editableGen, format: "psd" });
    check("a second download is served from the cache beside the render", cached.ok && cached.cached === true);

    // ── nobody else ───────────────────────────────────────────────────────
    console.log("\nIsolation (Firebase identity + Supabase membership)");
    for (const format of ["psd", "svg"] as const) {
      const out = await buildExport({ actor: other.data, generationId: editableGen, format });
      check(`another person cannot download the ${format}`, !out.ok && out.status === 404, out.ok ? "served" : out.error);
    }
    const missing = await buildExport({ actor: owner.data, generationId: `gen-does-not-exist-${STAMP}`, format: "psd" });
    check("a run that does not exist answers exactly as one you cannot see", !missing.ok && missing.status === 404 && missing.error === "not found");

    const plain = await buildExport({ actor: owner.data, generationId: plainGen, format: "psd" });
    check("a render made without Editable mode explains itself instead of serving a flat file",
      !plain.ok && plain.status === 409 && /not made in Editable mode/.test(plain.error), plain.ok ? "served" : plain.error);
  } catch (e) {
    failed++;
    console.error("verification failed:", e instanceof Error ? e.stack : String(e));
  } finally {
    try {
      for (const gen of [editableGen, plainGen]) {
        const dir = generationDir(gen);
        if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
      await db.from("creative_runs").delete().in("id", runIds);
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
        db.from("creative_runs").select("id", { count: "exact", head: true }).in("id", runIds),
      ]);
      const files = [editableGen, plainGen].filter((g) => fs.existsSync(generationDir(g) || "")).length;
      console.log(`\ncleanup: profiles=${left[0].count} runs=${left[1].count} dirs=${files}`);
    } catch (e) {
      console.error("CLEANUP FAILED — inspect manually:", e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
