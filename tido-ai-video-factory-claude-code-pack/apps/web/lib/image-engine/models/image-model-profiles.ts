/**
 * The two image models this system can send a render to, and the facts that
 * differ between them.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Model-specific facts were scattered across the live path as literals: the
 * provider id defaulted in five places (`ImgStudioImageGenerationProvider.ts:75`,
 * `ImageGenerationService.ts:30` and `:39`, `CampaignOrchestratorService.ts:214`,
 * `SimpleImageGenerationOrchestratorService.ts:867`), the resolution tier
 * defaulted to "1K" in one place and "2K" in another
 * (`config.ts:128` vs `CampaignOrchestratorService.ts:218`), and the reference
 * ceiling said **3** (`config.ts:172-175`) when the provider that is now active
 * refuses a third. One row per model, read in one place, is the whole point.
 *
 * NOT a registry, not a selector, not a UI. Two rows. Adding a third model later
 * is one more row and nothing else.
 *
 * EVIDENCE DISCIPLINE
 * -------------------
 * Every Sunburst value below carries a comment pointing at the measurement in
 * `docs/migration/03-provider-capabilities.md`, which records 14 real calls.
 * Anything that run did not establish is marked UNVERIFIED in place rather than
 * filled with a plausible guess.
 *
 * Pure. No I/O, no clock, no network.
 */

/** Which prompt dialect a model is written for. */
export type PromptDialect = "gpt-image" | "gemini";

export interface ImageModelProfile {
  /** The `provider_id` ImgStudio expects. Also the key this profile is found by. */
  providerId: string;
  /** For logs and documents. Never sent to the provider. */
  displayName: string;
  promptDialect: PromptDialect;
  /** Ratios the provider accepts. Anything else is refused before the wire. */
  ratios: readonly string[];
  /** The `resolution` field value. */
  resolutionTier: string;
  /** The `quality` field value. */
  quality: string;
  /**
   * Images the provider accepts in ONE call. A hard ceiling: it answers one more
   * with HTTP 400 before rendering anything.
   *
   * This is not how many images the user may attach. More than this many are
   * packed into this many reference sheets — see `reference-allocation.ts`.
   */
  maxReferences: number;
  /** Panels one packed sheet may carry before the panels stop being legible. */
  maxPanelsPerSheet: number;
  /**
   * Longest side, in pixels, below which a packed product panel is too small to
   * carry identity. A warning, never a refusal.
   */
  minPanelLongestSidePx: number;
  /** Pixel edge of a packed reference sheet. */
  sheetSizePx: number;
  /** Provider-call ceiling in ms. */
  timeoutMs: number;
  /** Measured latency, for the record. Null where it was never measured. */
  latencyMs: { p50: number | null; max: number | null; samples: number | null };
  /** What this row's own measurement run did not settle. */
  unverified: readonly string[];
}

/**
 * GPT-Image-2.5-Sunburst, via ImgStudio. The default.
 *
 * Everything here comes from the probe run recorded in
 * `docs/migration/03-provider-capabilities.md` — 14 calls, 1,950 VND.
 */
const SUNBURST: ImageModelProfile = {
  // 03 §intro: taken from the ImgStudio web UI request and confirmed by the API,
  // which answered `provider_name: "GPT-Image-2.5-Sunburst"` on every success.
  providerId: "0927e191-1aef-4c56-a3ac-df0c47d84e80",
  displayName: "GPT-Image-2.5-Sunburst",
  promptDialect: "gpt-image",
  // 03 §2.2: measured with `sharp`, not derived — 1:1 → 1024×1024, 9:16 → 720×1280,
  // 16:9 → 1280×720. 4:5 was refused with HTTP 400 "Tỷ lệ ảnh không hợp lệ" before
  // rendering, and was not charged.
  ratios: ["1:1", "9:16", "16:9"],
  // 03 §2.2: the `size` field is accepted and IGNORED (asked 1280×720 at ratio
  // 1:1, got 1024×1024), so the tier plus the ratio is what decides the pixels.
  // 1K is deliberate: the only tier this run priced and measured.
  resolutionTier: "1K",
  // 03 §2.2: sent exactly as the ImgStudio web UI sends it. The API echoes
  // "standard" whatever is sent, and "high" cost the same, produced the same
  // dimensions and showed no visible difference across calls 1-3.
  // UNVERIFIED-EFFECT: harmless, matches the web UI, and nothing measured says it
  // changes the image.
  quality: "high",
  // 03 §2.2: a third image was refused with HTTP 400 "Provider này chỉ hỗ trợ
  // chỉnh sửa tối đa 2 ảnh mỗi lần.", before rendering, not charged. Four likewise.
  // NOTE: `config.ts:172-175` claimed 3 for every ImgStudio model. That number was
  // right for Nano Banana 2 and wrong for this one.
  maxReferences: 2,
  // Not a provider fact. A legibility judgement: four panels on a 1024 px sheet
  // leaves each panel ~512 px on its longest side, which is the floor below.
  maxPanelsPerSheet: 4,
  minPanelLongestSidePx: 512,
  // Matches the 1K output tier, so a sheet is never upscaled by the provider.
  sheetSizePx: 1024,
  // 03 §2.3: observed maximum 76.4 s on an ordinary two-image edit, n = 11, so the
  // tail is not characterised. 160 s is the existing ceiling and already covers
  // twice the worst observation; it is kept rather than tightened toward a median.
  timeoutMs: 160000,
  // 03 §2.3: identical-settings samples 17.3 / 17.9 / 23.6 s.
  latencyMs: { p50: 17900, max: 76400, samples: 11 },
  unverified: [
    "whether quality:\"high\" reaches the model at all — the API echoes \"standard\"",
    "the maximum prompt length this provider accepts (every probe prompt was short)",
    "the latency tail: n = 11 is too small for a p95",
    "shape fidelity against a real product photograph (the probe reference was a flat graphic)",
    "whether a logo image counts toward the 2-image limit differently from a product",
    "behaviour under concurrent requests",
    "resolution tiers above 1K: accepted values and prices",
  ],
};

