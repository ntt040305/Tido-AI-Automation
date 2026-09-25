import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider, getInfrastructure } from "@tido/infrastructure";
import { buildExport } from "@/lib/design-export/export-service";
import { FORMATS, type EditableFormat } from "@/lib/design-export/builders";

export const runtime = "nodejs";

/**
 * Phase 5.5 — download one render as an editable design file.
 *
 *   GET /api/exports/<generationId>?format=psd|pptx|svg|figma
 *
 * Signing in is required and the run must be the person's own, or in one of
 * their workspaces: unlike the rendered PNG, these files are built from stored
 * design data, so they are served only to someone entitled to that run. A run
 * they cannot see answers 404 exactly as a missing one.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ generationId: string }> }) {
  const identity = await getIdentityProvider().identify(req);
  if (!identity) return NextResponse.json({ error: "Sign in to download editable files." }, { status: 401 });
  const resolved = await getInfrastructure().identity.resolveActor(identity);
  if (!resolved.ok) return NextResponse.json({ error: "Sign in to download editable files." }, { status: 401 });

  const { generationId } = await params;
  const format = String(req.nextUrl.searchParams.get("format") || "") as EditableFormat;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: `Unknown format. Use one of: ${Object.keys(FORMATS).join(", ")}.` }, { status: 400 });
  }

  const out = await buildExport({ actor: resolved.data, generationId, format });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });

  return new NextResponse(new Uint8Array(out.body), {
    headers: {
      "Content-Type": out.mime,
      "Content-Length": String(out.body.length),
      "Content-Disposition": `attachment; filename="${out.filename}"`,
      // Private: these carry the person's own design and brand assets.
      "Cache-Control": "private, no-store",
      "X-Export-Cached": out.cached ? "1" : "0",
    },
  });
}
