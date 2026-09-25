import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider } from "@tido/infrastructure";
import { USER_EVENT_KINDS, type UserEventKind } from "@tido/shared";
import { recordApproval } from "@/lib/user-kit/kit-memory";

/**
 * Records an act of approval.
 *
 * This endpoint is the reason the memory can learn at all. Before it, the
 * download button created an anchor element, clicked it, and recorded nothing
 * -- so the one signal the brief names as the primary teacher produced zero
 * events, and any memory built on it would have been permanently empty.
 *
 * Phase 3.1 changed where the signal goes, not what it means. It is now
 * appended to `user_events` before anything is learned from it, and a person
 * who already signalled this about this render is told so rather than counted
 * twice -- see `kit-memory` for why that ordering is the point.
 *
 * The accepted vocabulary is wider than the set that teaches anything.
 * `reject` and `template_use` are recorded and not learned from: a rejection is
 * the one signal that can correct the system rather than agree with it, and it
 * is worth capturing before there is a rule for reading it.
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

  const kind = String(body?.kind || "") as UserEventKind;
  if (!USER_EVENT_KINDS.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${USER_EVENT_KINDS.join(", ")}` },
      { status: 400 },
    );
  }

  const outcome = await recordApproval(identity, {
    kind,
    generationId: String(body?.generationId || ""),
    intelligence: body?.intelligence ?? null,
    context: (body?.context as Record<string, unknown>) ?? {},
  });

  // Counts only. A person's preferences are the most identifying thing this
  // system holds and never belong in a log line.
  console.log("[USER_KIT][SIGNAL]", {
    kind,
    recorded: outcome.recorded,
    duplicate: outcome.duplicate,
    learned: outcome.learned,
    unextracted: outcome.unextracted,
    storage: outcome.storage,
  });

  return NextResponse.json({
    recorded: outcome.recorded,
    duplicate: outcome.duplicate,
    learned: outcome.learned,
  });
}
