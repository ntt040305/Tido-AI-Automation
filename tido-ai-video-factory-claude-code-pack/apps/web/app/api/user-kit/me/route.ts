import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider } from "@tido/infrastructure";
import { loadKitForIdentity } from "@/lib/user-kit/kit-memory";
import {
  preferenceDecisions,
  summarizeUserKit,
} from "@/lib/image-engine/evolution/experiment/UserKit";

/**
 * What the system has learned about this person, in their own words.
 *
 * Only preferences that have actually qualified are returned -- the same
 * threshold the engine uses. Showing someone a "preference" the engine would
 * refuse to act on would misrepresent what the memory is doing.
 */
export async function GET(req: NextRequest) {
  const identity = await getIdentityProvider().identify(req);
  if (!identity) return NextResponse.json({ kit: null });

  // Reads the database when there is one and the files when there is not.
  // A person who has taught the system nothing yet and a person whose memory
  // could not be read both come back with no active preferences, which is the
  // same answer either way: render from the brief alone.
  const kit = await loadKitForIdentity(identity);
  if (!kit || kit.preferences.length === 0) {
    return NextResponse.json({ kit: { observed_runs: kit?.observed_runs ?? 0, summary: null, active: [] } });
  }

  return NextResponse.json({
    kit: {
      observed_runs: kit.observed_runs,
      summary: summarizeUserKit(kit) ?? null,
      active: preferenceDecisions(kit).map((p) => ({
        area: p.area,
        value: p.decision.value,
        because: p.decision.because,
        confidence: p.decision.confidence,
        negative: p.negative,
      })),
    },
  });
}
