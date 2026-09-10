import fs from "fs";
import path from "path";
import { AssetPlanResult, CampaignAssetType, CampaignBriefInput, CampaignConcept } from "../campaign/campaign.types";
import { deliveryFileName, presetsForAsset } from "./export-presets";

/** Campaign asset type → delivery folder, using the names an agency uses. */
const ASSET_FOLDER: Record<CampaignAssetType, string> = {
  poster: "poster",
  banner: "banner",
  social_ad: "social",
  product_hero: "hero",
  thumbnail: "thumbnail",
};

export interface DeliveryFileEntry {
  asset_type: CampaignAssetType;
  preset_id: string;
  file: string;
  relative_path: string;
  width: number;
  height: number;
  render_ratio: string;
  derivation: "direct" | "crop" | "extend";
  usage: string;
  /** False when the asset was planned but not rendered (dry run or failure). */
  rendered: boolean;
}

export interface DeliveryManifest {
  manifest_version: "1.0";
  campaign_id: string;
  campaign_name: string;
  brand: string;
  product: string;
  generated_at: string;
  asset_count: number;
  file_count: number;
  files: DeliveryFileEntry[];
  notes: string[];
}

export interface DeliveryPackageResult {
  package_root: string;
  manifest_path: string;
  summary_json_path: string;
  summary_txt_path: string;
  file_count: number;
  manifest: DeliveryManifest;
}

/**
 * Delivery Engine (lite).
 *
 * Produces the folder a client is actually sent: assets sorted by type, a machine
 * summary, a human summary, and a manifest that says what every file is for and
 * how it was derived.
 *
 * Deliberately not in scope: PSD layering, Canva export, cloud upload. This
 * writes a plain directory tree, which is what a handover needs before any of
 * that is worth building.
 */
export class DeliveryPackageService {
  private root: string;

  constructor(root?: string) {
    this.root =
      root ||
      (typeof window === "undefined"
        ? path.resolve(process.cwd(), "data/deliveries")
        : "data/deliveries");
  }

  public build(args: {
    brief: CampaignBriefInput;
    campaign: CampaignConcept;
    assets: AssetPlanResult[];
    /** generation_id -> rendered image bytes, when a real render happened. */
    renderedImages?: Map<string, { buffer: Buffer; mimeType: string }>;
  }): DeliveryPackageResult {
    const { brief, campaign, assets } = args;
    const packageRoot = path.join(this.root, this.slugDir(campaign.campaign_name));

    if (!path.resolve(packageRoot).startsWith(path.resolve(this.root))) {
      throw new Error(`Security violation: delivery path escapes the deliveries root (${campaign.campaign_name})`);
    }

    fs.mkdirSync(packageRoot, { recursive: true });

    const files: DeliveryFileEntry[] = [];
    const notes: string[] = [];

    for (const asset of assets) {
      const folder = path.join(packageRoot, ASSET_FOLDER[asset.asset_type]);
      fs.mkdirSync(folder, { recursive: true });

      // The compiled prompt ships with the asset. An agency reviewing a render
      // needs to see what was actually asked for, and a re-run needs the exact
      // input — a delivery without it is not reproducible.
      if (asset.final_prompt) {
        fs.writeFileSync(path.join(folder, "prompt.md"), asset.final_prompt, "utf-8");
      }
      fs.writeFileSync(
        path.join(folder, "asset_plan.json"),
        JSON.stringify(
          {
            asset_type: asset.asset_type,
            use_case: asset.use_case,
            aspect_ratio: asset.aspect_ratio,
            asset_goal: asset.asset_goal,
            layout_logic: asset.layout_logic,
            visual_priority: asset.visual_priority,
            prompt_plan: asset.prompt_plan,
            warnings: asset.warnings,
            error: asset.error,
          },
          null,
          2
        ),
        "utf-8"
      );

      const rendered = args.renderedImages?.get(asset.generation_id || "");
      if (!rendered) {
        notes.push(
          `${asset.asset_type}: planned only — prompt and layout are delivered, no pixels were generated in this run.`
        );
      }

      for (const preset of presetsForAsset(asset.asset_type)) {
        const fileName = deliveryFileName({
          brand: brief.brand,
          campaignName: campaign.campaign_name,
          assetType: asset.asset_type,
          presetId: preset.id,
        });
        const relative = path.posix.join(ASSET_FOLDER[asset.asset_type], fileName);

        // Only the preset matching the rendered ratio receives real bytes. The
        // rest are declared in the manifest as derivations so nobody mistakes a
        // planned crop for a delivered file.
        const isNativeRatio = preset.render_ratio === asset.aspect_ratio && preset.derivation === "direct";
        if (rendered && isNativeRatio) {
          fs.writeFileSync(path.join(folder, fileName), rendered.buffer);
        }

        files.push({
          asset_type: asset.asset_type,
          preset_id: preset.id,
          file: fileName,
          relative_path: relative,
          width: preset.width,
          height: preset.height,
          render_ratio: preset.render_ratio,
          derivation: preset.derivation,
          usage: preset.usage,
          rendered: Boolean(rendered && isNativeRatio),
        });
      }
    }

    const cropCount = files.filter((f) => f.derivation !== "direct").length;
    if (cropCount > 0) {
      notes.push(
        `${cropCount} delivery size(s) sit outside the generation ratio set and are produced by centre-crop from the stated render ratio. Check the crop before shipping display inventory.`
      );
    }

    const manifest: DeliveryManifest = {
      manifest_version: "1.0",
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      brand: brief.brand,
      product: brief.product,
      generated_at: new Date().toISOString(),
      asset_count: assets.length,
      file_count: files.length,
      files,
      notes,
    };

    const summary = this.summaryJson(brief, campaign, assets);
    const manifestPath = path.join(packageRoot, "delivery_manifest.json");
    const summaryJsonPath = path.join(packageRoot, "campaign_summary.json");
    const summaryTxtPath = path.join(packageRoot, "campaign_summary.txt");

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf-8");
    fs.writeFileSync(summaryTxtPath, this.summaryText(brief, campaign, assets, manifest), "utf-8");

    console.log("[DELIVERY_PACKAGE]", {
      root: packageRoot,
      assets: assets.length,
      files: files.length,
      rendered: files.filter((f) => f.rendered).length,
    });

    return {
      package_root: packageRoot,
      manifest_path: manifestPath,
      summary_json_path: summaryJsonPath,
      summary_txt_path: summaryTxtPath,
      file_count: files.length,
      manifest,
    };
  }

