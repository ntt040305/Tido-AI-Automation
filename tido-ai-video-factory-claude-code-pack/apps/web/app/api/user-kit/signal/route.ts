import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider } from "@tido/infrastructure";
import { fileKitStore, loadOrCreateKit } from "@/lib/user-kit/kit-store";
import {
  learnFromSignal,
  learningTelemetry,
  APPROVAL_KINDS,
  type ApprovalKind,
} from "@/lib/image-engine/evolution/experiment/UserKitLearning";

/**
 * Records an act of approval.
 *
 * This endpoint is the reason the memory can learn at all. Before it, the
 * download button created an anchor element, clicked it, and recorded nothing
 * -- so the one signal the brief names as the primary teacher produced zero
 * events, and any memory built on it would have been permanently empty.
 *
 * Signed out is not an error. Most people using this will never have an
 * account, and their renders must work exactly as before; there is simply
 * nobody to attribute the preference to, so nothing is stored.
 */
export async function POST(req: NextRequest) {
  const identity = await getIdentityProvider().identify(req);
  if (!identity) {
    // 200, not 401. The caller is a fire-and-forget button; a failing request
    // behind a download would surface as a console error on a working download.
    return NextResponse.json({ recorded: false, reason: "not signed in" });
  }

  // `unknown` rather than `any`: every field below is read off a request
  // body, so the compiler should force a check at each one rather than let
  // the shape be assumed.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const kind = String(body?.kind || "") as ApprovalKind;
  if (!APPROVAL_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${APPROVAL_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  const result = learnFromSignal(loadOrCreateKit(identity.firebaseUid), {
    kind,
    generation_id: String(body?.generationId || ""),
    at: new Date().toISOString(),
    intelligence: body?.intelligence ?? null,
  });

  fileKitStore.save(result.kit);

  // Counts only. A person's preferences are the most identifying thing this
  // system holds and never belong in a log line.
  console.log("[USER_KIT][SIGNAL]", { kind, ...learningTelemetry(result) });

  return NextResponse.json({ recorded: true, learned: result.learned });
}
