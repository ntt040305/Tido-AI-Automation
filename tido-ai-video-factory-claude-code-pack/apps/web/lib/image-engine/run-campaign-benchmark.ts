/**
 * Picture engine campaign benchmark.
 *
 * Runs ten commercial briefs across five industries through the full campaign
 * workflow — brief → concept → visual DNA → five adapted assets → delivery
 * package — and reports what each produced.
 *
 * It runs in dry-run mode with a fixed routing result, so it makes no Gemini,
 * marketing-brain or provider calls: the same ten campaigns can be re-run on
 * every change for free, which is what makes it a regression net rather than a
 * demo.
 *
 * Build: npx tsc -p tsconfig.verify.json
 * Run:   node .verify-build/apps/web/lib/image-engine/run-campaign-benchmark.js
 * Flags: KEEP_PACKAGES=1  leave the generated delivery folders on disk
 */
import fs from "fs";
import path from "path";
import { CampaignOrchestratorService } from "./campaign/CampaignOrchestratorService";
import { CampaignBriefInput, CampaignResult } from "./campaign/campaign.types";
import { RoutingResultSchema, StructuredInputIntentV1 } from "./types";

let passes = 0;
let failures = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passes++;
  } else {
    failures++;
    console.error(`       ✗ ${msg}`);
    process.exitCode = 1;
  }
}

function rule(ch = "─", w = 78) {
  console.log(ch.repeat(w));
}

/**
 * A fixed routing result stands in for the Gemini reference pass. The benchmark
 * is measuring campaign reasoning and asset differentiation, not vision.
 */
