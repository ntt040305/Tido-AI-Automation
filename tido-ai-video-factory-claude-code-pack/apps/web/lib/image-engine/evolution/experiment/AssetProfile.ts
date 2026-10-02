/**
 * The Asset Profile — what the channel demands, as numbers.
 *
 * WHY THIS EXISTS
 * ---------------
 * A poster, a banner and a product hero are not one problem at three sizes. A
 * poster has three to ten seconds and has to leave one idea behind. A banner has
 * under a second, while someone is scrolling, and has to be readable at 320px. A
 * product hero is examined, often enlarged, and its job is desire for a surface.
 *
 * The system knew this in prose: `AssetContext` told the director "impact at first
 * glance, before a word has been read". What it never did was change a single
 * NUMBER. Measured on the twelve-case dataset, a banner and a poster received the
 * same cap-height floor, the same string allowance and the same dominance target.
 * Two of the three formats were therefore being briefed as the third.
 *
 * WHAT IT DECIDES AND WHAT IT DOES NOT
 * ------------------------------------
 * Only the constraints that follow from HOW the asset is read: reading time,
 * dominance, the smallest type that survives the channel, and how many strings a
 * reader can take in. It decides nothing creative -- no medium, no ratio, no idea.
 * Those belong to `FinishLayer`, `CinematographyLayer` and `IdeaLayer`, which
 * already carry their own per-format bases; this module is the one place the
 * channel's own arithmetic lives, so the three cannot drift apart.
 *
 * HONESTY ABOUT THE NUMBERS
 * -------------------------
 * The cap-height floors are reasoned from the smallest type that survives a
 * downscale, not measured on renders of this provider. The string allowances come
 * from the cost arithmetic already recorded for one-pass typography: every extra
 * string multiplies the chance of a spelling failure, so a channel that cannot
 * afford a re-render can afford fewer strings.
 *
 * Pure. No model call, no I/O, no clock.
 */

export type AssetFamily = "poster" | "banner" | "social" | "hero";

export interface AssetProfile {
  family: AssetFamily;
  /** How long the viewer gives it, as a self-contained phrase. Drives everything else here. */
  read_time: string;
  /** Share of the frame the dominant element must hold, as a percentage range. */
  dominance_pct: [number, number];
  /**
   * Smallest cap height that survives this channel, as a percentage of frame
   * height. A banner's floor is nearly double a poster's because a banner is
   * delivered at a few hundred pixels and a poster is approached.
   */
  min_cap_height_pct: number;
  /** How many campaign strings this channel can carry before the read breaks. */
  max_strings: number;
  /** What this format has to win, in one line, for BLOCK 1. */
  demands: string;
}

const PROFILES: Record<AssetFamily, AssetProfile> = {
  poster: {
    family: "poster",
    read_time: "three to ten seconds, standing still",
    dominance_pct: [40, 60],
    min_cap_height_pct: 2.2,
    max_strings: 3,
    demands:
      "one idea a viewer could describe afterwards, and a hierarchy the eye follows without being told the order",
  },
  banner: {
    family: "banner",
    read_time: "under a second, while scrolling past",
    dominance_pct: [55, 75],
    min_cap_height_pct: 4,
    max_strings: 2,
    demands:
      "one statement legible at 320 pixels wide and in greyscale; separation and edge cleanliness outrank atmosphere",
  },
  social: {
    family: "social",
    read_time: "one to three seconds, on a held phone",
    dominance_pct: [45, 65],
    min_cap_height_pct: 3,
    max_strings: 3,
    demands: "a frame that survives a thumbnail and rewards a second look at full size",
  },
  hero: {
    family: "hero",
    read_time: "ten seconds or more, often enlarged",
    dominance_pct: [38, 55],
    min_cap_height_pct: 2.2,
    max_strings: 1,
    demands:
      "surface truth under inspection: the product's material, edges and markings hold at 200% magnification",
  },
};

/** Which family an asset type belongs to. One mapping, used by every layer. */
export function assetFamilyOf(assetType: string | null | undefined): AssetFamily {
  const a = String(assetType || "").toLowerCase();
  if (/banner|display|leaderboard|skyscraper|web ad/.test(a)) return "banner";
  if (/packshot|product hero|hero|catalogue|catalog|ecommerce|e-commerce/.test(a)) return "hero";
  if (/social|instagram|facebook|feed|story|reel/.test(a)) return "social";
  return "poster";
}

export function profileFor(assetType: string | null | undefined): AssetProfile {
  return PROFILES[assetFamilyOf(assetType)];
}

/**
 * What the channel demands, for BLOCK 1.
 *
 * Numbers rather than ambition: "impact at first glance" is a wish, and "legible
 * at 320 pixels wide and in greyscale" is a test the frame either passes or fails.
 */
export function renderProfileForPrompt(p: AssetProfile | null | undefined): string {
  if (!p) return "";
  return [
    `CHANNEL — a ${p.family}. The viewer gives it ${p.read_time}.`,
    `What it has to win: ${p.demands}.`,
    `The dominant element holds ${p.dominance_pct[0]}-${p.dominance_pct[1]}% of the frame; nothing else competes for that share.`,
  ].join("\n");
}

/**
 * Whether the copy fits the channel, and what to say when it does not.
 *
 * Reported, never truncated: the strings are the client's and this module does not
 * get to drop one. What it can do is make the cost visible, because under one-pass
 * every additional string multiplies the chance of a spelling failure and a
 * re-render.
 */
export function copyFitsChannel(p: AssetProfile, strings: number): { fits: boolean; note: string } {
  if (strings <= p.max_strings) {
    return { fits: true, note: `${strings} of ${p.max_strings} strings this ${p.family} can carry` };
  }
  return {
    fits: false,
    note:
      `${strings} strings on a ${p.family} read in ${p.read_time}: ${p.max_strings} is the limit this channel ` +
      `supports, and every string past it both crowds the read and multiplies the chance of a drawn-text failure`,
  };
}

/** Counts only. Never the client's copy. */
export function profileTelemetry(p: AssetProfile | null | undefined, strings = 0) {
  if (!p) return { asset_profile: false };
  const fit = copyFitsChannel(p, strings);
  return {
    asset_profile: true,
    family: p.family,
    min_cap_height_pct: p.min_cap_height_pct,
    max_strings: p.max_strings,
    strings,
    copy_fits: fit.fits,
  };
}
