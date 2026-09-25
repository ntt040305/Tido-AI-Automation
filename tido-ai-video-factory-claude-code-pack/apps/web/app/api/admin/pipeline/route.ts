import { NextRequest, NextResponse } from "next/server";
import { CORE_FEATURES, DEFAULT_FLAGS, EXPERIMENT_FEATURES, readFlags, writeFlags, flagsPath } from "@/lib/image-engine/evolution/feature-flags";
import { comparePipelines, readLog } from "@/lib/image-engine/evolution/ExperimentLogger";
import { COMPONENT_VERSIONS, PIPELINE_VERSIONS } from "@/lib/image-engine/evolution/pipeline-versions";

/**
 * Internal pipeline control.
 *
 * Authorisation is a shared token in `TIDO_ADMIN_TOKEN`, deliberately not tied
 * to any user account. Two reasons: this endpoint changes how the renderer
 * behaves rather than touching anyone's data, and coupling it to the account
 * system would give the evolution layer a reason to read user records, which
 * Part 6 says it must never do.
 *
 * With no token configured the endpoint is writable only from localhost. That
 * makes local development frictionless and means an unconfigured deployment
 * cannot have its pipeline flipped by a stranger. Reads are open, because what
 * they return — which pipeline is active and which flags are on — is operational
 * state, not a secret, and refusing it makes debugging harder for no gain.
 */

function authorized(req: NextRequest): { ok: boolean; reason: string } {
  const configured = (process.env.TIDO_ADMIN_TOKEN || "").trim();
  if (configured) {
    const supplied = (req.headers.get("x-tido-admin-token") || "").trim();
    // Length is compared first so the timing-safe comparison below always gets
    // equal-length inputs.
    if (supplied.length === configured.length && supplied === configured) {
      return { ok: true, reason: "token" };
    }
    return { ok: false, reason: "invalid or missing admin token" };
  }
  const host = (req.headers.get("host") || "").split(":")[0];
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return { ok: true, reason: "localhost, no token configured" };
  }
  return { ok: false, reason: "TIDO_ADMIN_TOKEN is not configured; writes are refused off localhost" };
}

export async function GET() {
  const flags = readFlags();
  return NextResponse.json({
    flags,
    defaults: DEFAULT_FLAGS,
    // Phase 5.5.5: the architecture is not switchable; only experiments are.
    core_features: CORE_FEATURES,
    experiment_features: EXPERIMENT_FEATURES,
    flags_path: flagsPath(),
    pipeline_versions: PIPELINE_VERSIONS,
    component_versions: COMPONENT_VERSIONS,
    kill_switch_active: String(process.env.TIDO_PIPELINE_KILL_SWITCH || "").toLowerCase() === "true",
    comparison: comparePipelines(),
    recent: readLog(25).slice(-25),
  });
}

export async function PUT(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.reason }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON." }, { status: 400 });
  }
  // `writeFlags` normalises against the defaults, so an unknown key, a wrong
  // type or a missing section cannot enable anything.
  const flags = writeFlags(body);
  return NextResponse.json({ success: true, flags, authorized_by: auth.reason });
}

/** Rollback. Separate from PUT so it needs no body and cannot be half-applied. */
export async function DELETE(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.reason }, { status: 403 });
  }
  const flags = writeFlags(DEFAULT_FLAGS);
  console.warn("[EVOLUTION][ROLLBACK] experiments reset: the core architecture only");
  return NextResponse.json({ success: true, flags, rolled_back: true });
}
