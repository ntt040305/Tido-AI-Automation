import { KnowledgeBlock, MetadataProvenance, RetrievalSignal } from "../types";

export interface MetadataMatchResult {
  block: KnowledgeBlock;
  metadataScore: number;
  matchedSignals: string[];
  selectionReasons: string[];
  provenance: MetadataProvenance[];
  matchedSignalsConfidences: number[];
}

export class MetadataKnowledgeMatcher {
  public static matchBlock(
    block: KnowledgeBlock,
    signals: RetrievalSignal[],
    extraContext?: { brief?: string; routingSummary?: string }
  ): MetadataMatchResult {
    const meta = block.metadata;

    // Universal Core blocks apply globally to all commercial generations
    if (meta.knowledge_type === "UNIVERSAL" || meta.scope === "GLOBAL") {
      return {
        block,
        metadataScore: 1.0,
        matchedSignals: ["universal_core: mandatory_commercial_baseline"],
        selectionReasons: ["Universal commercial knowledge block (mandatory baseline)"],
        provenance: [
          {
            signal: "universal_core: mandatory_commercial_baseline",
            matchedBy: "routing_dimensions",
            matchedValue: "UNIVERSAL",
            confidence: 1.0,
            contribution: 1.0,
          },
        ],
        matchedSignalsConfidences: [1.0],
      };
    }

    // Intent-Aware Matching for Poster Specialist blocks (excluding Foundation base)
    const isPosterSpecialist = (meta.id.startsWith("specialist.poster_") && meta.id !== "specialist.poster_foundation") || meta.id === "specialist.commercial_poster_design";
    if (isPosterSpecialist) {
      const intent = MetadataKnowledgeMatcher.evaluatePosterStyleIntent(meta.id, signals, extraContext);
      if (!intent.isMatch) {
        return {
          block,
          metadataScore: 0.0,
          matchedSignals: [],
          selectionReasons: [`Rejected: '${meta.id}' does not match global visual style intent`],
          provenance: [],
          matchedSignalsConfidences: [],
        };
      } else {
        return {
          block,
          metadataScore: intent.weight,
          matchedSignals: [`global_style_intent: ${meta.id}`],
          selectionReasons: [intent.reason],
          provenance: [
            {
              signal: `global_style_intent: ${meta.id}`,
              matchedBy: "match_rules",
              matchedValue: meta.id,
              confidence: intent.weight,
              contribution: intent.weight,
            },
          ],
          matchedSignalsConfidences: [intent.weight],
        };
      }
    }

    const rd = meta.routing_dimensions || {};
    const matchedSignals: string[] = [];
    const selectionReasons: string[] = [];
    const provenance: MetadataProvenance[] = [];
    const matchedSignalsConfidences: number[] = [];

    let scoreAccumulator = 0;

    for (const signal of signals) {
      let isMatched = false;
      let matchWeight = 0;
      let matchedBy: MetadataProvenance["matchedBy"] = "routing_dimensions";

      // 1. Direct Routing Dimensions Match
      if (signal.dimension === "MATERIAL" && rd.materials?.some((m) => m.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 1.0;
        matchedBy = "routing_dimensions";
      } else if (signal.dimension === "PROPERTY" && rd.properties?.some((p) => p.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 0.95;
        matchedBy = "routing_dimensions";
      } else if (signal.dimension === "CONTENT" && rd.contents?.some((c) => c.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 0.90;
        matchedBy = "routing_dimensions";
      } else if (signal.dimension === "CATEGORY" && rd.categories?.some((cat) => cat.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 0.85;
        matchedBy = "routing_dimensions";
      } else if (signal.dimension === "INDUSTRY" && rd.industry_domains?.some((ind) => ind.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 0.80;
        matchedBy = "routing_dimensions";
      } else if (signal.dimension === "GEOMETRY" && rd.geometry_traits?.some((g) => g.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 0.85;
        matchedBy = "routing_dimensions";
      } else if (signal.dimension === "PACKAGING" && rd.packaging_types?.some((pkg) => pkg.toLowerCase() === signal.value)) {
        isMatched = true;
        matchWeight = 0.85;
        matchedBy = "routing_dimensions";
      } else if (
        signal.dimension === "VISUAL_CHALLENGE" &&
        rd.visual_challenges?.some((vc) => vc.toLowerCase() === signal.value || signal.value.includes(vc.toLowerCase()))
      ) {
        isMatched = true;
        matchWeight = 1.0;
        matchedBy = "routing_dimensions";
      }

      // 2. Keyword, Alias & Semantic Tag Matching
      if (!isMatched) {
        const keywords = (meta.keywords || []).map((k) => k.toLowerCase());
        const aliases = (meta.aliases || []).map((a) => a.toLowerCase());
        const tags = (meta.semantic_tags || []).map((t) => t.toLowerCase());

        if (keywords.includes(signal.value)) {
          isMatched = true;
          matchWeight = 0.85;
          matchedBy = "keywords";
        } else if (aliases.includes(signal.value)) {
          isMatched = true;
          matchWeight = 0.85;
          matchedBy = "aliases";
        } else if (tags.includes(signal.value)) {
          isMatched = true;
          matchWeight = 0.75;
          matchedBy = "semantic_tags";
        }
      }

      // 3. Knowledge Match Rules Validation
      if (meta.match_rules && meta.match_rules.length > 0) {
        for (const rule of meta.match_rules) {
          const ruleCond = rule.condition.toLowerCase();
          const cleanVal = signal.value.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const wordRegex = new RegExp(`\\b${cleanVal}\\b`, "i");
          if (wordRegex.test(ruleCond)) {
            isMatched = true;
            matchWeight = Math.max(matchWeight, rule.weight || 0.8);
            matchedBy = "match_rules";
          }
        }
      }

      if (isMatched) {
        const signalScore = Number((signal.effectiveWeight * matchWeight).toFixed(3));
        scoreAccumulator += signalScore;

        const signalDesc = `${signal.dimension.toLowerCase()}: ${signal.value}`;
        matchedSignals.push(signalDesc);
        matchedSignalsConfidences.push(signal.confidence);

        provenance.push({
          signal: signalDesc,
          matchedBy,
          matchedValue: signal.value,
          confidence: signal.confidence,
          contribution: signalScore,
        });

        selectionReasons.push(
          `Matched ${signal.evidenceType.toLowerCase()} ${signal.dimension.toLowerCase()} '${signal.value}' via ${matchedBy} (${Math.round(
            signal.confidence * 100
          )}% confidence)`
        );
      }
    }

    // Normalize metadata score to 0.0 – 1.0
    const normalizedScore = Math.min(1.0, scoreAccumulator > 0 ? 0.5 + Math.min(0.5, scoreAccumulator * 0.3) : 0);

    return {
      block,
      metadataScore: Number(normalizedScore.toFixed(3)),
      matchedSignals,
      selectionReasons,
      provenance,
      matchedSignalsConfidences,
    };
  }

  public static evaluatePosterStyleIntent(
    blockId: string,
    signals: RetrievalSignal[],
    extraContext?: { brief?: string; routingSummary?: string }
  ): { isMatch: boolean; weight: number; reason: string } {
    const briefText = extraContext?.brief || "";
    const summaryText = extraContext?.routingSummary || "";
    const globalSignals = signals
      .filter((s) => s.dimension === "GLOBAL_INTENT" || s.dimension === "CATEGORY" || s.dimension === "PROPERTY")
      .map((s) => s.value)
      .join(" ");

    const fullText = `${briefText} ${summaryText} ${globalSignals}`.toLowerCase();

    switch (blockId) {
      case "specialist.poster_fantasy_surreal": {
        const isGlobal = /\b(fantasy|surreal|dreamlike|surrealism|magical realm|mythical world|cosmic fantasy|floating universe)\b/i.test(fullText);
        return { isMatch: isGlobal, weight: 0.92, reason: "GLOBAL_INTENT: Fantasy/Surreal visual language requested" };
      }

      case "specialist.poster_photographic_cinematic": {
        const hasGlobalPhrase = /\b(photographic poster|cinematic poster|cinematic art direction|photorealistic poster|cinematic style|film style poster|realism poster|cinematic photography|photographic food poster|photographic beverage poster|photographic portrait poster|photographic product poster|high-end photographic)\b/i.test(fullText);
        const containsCinematicOrPhoto = /\b(cinematic|photographic|photorealistic|realism)\b/i.test(fullText);
        const isLocalLightingOrTextureOnly = /\b(cinematic lighting|cinematic glow|photographic texture|cinematic angle|cinematic lens)\b/i.test(fullText) && !hasGlobalPhrase;

        const isGlobal = (hasGlobalPhrase || containsCinematicOrPhoto) && !isLocalLightingOrTextureOnly;
        return { isMatch: isGlobal, weight: 0.90, reason: "GLOBAL_INTENT: Photographic/Cinematic art direction requested" };
      }

      case "specialist.poster_3d_cgi_digital": {
        const hasGlobalPhrase = /\b(3d poster|cgi poster|3d render poster|3d art direction|octane render|digital 3d art|3d cgi poster|3d tech poster|3d technology poster)\b/i.test(fullText);
        const contains3d = /\b(3d_render|cgi|octane)\b/i.test(fullText);
        const isLocalTypographyOrObjectOnly = /\b(3d text|3d headline|3d logo|3d lettering|3d bottle|3d object|3d render of product)\b/i.test(fullText) && !hasGlobalPhrase;

        const isGlobal = (hasGlobalPhrase || contains3d) && !isLocalTypographyOrObjectOnly;
        return { isMatch: isGlobal, weight: 0.90, reason: "GLOBAL_INTENT: 3D/CGI art direction requested" };
      }

      case "specialist.poster_illustration_graphic": {
        const isGlobal = /\b(illustration|illustrated|vector_art|flat_design|anime|graphic_design|hand-drawn|sketch)\b/i.test(fullText);
        return { isMatch: isGlobal, weight: 0.90, reason: "GLOBAL_INTENT: Graphic illustration visual language requested" };
      }

      case "specialist.poster_collage_mixed_media": {
        const isGlobal = /\b(collage|mixed_media|paper_cut|zine_aesthetic|scrapbook|photomontage)\b/i.test(fullText);
        return { isMatch: isGlobal, weight: 0.90, reason: "GLOBAL_INTENT: Collage/Mixed-media art direction requested" };
      }

      case "specialist.poster_editorial_minimal_luxury": {
        const hasGlobalPhrase = /\b(minimal poster|editorial poster|luxury poster|minimalist art direction|minimal luxury visual|sleek editorial layout|quiet luxury poster|minimal luxury cosmetic poster|minimal luxury perfume poster)\b/i.test(fullText);
        const containsMinimalOrEditorial = /\b(minimal|editorial|minimalist|negative space)\b/i.test(fullText);
        const isProductLuxuryOnly = /\b(luxury chocolate|luxury wine|luxury perfume|luxury cosmetics|luxury brand|luxury product)\b/i.test(fullText) && !hasGlobalPhrase && !containsMinimalOrEditorial;

        const isGlobal = (hasGlobalPhrase || containsMinimalOrEditorial) && !isProductLuxuryOnly;
        return { isMatch: isGlobal, weight: 0.88, reason: "GLOBAL_INTENT: Editorial/Minimal/Luxury layout style requested" };
      }

      case "specialist.poster_maximal_pop_experimental": {
        const isGlobal = /\b(maximalist|pop_poster|y2k|experimental|pop art poster|bold pop)\b/i.test(fullText);
        return { isMatch: isGlobal, weight: 0.90, reason: "GLOBAL_INTENT: Maximalist/Pop/Experimental style requested" };
      }

      case "specialist.commercial_poster_design": {
        // NARROWED TRIGGER: Only activate on genuine PROMOTIONAL COMMUNICATION INTENT!
        const hasPromotionalIntent = /\b(sale|discount|% off|percent off|special offer|promotional campaign|buy 1 get 1|limited time offer|clearance|promo price|flash sale|promo launch|special price|promotion|mega sale)\b/i.test(fullText);
        return { isMatch: hasPromotionalIntent, weight: 0.95, reason: "GLOBAL_INTENT: Promotional communication intent present" };
      }

      default:
        return { isMatch: true, weight: 0.80, reason: "Generic specialist block match" };
    }
  }
}