/**
 * Nano Banana 2, via ImgStudio. The rollback.
 *
 * Every value is what the live path sends today, so switching back changes the
 * request bytes to exactly what they were. `run-imgstudio-tests.ts` pins that.
 */
const NANO_BANANA_2: ImageModelProfile = {
  providerId: "flow-nano-banana-2",
  displayName: "Nano Banana 2",
  promptDialect: "gemini",
  // `config.ts:157` IMGSTUDIO_SUPPORTED_ASPECT_RATIOS, unchanged.
  ratios: ["1:1", "9:16", "16:9"],
  // `config.ts:128` TIDO_IMAGE_OUTPUT_SIZE default.
  resolutionTier: "1K",
  // `ImgStudioImageGenerationProvider.ts:77` default, unchanged.
  quality: "standard",
  // `config.ts:172-175`, the number this model was measured against.
  maxReferences: 3,
  maxPanelsPerSheet: 9, // PACKING_DEFAULTS.maxCells as it has always been
  minPanelLongestSidePx: 341, // 1024 / 3, the 3x3 grid this model's ceiling allows
  sheetSizePx: 1024, // PACKING_DEFAULTS.sheetSize as it has always been
  timeoutMs: 160000, // config.ts:131 GENERATION_TIMEOUT_MS
  latencyMs: { p50: 61900, max: null, samples: null }, // 02-plan.md K1
  unverified: ["the latency maximum was never recorded for this model"],
};

export const IMAGE_MODEL_PROFILES: readonly ImageModelProfile[] = [SUNBURST, NANO_BANANA_2];

/** The row the system falls back to when `IMGSTUDIO_PROVIDER_ID` names nothing known. */
export const DEFAULT_PROFILE = SUNBURST;

export { SUNBURST, NANO_BANANA_2 };

export type EnvLike = Record<string, string | undefined>;

/**
 * The profile for an explicit provider id.
 *
 * Returns null for an id neither row declares, so a caller can decide between
 * refusing and falling back. It does not guess a dialect: sending a GPT-dialect
 * prompt to an unknown model, or a Gemini one, is a decision with a cost and is
 * not made here by accident.
 */
export function profileForProviderId(providerId: string | null | undefined): ImageModelProfile | null {
  const id = String(providerId || "").trim();
  if (!id) return null;
  return IMAGE_MODEL_PROFILES.find((p) => p.providerId === id) || null;
}

/**
 * The active profile, from the environment.
 *
 * `IMGSTUDIO_PROVIDER_ID` is the one switch. Rolling back to Nano Banana 2 is
 * setting it to `flow-nano-banana-2` and restarting — no code change, no flag, no
 * deploy. An id that matches no row falls back to the default and says so, loudly,
 * because the alternative is a render that silently used a dialect nobody chose.
 */
export function activeProfile(env: EnvLike = process.env): ImageModelProfile {
  const id = env.IMGSTUDIO_PROVIDER_ID;
  const found = profileForProviderId(id);
  if (found) return found;
  if (id && String(id).trim()) {
    console.warn(
      `[IMAGE_MODEL_PROFILE] IMGSTUDIO_PROVIDER_ID="${id}" matches no profile; ` +
        `falling back to ${DEFAULT_PROFILE.displayName} (${DEFAULT_PROFILE.promptDialect} dialect). ` +
        `Known ids: ${IMAGE_MODEL_PROFILES.map((p) => p.providerId).join(", ")}`,
    );
  }
  return DEFAULT_PROFILE;
}

/** Counts and ids only, for a log line. Never a key. */
export function profileTelemetry(p: ImageModelProfile = activeProfile()) {
  return {
    model: p.displayName,
    dialect: p.promptDialect,
    resolution: p.resolutionTier,
    quality: p.quality,
    max_references: p.maxReferences,
    max_panels_per_sheet: p.maxPanelsPerSheet,
    timeout_ms: p.timeoutMs,
  };
}
