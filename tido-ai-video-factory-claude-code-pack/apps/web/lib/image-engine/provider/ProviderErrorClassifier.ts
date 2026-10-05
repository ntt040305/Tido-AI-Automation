/**
 * CIOS Phase 4.0.7.1 — what kind of failure this is.
 *
 * The bug this replaces
 * --------------------
 * The provider had two buckets: 400/401/403 stopped, and *everything else*
 * retried. A 413 is everything else, so an oversized payload was retried three
 * times — unchanged, because nothing between attempts touched the images — and
 * every attempt was rejected for the identical reason. Three provider calls and
 * most of the route budget spent discovering the same fact, then reported to the
 * user as "network/server error", which named neither the cause nor the fix.
 *
 * The distinction that matters is not client-versus-server. It is whether
 * retrying the *same request* could plausibly produce a different answer:
 *
 *   429, 5xx              the request is fine, the server was not. Retry.
 *   timeout               NOT retried: the server may still be working on, and
 *                         billing for, the request we stopped waiting for.
 *   413                   the request is the problem, and it is fixable here.
 *                         Do not retry it — change it, then retry once.
 *   400, 401, 403         the request is the problem and this layer cannot fix
 *                         it. Stop, and say so.
 */

import { GenerationErrorCode } from "../types";

export type ProviderErrorClassification =
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMIT"
  | "UPSTREAM_FAILURE"
  | "INVALID_REQUEST"
  | "AUTH_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export type ProviderErrorAction =
  /** Retry the same request after a wait. */
  | "RETRY_WITH_BACKOFF"
  /** Do not retry as-is: normalize the payload, then make exactly one more attempt. */
  | "NORMALIZE_AND_RETRY_ONCE"
  /** No retry can help. Return a meaningful error. */
  | "STOP";

export interface ProviderErrorVerdict {
  status: number;
  classification: ProviderErrorClassification;
  action: ProviderErrorAction;
  retryable: boolean;
  /** Stable code for the caller and the UI. */
  error_code: GenerationErrorCode;
  /** Which part of the pipeline owns this failure. */
  stage: string;
  /** What can be done about it, in the user's terms. */
  suggestion: string;
}

/** How many attempts each classification is worth, beyond the first. */
export const RETRY_BUDGET: Record<ProviderErrorClassification, number> = {
  PAYLOAD_TOO_LARGE: 1, // one, and only after the payload has actually changed
  RATE_LIMIT: 3,
  UPSTREAM_FAILURE: 2,
  NETWORK_ERROR: 2,
  INVALID_REQUEST: 0,
  AUTH_ERROR: 0,
  UNKNOWN: 1,
};

export class ProviderErrorClassifier {
  /** Classifies an HTTP response status. */
  public static classify(status: number): ProviderErrorVerdict {
    if (status === 413) {
      return {
        status,
        classification: "PAYLOAD_TOO_LARGE",
        action: "NORMALIZE_AND_RETRY_ONCE",
        // Not retryable *as sent*. The retry is legitimate only because the
        // payload is rebuilt between attempts; retrying the same bytes is what
        // the old code did and it could never have worked.
        retryable: false,
        error_code: "IMAGE_PAYLOAD_TOO_LARGE",
        stage: "IMAGE_PREPROCESSOR",
        suggestion: "Images were compressed automatically",
      };
    }
    if (status === 429) {
      return {
        status,
        classification: "RATE_LIMIT",
        action: "RETRY_WITH_BACKOFF",
        retryable: true,
        error_code: "PROVIDER_RATE_LIMIT",
        stage: "IMG_PROVIDER",
        suggestion: "Provider is rate limiting, retrying shortly",
      };
    }
    if (status === 400) {
      return {
        status,
        classification: "INVALID_REQUEST",
        action: "STOP",
        retryable: false,
        error_code: "PROVIDER_INVALID_REQUEST",
        stage: "IMG_PROVIDER",
        suggestion: "The request was rejected as invalid; check the aspect ratio and inputs",
      };
    }
    if (status === 401 || status === 403) {
      return {
        status,
        classification: "AUTH_ERROR",
        action: "STOP",
        retryable: false,
        error_code: "PROVIDER_AUTH_ERROR",
        stage: "IMG_PROVIDER",
        suggestion: "Provider credentials were rejected; check IMGSTUDIO_API_KEY",
      };
    }
    if (status >= 500) {
      return {
        status,
        classification: "UPSTREAM_FAILURE",
        action: "RETRY_WITH_BACKOFF",
        retryable: true,
        error_code: "PROVIDER_UPSTREAM_FAILURE",
        stage: "IMG_PROVIDER",
        suggestion: "Provider unavailable, retry later",
      };
    }
    // Any other 4xx is the client's fault and this layer cannot mend it.
    if (status >= 400) {
      return {
        status,
        classification: "INVALID_REQUEST",
        action: "STOP",
        retryable: false,
        error_code: "PROVIDER_INVALID_REQUEST",
        stage: "IMG_PROVIDER",
        suggestion: "The request was rejected by the provider and cannot be retried as sent",
      };
    }
    return {
      status,
      classification: "UNKNOWN",
      action: "RETRY_WITH_BACKOFF",
      retryable: true,
      error_code: "PROVIDER_UNKNOWN_ERROR",
      stage: "IMG_PROVIDER",
      suggestion: "Unrecognised provider response, retrying once",
    };
  }

  /**
   * Classifies a thrown transport error — no response ever arrived.
   *
   * Kept separate from status classification because there is no status to read:
   * a socket that never answered is a different fact from a server that answered
   * 500, even though both are worth retrying.
   */
  public static classifyThrown(err: unknown): ProviderErrorVerdict {
    const message = (err as { message?: string })?.message || String(err);
    const timedOut = /timeout|ETIMEDOUT|ConnectTimeout|aborted/i.test(message);
    return {
      status: 0,
      classification: "NETWORK_ERROR",
      // A timeout is final. The reseller may already be rendering -- and billing --
      // the request we stopped waiting for, so a retry can pay for one image twice.
      // A connection that never opened reached nobody and is still worth retrying.
      action: timedOut ? "STOP" : "RETRY_WITH_BACKOFF",
      retryable: !timedOut,
      error_code: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
      stage: "IMG_PROVIDER",
      suggestion: timedOut
        ? "Provider did not answer in time, retry later"
        : "Provider unreachable, retry later",
    };
  }

  /** Whether another attempt is allowed for this verdict at this attempt number. */
  public static mayRetry(verdict: ProviderErrorVerdict, attemptsMade: number): boolean {
    if (verdict.action === "STOP") return false;
    return attemptsMade <= RETRY_BUDGET[verdict.classification];
  }
}