function routingFor(brief: CampaignBriefInput, intent: Partial<StructuredInputIntentV1>): RoutingResultSchema {
  return {
    routing_version: "1.0",
    routing_mode: "HIGH_CONFIDENCE",
    requires_universal_core: true,
    products: [
      {
        product_id: "PRODUCT_01",
        reference_ids: ["REF_01"],
        reference_relationship_confidence: 0.95,
        summary: brief.product,
        categories: [{ value: brief.industry || "Consumer", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Reference photo" }],
        industry_domains: [],
        likely_functions: [],
        materials: [{ value: "Glass", confidence: 0.85, evidence_type: "OBSERVED", evidence_summary: "Surface" }],
        contents: [],
        surface_properties: [],
        geometry_traits: [],
        packaging_types: [],
        branding_features: [],
        visual_challenges: [],
        unknowns: [],
        retrieval_queries: [],
      },
    ],
    global_retrieval_queries: [],
    routing_summary: brief.product,
    structured_input_intent: {
      core_creative_intent: intent.core_creative_intent || brief.concept || brief.product,
      global_visual_language: intent.global_visual_language || "photographic",
      extracted_copy_items: [],
      generated_copy_allowed: false,
      brand_mentions: [brief.brand],
      explicit_hard_requirements: [],
      local_attributes: [],
      creative_freedom_level: "BALANCED",
      asset_roles: [],
      ...intent,
    } as StructuredInputIntentV1,
  } as RoutingResultSchema;
}

interface Bench {
  id: string;
  industry: string;
  brief: CampaignBriefInput;
  intent: Partial<StructuredInputIntentV1>;
  /** Client instructions that must survive into every asset prompt. */
  mustSurvive?: string[];
}

const benchmarks: Bench[] = [
  {
    id: "B01",
    industry: "skincare",
    brief: {
      brand: "Centella",
      product: "Hydrating serum",
      audience: "Women 25–40 who read ingredient lists",
      objective: "conversion",
      channel: "social_media",
      tone: "clinical, calm",
      industry: "beauty_skincare",
      concept: "Chai serum đặt giữa mặt nước trong, góc top view hơi nghiêng, ánh sáng phản chiếu sạch.",
      copyItems: [{ text: "DƯỠNG ẨM CHUYÊN SÂU", type: "headline" }],
    },
    intent: {
      core_creative_intent: "Hydrating serum bottle photographed from above on still clear water",
      scene_environment: "shallow still clear water",
      camera_requests: "slightly tilted top-down view",
      lighting_requests: "soft reflective light with clean reflections",
      mood_emotion: "clinical, calm",
    },
    mustSurvive: ["top-down"],
  },
  {
    id: "B02",
    industry: "skincare",
    brief: {
      brand: "Lumière",
      product: "Anti-ageing night cream",
      audience: "Women 45+ who dislike being sold youth",
      objective: "branding",
      channel: "print",
      tone: "dignified",
      industry: "beauty_skincare",
      concept: "Kem dưỡng ban đêm, ánh sáng dịu từ một phía, nền tối ấm, cảm giác trân trọng tuổi tác.",
    },
    intent: {
      core_creative_intent: "Anti-ageing night cream jar in warm low light",
      scene_environment: "warm dark surface",
      lighting_requests: "soft directional light from one side only",
      mood_emotion: "dignified, quiet",
    },
    mustSurvive: ["directional"],
  },
  {
    id: "B03",
    industry: "fashion",
    brief: {
      brand: "NOMAD",
      product: "Denim jacket",
      audience: "Gen Z streetwear buyers",
      objective: "awareness",
      channel: "tiktok",
      tone: "energetic",
      industry: "fashion_apparel",
      concept: "Chụp ngoài phố lúc hoàng hôn, ánh sáng ngược ấm từ phía sau, năng lượng trẻ.",
      copyItems: [{ text: "MỚI RA MẮT", type: "headline" }],
    },
    intent: {
      core_creative_intent: "Denim jacket on a city street at sunset",
      scene_environment: "city street at golden hour",
      lighting_requests: "warm backlight from the setting sun behind the subject",
      mood_emotion: "energetic, youthful",
    },
    mustSurvive: ["backlight"],
  },
  {
    id: "B04",
    industry: "fashion",
    brief: {
      brand: "ATELIER SIX",
      product: "Silk scarf collection",
      audience: "Luxury gift buyers",
      objective: "promotion",
      channel: "website",
      tone: "refined",
      industry: "fashion_apparel",
      concept: "Khăn lụa trải trên nền đá, ánh sáng chếch để thấy vân lụa.",
    },
    intent: {
      core_creative_intent: "Silk scarves laid across a stone surface",
      scene_environment: "pale stone surface",
      lighting_requests: "raking light across the weave to reveal texture",
      material_or_visual_effect_requests: "silk sheen and weave detail",
    },
    mustSurvive: ["raking"],
  },
  {
    id: "B05",
    industry: "food",
    brief: {
      brand: "Phở Hà",
      product: "Beef pho",
      audience: "Morning commuters",
      objective: "promotion",
      channel: "website",
      tone: "warm",
      industry: "food_beverage",
      concept: "Tô phở nóng, hơi bốc lên, ánh sáng cửa sổ buổi sáng.",
      copyItems: [{ text: "MỞ CỬA 6:00", type: "headline" }, { text: "Đặt bàn", type: "cta" }],
    },
    intent: {
      core_creative_intent: "Steaming bowl of beef pho in morning window light",
      scene_environment: "dark wooden table by a window",
      lighting_requests: "side window light raking across the steam",
      mood_emotion: "warm, appetising",
    },
    mustSurvive: ["window light"],
  },
  {
    id: "B06",
    industry: "food",
    brief: {
      brand: "Cold Harvest",
      product: "Cold brew coffee bottle",
      audience: "Office workers buying afternoon energy",
      objective: "conversion",
      channel: "instagram",
      tone: "crisp",
      industry: "food_beverage",
      concept: "Chai cold brew với đá và giọt nước đọng, nền tối, ánh sáng viền lạnh.",
    },
    intent: {
      core_creative_intent: "Cold brew bottle with condensation against a dark ground",
      scene_environment: "dark surface with scattered ice",
      lighting_requests: "cool rim light along both edges of the bottle",
      material_or_visual_effect_requests: "condensation droplets and glass refraction",
    },
    mustSurvive: ["rim light"],
  },
  {
    id: "B07",
    industry: "technology",
    brief: {
      brand: "AURA",
      product: "Wireless headphones",
      audience: "Considered buyers who research before purchase",
      objective: "branding",
      channel: "website",
      tone: "precise",
      industry: "electronics_tech",
      concept: "Ảnh sản phẩm cao cấp, nền tối, tôn chất liệu nhôm phay và da.",
    },
    intent: {
      core_creative_intent: "Premium wireless headphones on a dark seamless ground",
      scene_environment: "dark seamless background",
      material_or_visual_effect_requests: "brushed aluminium grain and leather pore",
      mood_emotion: "precise, restrained",
    },
    mustSurvive: ["aluminium"],
  },
  {
    id: "B08",
    industry: "technology",
    brief: {
      brand: "Halo",
      product: "Smart home hub",
      audience: "First-time smart home buyers who fear complexity",
      objective: "awareness",
      channel: "facebook",
      tone: "reassuring",
      industry: "electronics_tech",
      concept: "Thiết bị đặt trong phòng khách thật, ánh sáng ban ngày, không giống showroom.",
    },
    intent: {
      core_creative_intent: "Smart home hub in a real lived-in living room",
      scene_environment: "lived-in living room in daylight",
      lighting_requests: "daylight only, no artificial fill",
      mood_emotion: "reassuring, ordinary",
    },
    mustSurvive: ["daylight"],
  },
  {
    id: "B09",
    industry: "real estate",
    brief: {
      brand: "Riverside",
      product: "Riverside apartment",
      audience: "Young families upgrading from a first apartment",
      objective: "conversion",
      channel: "facebook",
      tone: "calm",
      industry: "real_estate",
      concept: "Nội thất căn hộ nhìn ra sông, ánh sáng chiều muộn qua cửa sổ.",
      copyItems: [{ text: "Nhận bảng giá", type: "cta" }],
    },
    intent: {
      core_creative_intent: "Riverside apartment interior looking out to the river",
      scene_environment: "apartment interior with a large window",
      lighting_requests: "late afternoon daylight through the window, interior lights off",
      mood_emotion: "calm, settled",
    },
    mustSurvive: ["window"],
  },
  {
    id: "B10",
    industry: "real estate",
    brief: {
      brand: "Bến Xanh",
      product: "Townhouse development",
      audience: "Investors comparing developments",
      objective: "promotion",
      channel: "billboard",
      tone: "confident",
      industry: "real_estate",
      concept: "Dãy nhà phố nhìn từ góc thấp lúc chạng vạng, đèn trong nhà đã bật.",
    },
    intent: {
      core_creative_intent: "Row of townhouses at dusk with interior lights on",
      scene_environment: "landscaped street at dusk",
      camera_requests: "low angle looking up along the row",
      lighting_requests: "dusk sky against warm interior window light",
    },
    mustSurvive: ["low angle"],
  },
];

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  TIDO PICTURE ENGINE — CAMPAIGN BENCHMARK (10 BRIEFS, 5 INDUSTRIES)      ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");

  const orchestrator = new CampaignOrchestratorService();
  const rows: Record<string, any>[] = [];
  const packageRoots: string[] = [];

  for (const b of benchmarks) {
    console.log("");
    rule("═");
    console.log(`${b.id} · ${b.industry.toUpperCase()} · ${b.brief.brand} — ${b.brief.product}`);
    rule("═");

    const result: CampaignResult = await orchestrator.run(b.brief, {
      dryRun: true,
      mockRoutingResult: routingFor(b.brief, b.intent),
    });

    // ── 1. CLIENT BRIEF ──
    console.log("\n  1. CLIENT BRIEF");
    console.log(`     ${b.brief.concept}`);
    console.log(`     audience: ${b.brief.audience} | objective: ${b.brief.objective} | channel: ${b.brief.channel}`);

    if (!result.success) {
      failures++;
      console.error(`     ✗ campaign run failed: ${result.error?.code} — ${result.error?.message}`);
      process.exitCode = 1;
      continue;
    }
    if (result.delivery?.package_root) packageRoots.push(result.delivery.package_root);

    // ── 2. CAMPAIGN CONCEPT ──
    const c = result.campaign;
    console.log("\n  2. CAMPAIGN CONCEPT");
    console.log(`     name        : ${c.campaign_name}`);
    console.log(`     big idea    : ${c.big_idea}`);
    console.log(`     core message: ${c.core_message}`);
    console.log(`     strategy    : ${c.provenance.strategy_source}${c.provenance.derived_fields.length ? ` (filled: ${c.provenance.derived_fields.join(", ")})` : ""}`);

    // ── 3. VISUAL DNA ──
    console.log("\n  3. VISUAL DNA");
    for (const [k, v] of Object.entries(c.visual_dna)) {
      console.log(`     ${k.padEnd(21)}: ${String(v).slice(0, 96)}`);
    }

    // ── 4. ASSET ADAPTATION BY FORMAT ──
    console.log("\n  4. ASSET ADAPTATION BY FORMAT");
    for (const a of result.assets) {
      const srcs = Object.entries(a.prompt_plan.art_direction_sources)
        .map(([d, s]) => `${d}:${s}`)
        .join(" ");
      console.log(
        `     ${a.asset_type.padEnd(13)} ${a.aspect_ratio.padEnd(5)} ${String(a.prompt_chars).padStart(6)}ch  ${a.layout_logic.eye_flow.padEnd(30)} ${a.visual_priority.map((p) => `${p.element}=${p.importance}`).join(",")}`
      );
      console.log(`     ${" ".repeat(13)} art direction: ${srcs}`);
    }

    // ── 5. FINAL PROMPT ──
    const poster = result.assets.find((a) => a.asset_type === "poster");
    console.log("\n  5. FINAL PROMPT (poster, section map)");
    console.log(
      `     ${(poster?.final_prompt || "")
        .split("\n")
        .filter((l) => /^##\s+/.test(l))
        .map((l) => l.replace(/^##\s+/, ""))
        .join(" → ")}`
    );

    // ── 6. DIAGNOSTICS ──
    console.log("\n  6. DIAGNOSTICS");
    console.log(`     calls   : gemini ${result.diagnostics.gemini_calls}, llm ${result.diagnostics.llm_calls}, provider ${result.diagnostics.provider_calls}`);
    console.log(`     duration: ${result.diagnostics.duration_ms}ms`);
    console.log(`     delivery: ${result.delivery?.file_count ?? 0} files at ${result.delivery?.package_root ?? "(none)"}`);
    console.log(`     warnings: ${result.diagnostics.warnings.length ? result.diagnostics.warnings.join(", ") : "none"}`);

    // ── Verification ──
    const prompts = result.assets.filter((a) => !a.error).map((a) => a.final_prompt);
    assert(result.assets.length === 5, `${b.id}: five assets planned`);
    assert(result.assets.every((a) => !a.error), `${b.id}: every asset compiled`);

    // Campaign consistency: the DNA block is identical in every asset.
    const dnaLine = `BIG IDEA: ${c.big_idea}`;
    assert(prompts.every((p) => p.includes(dnaLine)), `${b.id}: campaign big idea present in every asset`);
    assert(
      prompts.every((p) => p.includes(c.visual_dna.colour_logic)),
      `${b.id}: shared colour logic present in every asset`
    );

    // Asset differentiation: no two prompts are the same, and each names its own job.
    assert(new Set(prompts).size === prompts.length, `${b.id}: no two asset prompts are identical`);
    assert(
      result.assets.every((a) => !a.error && a.final_prompt.includes(`[ASSET ADAPTATION — ${a.asset_type.toUpperCase().replace(/_/g, " ")}]`)),
      `${b.id}: every asset carries its own adaptation block`
    );
    const ratios = new Set(result.assets.map((a) => a.aspect_ratio));
    assert(ratios.size >= 3, `${b.id}: assets span at least three delivery ratios`);
    const flows = new Set(result.assets.map((a) => a.layout_logic.eye_flow));
    assert(flows.size >= 2, `${b.id}: assets differ in eye flow`);

    // Client intent survives every adaptation.
    for (const phrase of b.mustSurvive || []) {
      assert(
        prompts.every((p) => p.toLowerCase().includes(phrase.toLowerCase())),
        `${b.id}: client instruction "${phrase}" survives into every asset`
      );
    }

    // Prompt quality floor.
    assert(
      prompts.every((p) => p.includes("## PROFESSIONAL KNOWLEDGE") && p.includes("universal.")),
      `${b.id}: professional knowledge reached every asset`
    );
    assert(
      prompts.every((p) => (p.match(/\[RESOLVED ART DIRECTION\]/g) || []).length === 1),
      `${b.id}: art direction stated exactly once per asset`
    );
    assert(
      prompts.every((p) => p.includes("## CONFLICT PRIORITY") && p.includes("## FINAL OUTPUT")),
      `${b.id}: control sections survived the budget in every asset`
    );
    assert(
      !prompts.some((p) => p.includes("Commercial Product") || p.includes("Special Edition")),
      `${b.id}: no placeholder text anywhere in the set`
    );

    // Product hero must not be asked to render campaign copy.
    const hero = result.assets.find((a) => a.asset_type === "product_hero");
    if (b.brief.copyItems?.length && hero && !hero.error) {
      assert(
        hero.final_prompt.includes("render NO text"),
        `${b.id}: product hero renders no copy even though the campaign has some`
      );
    }

    // Production usefulness: a package a person could hand over.
    assert(Boolean(result.delivery), `${b.id}: delivery package produced`);
    if (result.delivery) {
      assert(fs.existsSync(result.delivery.manifest_path), `${b.id}: delivery_manifest.json written`);
      assert(fs.existsSync(result.delivery.summary_json_path), `${b.id}: campaign_summary.json written`);
      assert(fs.existsSync(result.delivery.summary_txt_path), `${b.id}: campaign_summary.txt written`);
      assert(result.delivery.file_count >= 5, `${b.id}: delivery lists at least one file per asset`);
    }

    rows.push({
      id: b.id,
      industry: b.industry,
      campaign: c.campaign_name.slice(0, 30),
      assets: result.assets.length,
      ratios: [...ratios].join("/"),
      avg_chars: Math.round(prompts.reduce((s, p) => s + p.length, 0) / prompts.length),
      files: result.delivery?.file_count ?? 0,
      warnings: result.diagnostics.warnings.length,
    });
  }

  console.log("");
  rule("═");
  console.log("BENCHMARK SUMMARY");
  rule("═");
  console.table(rows);
  console.log(`\n${passes} passed, ${failures} failed\n`);

  if (process.env.KEEP_PACKAGES !== "1") {
    for (const root of packageRoots) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* leaving a benchmark folder behind is not a failure */
      }
    }
    console.log(`Cleaned ${packageRoots.length} benchmark delivery folders (KEEP_PACKAGES=1 to retain).\n`);
  } else {
    console.log(`Delivery packages retained under ${path.dirname(packageRoots[0] || "")}\n`);
  }
}

run().catch((err) => {
  console.error("Benchmark crashed:", err);
  process.exitCode = 1;
});