  private summaryJson(brief: CampaignBriefInput, campaign: CampaignConcept, assets: AssetPlanResult[]) {
    return {
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      brief: {
        brand: brief.brand,
        product: brief.product,
        audience: brief.audience,
        objective: brief.objective,
        channel: brief.channel,
        tone: brief.tone,
        industry: brief.industry,
        concept: brief.concept,
      },
      concept: {
        big_idea: campaign.big_idea,
        core_message: campaign.core_message,
        consumer_insight: campaign.consumer_insight,
        emotional_response: campaign.emotional_response,
      },
      visual_dna: campaign.visual_dna,
      asset_plan: campaign.asset_plan,
      assets: assets.map((a) => ({
        asset_type: a.asset_type,
        aspect_ratio: a.aspect_ratio,
        asset_goal: a.asset_goal,
        eye_flow: a.layout_logic.eye_flow,
        visual_priority: a.visual_priority.map((p) => `${p.element}:${p.importance}`),
        art_direction_sources: a.prompt_plan.art_direction_sources,
        client_locked_dimensions: a.prompt_plan.client_locked_dimensions,
        knowledge_blocks: a.prompt_plan.knowledge_blocks,
        prompt_chars: a.prompt_chars,
        warnings: a.warnings,
        error: a.error,
      })),
      provenance: campaign.provenance,
    };
  }

  /** The version a person reads before forwarding the folder to a client. */
  private summaryText(
    brief: CampaignBriefInput,
    campaign: CampaignConcept,
    assets: AssetPlanResult[],
    manifest: DeliveryManifest
  ): string {
    const d = campaign.visual_dna;
    const lines: string[] = [
      campaign.campaign_name,
      "=".repeat(campaign.campaign_name.length),
      "",
      `Brand:      ${brief.brand}`,
      `Product:    ${brief.product}`,
      brief.audience ? `Audience:   ${brief.audience}` : "",
      brief.objective ? `Objective:  ${brief.objective}` : "",
      brief.channel ? `Channel:    ${brief.channel}` : "",
      `Generated:  ${manifest.generated_at}`,
      "",
      "THE IDEA",
      "-".repeat(40),
      campaign.big_idea,
      "",
      `Core message:  ${campaign.core_message}`,
      campaign.consumer_insight ? `Insight:       ${campaign.consumer_insight}` : "",
      campaign.emotional_response ? `Should feel:   ${campaign.emotional_response}` : "",
      "",
      "VISUAL DNA — shared by every asset",
      "-".repeat(40),
      `Mood:                 ${d.mood}`,
      `Colour logic:         ${d.colour_logic}`,
      `Lighting logic:       ${d.lighting_logic}`,
      `Composition logic:    ${d.composition_logic}`,
      `Typography logic:     ${d.typography_logic}`,
      `Product presentation: ${d.product_presentation}`,
      "",
      "ASSETS",
      "-".repeat(40),
    ];

    for (const a of assets) {
      lines.push(
        `${a.asset_type.toUpperCase().replace(/_/g, " ")}  (${a.aspect_ratio})`,
        `  Purpose:   ${a.asset_goal}`,
        `  Eye flow:  ${a.layout_logic.eye_flow.replace(/_/g, " ")}`,
        `  Attention: ${a.visual_priority.map((p) => `${p.element} ${p.importance}`).join(", ")}`,
        a.prompt_plan.client_locked_dimensions.length
          ? `  Client-locked: ${a.prompt_plan.client_locked_dimensions.join(", ")}`
          : "",
        a.error ? `  FAILED: ${a.error.code} — ${a.error.message}` : "",
        ""
      );
    }

    lines.push(
      "DELIVERY",
      "-".repeat(40),
      `${manifest.file_count} file(s) across ${manifest.asset_count} asset type(s).`,
      ...manifest.notes.map((n) => `- ${n}`),
      "",
      "Each asset folder contains the compiled prompt (prompt.md) and the full",
      "asset plan (asset_plan.json) alongside its files, so any render in this",
      "package can be explained and reproduced."
    );

    return lines.filter((l) => l !== "").join("\n") + "\n";
  }

  private slugDir(name: string): string {
    return (
      name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/gi, "d")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 60) || "campaign"
    );
  }
}
