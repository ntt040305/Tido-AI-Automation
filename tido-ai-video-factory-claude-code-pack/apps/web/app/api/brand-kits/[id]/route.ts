import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider, getInfrastructure } from "@tido/infrastructure";
import { loadBrandKitForRender, saveBrandKit } from "@/lib/brand-kit/brand-kit-store";

export const runtime = "nodejs";

/**
 * Phase 5.4 — one Brand Kit.
 *
 * GET returns the kit (without logo bytes) and, with `?logo=1`, the logo image
 * itself. PUT updates it (multipart: `kit` JSON, optional `logo` file,
 * `removeLogo=1`). A kit the person cannot see answers 404 exactly as a kit
 * that does not exist, so ids cannot be probed.
 */
async function actorFor(req: NextRequest) {
  const identity = await getIdentityProvider().identify(req);
  if (!identity) return null;
  const resolved = await getInfrastructure().identity.resolveActor(identity);
  return resolved.ok ? resolved.data : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await actorFor(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use brand kits." }, { status: 401 });
  const { id } = await params;
  const loaded = await loadBrandKitForRender(actor, id);
  if (!loaded) return NextResponse.json({ error: "Brand kit not found." }, { status: 404 });

  if (req.nextUrl.searchParams.get("logo") === "1") {
    if (!loaded.logo) return NextResponse.json({ error: "This brand kit has no logo." }, { status: 404 });
    return new NextResponse(new Uint8Array(loaded.logo.buffer), {
      headers: { "Content-Type": loaded.logo.mimeType, "Cache-Control": "private, max-age=300" },
    });
  }
  return NextResponse.json({ kit: loaded.summary });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await actorFor(req);
  if (!actor) return NextResponse.json({ error: "Sign in to use brand kits." }, { status: 401 });
  const { id } = await params;

  let kit: unknown = null;
  let logo: Buffer | null = null;
  let removeLogo = false;
  try {
    const form = await req.formData();
    kit = JSON.parse(String(form.get("kit") || "null"));
    removeLogo = form.get("removeLogo") === "1";
    const file = form.get("logo");
    if (file instanceof File && file.size) logo = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Send the kit as multipart form data with a `kit` JSON field." }, { status: 400 });
  }

  const saved = await saveBrandKit(actor, { id, kit, logo, removeLogo });
  if (!saved.ok) {
    const status = /not found|not a member/i.test(saved.error) ? 404 : /permission|cannot|not allowed|writer/i.test(saved.error) ? 403 : 400;
    return NextResponse.json({ error: status === 404 ? "Brand kit not found." : saved.error }, { status });
  }
  return NextResponse.json({ kit: saved.data });
}
