import crypto from "crypto";
import sharp from "sharp";
import { getInfrastructure, personalOrgId } from "@tido/infrastructure";
import type { Actor, DbResult, Project } from "@tido/shared";
import { normalizeBrandKit, type BrandKit } from "@/lib/image-engine/evolution/experiment/BrandKit";

/**
 * Phase 5.4 — where a Brand Kit is kept, and how a render gets it.
 *
 * A Brand Kit is a project whose `brand_context` carries a `brand_kit`
 * document (0001 made that column for brand identity; 0013 indexed it). That
 * reuse is the whole security model: projects are org-scoped, readable by
 * members and writable by writers, and every path below goes through the
 * projects repository, which checks exactly that against the verified actor.
 * Nothing here takes an org or user id from a request.
 *
 * THE LOGO
 * --------
 * Stored in the row, normalised to a PNG of at most 512px and a few hundred KB.
 * The project has no storage bucket, and a bucket would be a second security
 * surface with its own policies; a logo small enough to sit in the row inherits
 * the row's. Listings strip the bytes -- only a render, or a person explicitly
 * opening one kit, ever loads them.
 */

const LOGO_MAX_PX = 512;
const LOGO_MAX_BYTES = 400_000;

export interface StoredLogo {
  mime: "image/png";
  data_base64: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
}

interface StoredBrandKit extends Omit<BrandKit, "has_logo"> {
  version: 1;
  logo?: StoredLogo | null;
}

export interface BrandKitSummary {
  id: string;
  org_id: string;
  /** The kit as the engine reads it: `has_logo`, never the bytes. */
  kit: BrandKit;
  updated_at: string;
}

/** Normalises an uploaded logo, or throws with a message a person can act on. */
export async function normalizeLogo(buffer: Buffer): Promise<StoredLogo> {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("the logo file is empty");
  let png: Buffer;
  try {
    png = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: LOGO_MAX_PX, height: LOGO_MAX_PX, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new Error("the logo is not an image this system can read");
  }
  if (png.length > LOGO_MAX_BYTES) throw new Error("the logo is too detailed to store; export a simpler version");
  const meta = await sharp(png).metadata();
  return {
    mime: "image/png",
    data_base64: png.toString("base64"),
    sha256: crypto.createHash("sha256").update(png).digest("hex"),
    bytes: png.length,
    width: meta.width || 0,
    height: meta.height || 0,
  };
}

function storedOf(project: Project): StoredBrandKit | null {
  const raw = (project.brand_context as Record<string, unknown> | null)?.brand_kit as StoredBrandKit | undefined;
  return raw && typeof raw === "object" ? raw : null;
}

function summaryOf(project: Project): BrandKitSummary | null {
  const stored = storedOf(project);
  const kit = stored ? normalizeBrandKit({ ...stored, has_logo: Boolean(stored.logo?.data_base64) }) : null;
  return kit ? { id: project.id, org_id: project.org_id, kit, updated_at: project.updated_at } : null;
}

export interface SaveBrandKitInput {
  /** Update this kit; absent creates one. */
  id?: string | null;
  /** Workspace for a new kit. Must be one the actor writes to; defaults to their own. */
  orgId?: string | null;
  kit: unknown;
  logo?: Buffer | null;
  removeLogo?: boolean;
}

/** Creates or updates a kit. The repository enforces write access to the workspace. */
export async function saveBrandKit(actor: Actor, input: SaveBrandKitInput): Promise<DbResult<BrandKitSummary>> {
  const kit = normalizeBrandKit(input.kit);
  if (!kit) return { ok: false, error: "a brand kit needs at least a name" };
  const infra = getInfrastructure();

  let existing: Project | null = null;
  if (input.id) {
    const found = await infra.projects.get(actor, input.id);
    if (!found.ok) return found;
    existing = found.data;
  }

  let logo: StoredLogo | null = existing ? storedOf(existing)?.logo ?? null : null;
  if (input.removeLogo) logo = null;
  if (input.logo?.length) {
    try {
      logo = await normalizeLogo(input.logo);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const { has_logo: _omit, ...rest } = kit;
  void _omit;
  const stored: StoredBrandKit = { version: 1, ...rest, logo };
  const brandContext = { ...(existing?.brand_context || {}), brand_kit: stored };

  const saved = existing
    ? await infra.projects.update(actor, existing.id, { name: kit.name, brandContext })
    : await infra.projects.create(actor, {
        orgId: input.orgId || personalOrgId(actor) || "",
        name: kit.name,
        brandContext,
      });
  if (!saved.ok) return saved;
  const summary = summaryOf(saved.data);
  return summary ? { ok: true, data: summary } : { ok: false, error: "the kit was saved but could not be read back" };
}

/** Every kit in every workspace the actor belongs to, logos stripped. */
export async function listBrandKits(actor: Actor): Promise<DbResult<BrandKitSummary[]>> {
  const infra = getInfrastructure();
  const out: BrandKitSummary[] = [];
  for (const m of actor.memberships) {
    const listed = await infra.projects.list(actor, m.org_id);
    if (!listed.ok) return listed;
    for (const p of listed.data) {
      const s = summaryOf(p);
      if (s) out.push(s);
    }
  }
  return { ok: true, data: out.sort((a, b) => b.updated_at.localeCompare(a.updated_at)) };
}

export interface LoadedBrandKit {
  summary: BrandKitSummary;
  logo: { buffer: Buffer; mimeType: string } | null;
}

/**
 * One kit, with its logo bytes, for a render. Null when the actor cannot see it
 * -- the repository answers "not found" for both, so an id cannot be probed.
 */
export async function loadBrandKitForRender(actor: Actor, id: string): Promise<LoadedBrandKit | null> {
  const found = await getInfrastructure().projects.get(actor, id);
  if (!found.ok) return null;
  const summary = summaryOf(found.data);
  if (!summary) return null;
  const stored = storedOf(found.data);
  const logo = stored?.logo?.data_base64 ? { buffer: Buffer.from(stored.logo.data_base64, "base64"), mimeType: stored.logo.mime } : null;
  return { summary, logo };
}
