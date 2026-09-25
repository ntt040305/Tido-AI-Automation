import fs from "fs";
import path from "path";
import type { Actor } from "@tido/shared";
import { getInfrastructure } from "@tido/infrastructure";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import { runUuid } from "@/lib/persistence/record-generation";
import type { EditableDesign } from "@/lib/image-engine/evolution/experiment/EditableDesign";
import { FORMATS, designTextCount, type EditableFormat, type LayerAssets } from "./builders";

/**
 * Phase 5.5 — serving an editable export.
 *
 * WHO MAY HAVE ONE
 * ----------------
 * Only someone the run belongs to. The check is the runs repository's own --
 * the run is theirs, or it is in a workspace they are a member of -- and a run
 * they cannot see answers exactly as one that does not exist. An anonymous
 * render belongs to nobody and is exportable by nobody, which is why Editable
 * mode is offered only to a signed-in person in the first place.
 *
 * WHAT IS EXPORTED
 * ----------------
 * `creative_blueprints.design_document.editable` -- the design the render was
 * composed from -- and the layer assets stored beside that render. The served
 * PNG is never read back and nothing is recovered from pixels.
 */

const MAX_BYTES = 64 * 1024 * 1024;

export interface ExportRequest {
  actor: Actor;
  /** The engine's generation id, as the client holds it. */
  generationId: string;
  format: EditableFormat;
}

export type ExportOutcome =
  | { ok: true; body: Buffer; filename: string; mime: string; cached: boolean }
  | { ok: false; status: 404 | 409 | 500; error: string };

/** Layer assets live beside their render; the guard is the storage layer's. */
export function generationDir(generationId: string): string | null {
  if (!generationId || /[\\/]|\.\./.test(generationId)) return null;
  const base = path.resolve(IMAGE_ENGINE_CONFIG.GENERATED_DIR);
  const dir = path.resolve(base, generationId);
  return dir.startsWith(base + path.sep) ? dir : null;
}

const readIf = (p: string): Buffer | null => (fs.existsSync(p) ? fs.readFileSync(p) : null);

/** A filename a person can find again: brand, format, short id. */
export function exportFilename(design: EditableDesign, generationId: string, ext: string): string {
  const brand = (design.brand?.name || "tido")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "tido";
  const short = generationId.replace(/[^A-Za-z0-9]/g, "").slice(-8);
  return `${brand}-design-${short}.${ext}`;
}

/**
 * Builds (or serves from cache) one editable file.
 *
 * Files are cached beside the render because they are deterministic: the same
 * design and the same assets produce the same bytes, and a PSD costs real CPU.
 * Nothing is queued -- a build is well under a second at these sizes -- but the
 * cache is what a queue would write to, so adding one later changes only who
 * calls this.
 */
export async function buildExport(req: ExportRequest): Promise<ExportOutcome> {
  const spec = FORMATS[req.format];
  if (!spec) return { ok: false, status: 404, error: "unknown format" };

  const dir = generationDir(req.generationId);
  if (!dir) return { ok: false, status: 404, error: "not found" };

  // Authorisation first, and against the run -- never against the directory.
  const runId = runUuid(req.generationId);
  const infra = getInfrastructure();
  const run = await infra.runs.get(req.actor, runId);
  if (!run.ok) return { ok: false, status: 404, error: "not found" };

  const stored = await infra.intelligence.getForRun(req.actor, runId);
  if (!stored.ok) return { ok: false, status: 404, error: "not found" };
  const doc = stored.data.blueprint?.design_document as { editable?: EditableDesign } | null | undefined;
  const design = doc?.editable;
  if (!design) {
    return {
      ok: false,
      status: 409,
      error: "This image was not made in Editable mode, so it has no separate layers to export. Turn on Editable export and generate again.",
    };
  }

  const cachePath = path.join(dir, "exports", exportFilename(design, req.generationId, spec.ext));
  const cached = readIf(cachePath);
  if (cached) return { ok: true, body: cached, filename: path.basename(cachePath), mime: spec.mime, cached: true };

  const scene = readIf(path.join(dir, "layers", "scene.png"));
  if (!scene) return { ok: false, status: 409, error: "the layer assets for this render are no longer on disk" };
  const assets: LayerAssets = {
    scene,
    logo: readIf(path.join(dir, "layers", "logo.png")),
    composite: readIf(path.join(dir, "output.png")),
  };

  try {
    const body = await spec.build(design, assets);
    if (body.length > MAX_BYTES) return { ok: false, status: 500, error: "the export came out too large to serve" };
    // A file with no text layer for a design that has text is a broken
    // deliverable; better to fail than to hand someone a flattened lie.
    if (req.format !== "figma" && designTextCount(design) > 0 && body.length < 1024) {
      return { ok: false, status: 500, error: "the export came out empty" };
    }
    try {
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      fs.writeFileSync(cachePath, body);
    } catch {
      // A cache that cannot be written is not a failed export.
    }
    return { ok: true, body, filename: path.basename(cachePath), mime: spec.mime, cached: false };
  } catch (e) {
    console.error("[EXPORT] build failed", { format: req.format, error: e instanceof Error ? e.message : String(e) });
    return { ok: false, status: 500, error: "the export could not be built" };
  }
}
