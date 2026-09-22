import { NextRequest, NextResponse } from "next/server";
import { getIdentityProvider } from "@tido/infrastructure";
import { fileKitStore } from "@/lib/user-kit/kit-store";
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

  const kit = fileKitStore.load(identity.firebaseUid);
  if (!kit) return NextResponse.json({ kit: null });

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
