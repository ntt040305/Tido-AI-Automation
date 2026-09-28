/**
 * Phase 10.3 — a ceiling on how fast one caller can spend money.
 *
 * WHAT THE AUDIT ACTUALLY FOUND
 * -----------------------------
 * Not two stray endpoints. Anonymous rendering is a PRODUCT DECISION here, and
 * a deliberate one: the main render route resolves an identity when there is a
 * token and renders anyway when there is not, because "a kit is an assist,
 * never a reason to fail a render". The campaign routes are consistent with
 * that rather than exceptions to it.
 *
 * So requiring authentication would change the product, break the campaign
 * page, and is not this module's decision to make. What was missing is the
 * thing that makes anonymous access survivable: a LIMIT. Every paid path —
 * image generation, campaign planning, single-asset rendering — could be
 * called in a loop by anyone who could reach it, at 100 VND a render.
 *
 * WHY IN MEMORY
 * -------------
 * This is an internal single-instance tool; the architecture notes say Redis is
 * not a source of truth and nothing here needs to survive a restart. A counter
 * in a Map is proportionate. On more than one instance each gets its own
 * budget, which is a weaker ceiling than intended but still a ceiling, and the
 * limit is deliberately low enough that the difference does not matter.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It does not authenticate, authorise or identify anyone. A verified caller
 * simply gets their own bucket instead of sharing the anonymous one, so one
 * signed-in person cannot be starved by an anonymous flood.
 */

/** A fixed window. Simple on purpose: a token bucket would be more precise and
 * harder to reason about at three in the morning when renders are being
 * refused and somebody needs to know why. */
interface Window {
  count: number;
  /** When this window opened, in ms. */
  since: number;
}

const WINDOWS = new Map<string, Window>();

/** How many paid renders one caller may start per window. */
export const RENDER_LIMIT = 12;
/** The window, in milliseconds. */
export const RENDER_WINDOW_MS = 60_000;
/** Stops the map growing without bound when many callers appear once each. */
const MAX_TRACKED = 5_000;

export interface RateDecision {
  ok: boolean;
  /** How many remain in this window. */
  remaining: number;
  /** Seconds until the window resets. Sent as `Retry-After`. */
  retryAfter: number;
  /** What the caller was counted as. Never logged with the IP itself. */
  bucket: "identified" | "anonymous";
}

/**
 * The key a caller is counted under.
 *
 * A verified subject where there is one, so a signed-in person is limited on
 * their own account rather than sharing a bucket with every anonymous caller
 * behind the same proxy. Otherwise the forwarded address, which is a hint and
 * not an identity -- it is only ever used to separate callers, never to grant
 * anything.
 */
function keyFor(req: { headers: { get(name: string): string | null } }, subject?: string | null): { key: string; bucket: RateDecision["bucket"] } {
  if (subject) return { key: `id:${subject}`, bucket: "identified" };
  const forwarded = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return { key: `ip:${ip}`, bucket: "anonymous" };
}

/**
 * Counts one paid render against the caller's window.
 *
 * Call it once, immediately before the money is spent, and refuse the request
 * when it says no. Calling it on a path that then fails early only costs the
 * caller one of their own allowance, which is the safe direction to err in.
 */
export function chargeRender(
  req: { headers: { get(name: string): string | null } },
  subject?: string | null,
  now: number = Date.now(),
): RateDecision {
  const { key, bucket } = keyFor(req, subject);
  const existing = WINDOWS.get(key);

  if (!existing || now - existing.since >= RENDER_WINDOW_MS) {
    // A new window. Evict opportunistically rather than on a timer: a timer in
    // a module that may be loaded per-request is a leak of its own.
    if (WINDOWS.size >= MAX_TRACKED) {
      for (const [k, w] of WINDOWS) {
        if (now - w.since >= RENDER_WINDOW_MS) WINDOWS.delete(k);
        if (WINDOWS.size < MAX_TRACKED) break;
      }
    }
    WINDOWS.set(key, { count: 1, since: now });
    return { ok: true, remaining: RENDER_LIMIT - 1, retryAfter: 0, bucket };
  }

  const retryAfter = Math.max(1, Math.ceil((RENDER_WINDOW_MS - (now - existing.since)) / 1000));
  if (existing.count >= RENDER_LIMIT) {
    return { ok: false, remaining: 0, retryAfter, bucket };
  }
  existing.count += 1;
  return { ok: true, remaining: RENDER_LIMIT - existing.count, retryAfter, bucket };
}

/** Test seam. Never called in production. */
export function resetRenderLimits(): void {
  WINDOWS.clear();
}
