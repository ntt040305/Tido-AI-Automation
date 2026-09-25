import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider, getInfrastructure } from "@tido/infrastructure";
import { listBrandKits, saveBrandKit } from "@/lib/brand-kit/brand-kit-store";

export const runtime = "nodejs";

/**
 * Phase 5.4 — Brand Kits.
 *
 * GET  lists the kits in every workspace the signed-in person belongs to.
 * POST creates one (multipart: `kit` as JSON, optional `logo` file).
 *
 * Signed out is a 401 here, unlike the render route: a brand kit is stored
 * identity, and there is nobody to store it for. Who someone is comes only
 * from a verified Firebase token; which workspaces they may read or write is
 * decided by the projects repository, never by the request.
 */
async function actorFor(req: NextRequest) {
  const identity = await getIdentityProvider().identify(req);
  if (!identity) return null;
  const resolved = await getInfrastructure().identity.resolveActor(identity);
  return resolved.ok ? resolved.data : null;
}

export async function GET(req: NextRequest) {
  const actor = await actorFor(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use brand kits." }, { status: 401 });
  const kits = await listBrandKits(actor);
  if (!kits.ok) return NextResponse.json({ error: "Brand kits are unavailable right now." }, { status: 503 });
  return NextResponse.json({ kits: kits.data });
}

export async function POST(req: NextRequest) {
  const actor = await actorFor(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use brand kits." }, { status: 401 });

  let kit: unknown = null;
  let logo: Buffer | null = null;
  let orgId: string | null = null;
  try {
    const form = await req.formData();
    kit = JSON.parse(String(form.get("kit") || "null"));
    orgId = (form.get("orgId") as string) || null;
    const file = form.get("logo");
    if (file instanceof File && file.size) logo = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Send the kit as multipart form data with a `kit` JSON field." }, { status: 400 });
  }

  const saved = await saveBrandKit(actor, { kit, logo, orgId });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  return NextResponse.json({ kit: saved.data }, { status: 201 });
}
