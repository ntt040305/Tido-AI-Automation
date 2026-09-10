import { CampaignAssetType } from "../campaign/campaign.types";

export interface ExportPreset {
  id: string;
  label: string;
  /** Ratio the provider is asked to render. Must be a supported generation ratio. */
  render_ratio: string;
  /** Delivered pixel dimensions. */
  width: number;
  height: number;
  /**
   * How the delivered file is produced from the rendered frame.
   * "direct"  — the render already has this ratio.
   * "crop"    — centre-crop the render to the delivery ratio.
   * "extend"  — the delivery ratio is wider/taller than anything the provider
   *             renders, so the render is placed and the remainder is filled
   *             from the campaign's own background treatment.
   */
  derivation: "direct" | "crop" | "extend";
  usage: string;
}

/**
 * Delivery presets.
 *
 * Two ratios exist in this system and they are not the same thing:
 *
 *   render_ratio  — what the provider can actually generate. The supported set is
 *                   1:1, 9:16, 16:9 and nothing else.
 *   delivery size — what the client's placement actually needs, which for display
 *                   inventory is often far outside that set (a leaderboard is
 *                   roughly 8:1).
 *
 * Conflating the two is how a banner ends up stretched. Every preset below states
 * which ratio to render and how the delivered file is derived from it, so an
 * out-of-gamut placement is a documented crop rather than a distortion.
 */
export const EXPORT_PRESETS: ExportPreset[] = [
  // ── Core social and print ratios ──
  { id: "square_1x1", label: "Square 1:1", render_ratio: "1:1", width: 1080, height: 1080, derivation: "direct", usage: "Instagram feed, marketplace listing, product grid" },
  { id: "story_9x16", label: "Story 9:16", render_ratio: "9:16", width: 1080, height: 1920, derivation: "direct", usage: "Stories, Reels, TikTok, Shorts" },
  { id: "landscape_16x9", label: "Landscape 16:9", render_ratio: "16:9", width: 1920, height: 1080, derivation: "direct", usage: "Website hero, YouTube thumbnail, presentation" },

  // ── Standard display banner inventory ──
  // None of these ratios can be generated directly. Each names the closest
  // renderable ratio and the crop that produces it.
  { id: "banner_leaderboard", label: "Leaderboard 728×90", render_ratio: "16:9", width: 728, height: 90, derivation: "crop", usage: "Desktop display, above the fold" },
  { id: "banner_medium_rectangle", label: "Medium rectangle 300×250", render_ratio: "1:1", width: 300, height: 250, derivation: "crop", usage: "In-article and sidebar display" },
  { id: "banner_wide_skyscraper", label: "Wide skyscraper 160×600", render_ratio: "9:16", width: 160, height: 600, derivation: "crop", usage: "Sidebar rail" },
  { id: "banner_large_mobile", label: "Large mobile 320×100", render_ratio: "16:9", width: 320, height: 100, derivation: "crop", usage: "Mobile web display" },
  { id: "banner_billboard", label: "Billboard 970×250", render_ratio: "16:9", width: 970, height: 250, derivation: "crop", usage: "Desktop premium display" },
];

/** Presets shipped by default for each asset type. */
export const ASSET_PRESETS: Record<CampaignAssetType, string[]> = {
  poster: ["story_9x16", "square_1x1"],
  banner: ["landscape_16x9", "banner_leaderboard", "banner_medium_rectangle", "banner_billboard"],
  social_ad: ["story_9x16", "square_1x1"],
  product_hero: ["square_1x1", "landscape_16x9"],
  thumbnail: ["landscape_16x9"],
};

export function getPreset(id: string): ExportPreset | undefined {
  return EXPORT_PRESETS.find((p) => p.id === id);
}

export function presetsForAsset(assetType: CampaignAssetType): ExportPreset[] {
  return (ASSET_PRESETS[assetType] || [])
    .map((id) => getPreset(id))
    .filter((p): p is ExportPreset => Boolean(p));
}

/**
 * Delivery file name.
 *
 * BRAND_CAMPAIGN_ASSET_PRESET_vN.ext — uppercase, ASCII-safe, sortable, and
 * unambiguous when a client drops fifty files into one folder. Vietnamese
 * diacritics are stripped rather than encoded, because these names travel through
 * Windows shares, S3 keys and email attachments.
 */
export function deliveryFileName(args: {
  brand: string;
  campaignName: string;
  assetType: CampaignAssetType;
  presetId: string;
  version?: number;
  extension?: string;
}): string {
  const slug = (s: string, max = 28) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase()
      .slice(0, max)
      .replace(/-+$/g, "");

  const preset = getPreset(args.presetId);
  const size = preset ? `${preset.width}x${preset.height}` : args.presetId;
  const v = `v${args.version ?? 1}`;
  const ext = args.extension || "png";
  return `${slug(args.brand, 16)}_${slug(args.campaignName)}_${args.assetType.toUpperCase()}_${size}_${v}.${ext}`;
}
