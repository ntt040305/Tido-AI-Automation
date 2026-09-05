import { InspirationStyleManifest } from "../types";
import { MarketingBrainStrategy } from "../llm/prompt-strategy.schema";
import { CreativeDirection as KnowledgeCreativeDirection } from "./CreativeKnowledgeService";
import { LockedIntent, VisualExecutionDirectives } from "./CreativeInterpretationService";

/**
 * Where a resolved decision came from. Ordered by authority — lower number wins,
 * all else being equal.
 */
export type ArtDirectionTier =
  | "USER"            // 1. explicit client requirement
  | "REFERENCE"       // 2. analysis of an uploaded reference image
  | "STRATEGY"        // 3. marketing reasoning for this campaign
  | "KNOWLEDGE"       // 4. retrieved professional knowledge
  | "ASSET_DEFAULT";  // 5. asset-type profile fallback

const TIER_RANK: Record<ArtDirectionTier, number> = {
  USER: 1,
  REFERENCE: 2,
  STRATEGY: 3,
  KNOWLEDGE: 4,
  ASSET_DEFAULT: 5,
};

/** How much authority a tier carries before confidence and specificity apply. */
const TIER_WEIGHT: Record<ArtDirectionTier, number> = {
  USER: 1.0,
  REFERENCE: 0.85,
  STRATEGY: 0.65,
  KNOWLEDGE: 0.5,
  ASSET_DEFAULT: 0.35,
};

/**
 * How actionable a statement is.
 *
 * HIGH   — a photographer could execute it without asking a question:
 *          "45 degree top-down", "warm backlight from behind at sunset".
 * MEDIUM — a real direction that still leaves choices open:
 *          "calm premium atmosphere", "keep the frame uncluttered".
 * LOW    — a mood word standing alone: "premium", "modern", "nice".
 */
export type Specificity = "HIGH" | "MEDIUM" | "LOW";

const SPECIFICITY_WEIGHT: Record<Specificity, number> = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LOW: 0.35,
};

export type ArtDirectionDimension =
  | "camera"
  | "lighting"
  | "composition"
  | "colour"
  | "environment"
  | "materials"
  | "atmosphere";

export interface ResolvedField {
  value: string;
  source: ArtDirectionTier;
  confidence: number;
  specificity: Specificity;
  score: number;
  /** Vague-but-real client wording kept alongside a more actionable winner. */
  qualifiers?: string[];
}

export interface ArtDirectionCandidate {
  dimension: ArtDirectionDimension;
  value: string;
  source: ArtDirectionTier;
  confidence: number;
  specificity: Specificity;
  score: number;
}

export interface SuppressedCandidate {
  dimension: ArtDirectionDimension;
  source: ArtDirectionTier;
  value: string;
  reason: "OUTRANKED" | "CONTRADICTS_CLIENT" | "RETAINED_AS_QUALIFIER";
}

export interface ResolvedArtDirection {
  fields: Partial<Record<ArtDirectionDimension, ResolvedField>>;
  referenceShotSheet?: string;
  negativeConstraints: string[];
  provenance: Record<string, ArtDirectionTier>;
  /** Full scoring detail, for diagnostics and debugging a surprising decision. */
  candidates: ArtDirectionCandidate[];
  suppressed: SuppressedCandidate[];
  promptBlock: string;
}

export interface ArtDirectionResolverInput {
  lockedIntent: LockedIntent;
  inspirationStyleManifest?: InspirationStyleManifest;
  marketingStrategy?: MarketingBrainStrategy;
  knowledgeDirection?: KnowledgeCreativeDirection;
  assetDefaults?: VisualExecutionDirectives;
  assetType?: string;
  aspectRatio?: string;
}

/**
 * Words that carry a feeling but no instruction. On their own they are LOW
 * specificity; inside a longer sentence they are just adjectives and the sentence
 * is judged on its own merits.
 */
const VAGUE_TERMS = new Set([
  "premium", "luxury", "luxurious", "modern", "clean", "nice", "beautiful", "pretty",
  "elegant", "professional", "high-end", "highend", "stylish", "aesthetic", "cool",
  "fresh", "vibrant", "commercial", "quality", "good", "attractive", "appealing",
  "sang trọng", "cao cấp", "đẹp", "hiện đại", "chuyên nghiệp",
]);

/** Concrete photographic vocabulary. Presence of any of these implies HIGH. */
const TECHNICAL_MARKERS = [
  /\b\d+\s*(°|deg|degree|degrees|mm|k)\b/i,
  /\bf\/?\d(\.\d)?\b/i,
  /\b(top[- ]?down|overhead|bird'?s[- ]?eye|worm'?s[- ]?eye|eye[- ]?level|low[- ]angle|high[- ]angle|dutch|three[- ]quarter|straight[- ]on|flat[- ]?lay)\b/i,
  /\b(backlit|backlight|rim ?light|key ?light|fill ?light|softbox|hard light|side ?light|top ?light|bounce|scrim|gobo|golden hour|blue hour|sunset|sunrise|overcast)\b/i,
  /\b(macro|close[- ]?up|wide[- ]?shot|medium shot|tight crop|full[- ]?body|portrait orientation|landscape orientation)\b/i,
  /\b(shallow|deep) depth of field\b/i,
  /\bcamera[- ](left|right)\b/i,
  /\breflections?\b/i,
  /\bsilhouette\b/i,
  /\b(gradient|vignette|bokeh|specular|refraction|caustics)\b/i,
];

/**
 * Art Direction Resolver — the single authority over camera, lighting,
 * composition, colour, environment, material and atmosphere.
 *
 * WHY THIS EXISTS
 * Five subsystems used to emit their own camera and lighting orders into the same
 * prompt. Three of them defaulted to "eye-level 50mm commercial hero", and all of
 * them sat above the art direction in document order, so a client who asked for a
 * top-down shot got a low hero angle instead.
 *
 * WHY AUTHORITY ALONE IS NOT ENOUGH
 * Ranking purely by source means the word "premium", typed by a client, outranks a
 * fully-reasoned lighting design from the knowledge layer — which is not what
 * anyone wants and produces blander pictures, not more faithful ones. Every
 * candidate now carries a confidence and a specificity, and the winner is chosen
 * on tier weight × confidence × specificity.
 *
 * One hard rule survives the scoring: a HIGH-specificity client directive always
 * wins its dimension. That is the guarantee that "top view" can never again be
 * overridden, no matter how confident another layer is.
 *
 * Nothing from the client is ever thrown away. A vague client word that loses on
 * score is retained as a qualifier on the winning value, so "premium" still
 * reaches the model — as a tone note attached to a real instruction.
 */
export class ArtDirectionResolverService {
  public static resolve(input: ArtDirectionResolverInput): ResolvedArtDirection {
    const candidates: ArtDirectionCandidate[] = [];

    const push = (
      dimension: ArtDirectionDimension,
      source: ArtDirectionTier,
      value?: string | null,
      confidenceOverride?: number
    ) => {
      const v = (value || "").trim();
      if (!v) return;
      const specificity = this.classifySpecificity(v);
      const confidence = confidenceOverride ?? this.defaultConfidence(source, specificity);
      const score = Number(
        (TIER_WEIGHT[source] * (0.5 + 0.5 * confidence) * SPECIFICITY_WEIGHT[specificity]).toFixed(4)
      );
      candidates.push({ dimension, value: v, source, confidence, specificity, score });
    };

    const li = input.lockedIntent;

    // ── Tier 1: explicit client requirements ──────────────────────────────
    push("camera", "USER", li.camera_requirements?.join("; "));
    push("lighting", "USER", li.lighting_requirements?.join("; "));
    push("composition", "USER", li.composition_requirements?.join("; "));
    push("materials", "USER", li.material_requirements?.join("; "));
    push("environment", "USER", li.environment?.join(", "));
    push("atmosphere", "USER", [li.mood?.join(", "), li.emotional_goal].filter(Boolean).join(" — "));

    // ── Tier 2: analysis of an uploaded reference image ───────────────────
    // Only trusted when the manifest was genuinely read from an image. A
    // text-inferred manifest describes generic studio styling and would outrank
    // real campaign reasoning on nothing but a guess.
    const manifest = input.inspirationStyleManifest;
    const referenceIsAuthoritative = manifest?.derived_from_image === true;
    let referenceShotSheet: string | undefined;

    if (referenceIsAuthoritative && manifest) {
      push("camera", "REFERENCE", this.joinNonEmpty([
        manifest.cameraAngle, manifest.focalLength, manifest.cameraDistance, manifest.depthOfField,
      ]) || manifest.camera);
      push("lighting", "REFERENCE", this.joinNonEmpty([
        manifest.keyLight, manifest.fillAndShadow, manifest.rimAndHighlights, manifest.lightColorTemperature,
      ]) || manifest.lighting);
      push("composition", "REFERENCE", this.joinNonEmpty([
        manifest.subjectPlacement, manifest.depthLayering, manifest.negativeSpace,
      ]) || manifest.composition);
      push("colour", "REFERENCE", this.joinNonEmpty([manifest.colorPalette, manifest.colorGrading]) || manifest.colorMood);
      push("environment", "REFERENCE", this.joinNonEmpty([
        manifest.surfaceAndSet, manifest.backgroundTreatment, manifest.propStyling,
      ]) || manifest.environment);
      push("atmosphere", "REFERENCE", this.joinNonEmpty([
        manifest.visualMood, manifest.photographicStyle, manifest.finishing,
      ]));
      referenceShotSheet = this.buildShotSheet(manifest);
    }

    // ── Tier 3: marketing reasoning translated into visual decisions ──────
    // The visual translation is preferred over the older coarse fields: it is the
    // step that turns a business goal into something a photographer can act on.
    const strategy = input.marketingStrategy;
    if (strategy) {
      const vt = strategy.visual_translation;
      push("atmosphere", "STRATEGY", vt?.atmosphere || strategy.visual_strategy || strategy.visual_direction);
      push("lighting", "STRATEGY", vt?.lighting_character || strategy.lighting);
      push("materials", "STRATEGY", vt?.material_treatment);
      push("composition", "STRATEGY", vt?.composition_principle || strategy.composition_strategy || strategy.composition);
      push("colour", "STRATEGY", vt?.colour_direction);
      push("environment", "STRATEGY", vt?.subject_representation);
      push("camera", "STRATEGY", strategy.camera_direction);
    }

    // ── Tier 4: retrieved professional knowledge ──────────────────────────
    const kd = input.knowledgeDirection;
    if (kd) {
      push("camera", "KNOWLEDGE", kd.camera_direction);
      push("lighting", "KNOWLEDGE", kd.lighting_direction);
      push("composition", "KNOWLEDGE", kd.composition_strategy);
      push("colour", "KNOWLEDGE", kd.color_strategy);
      push("atmosphere", "KNOWLEDGE", kd.visual_style);
    }

    // ── Tier 5: asset-type profile default ────────────────────────────────
    const ad = input.assetDefaults;
    if (ad) {
      const cad = ad.cinematic_art_direction;
      push("camera", "ASSET_DEFAULT", cad?.cinematic_camera_direction || ad.camera_execution);
      push("lighting", "ASSET_DEFAULT", cad?.photographic_lighting_design || ad.lighting_execution);
      push("composition", "ASSET_DEFAULT", cad?.visual_storytelling_composition || ad.composition_layout);
      push("environment", "ASSET_DEFAULT", ad.environment_role);
    }

    // ── Resolve, dimension by dimension ───────────────────────────────────
    const fields: Partial<Record<ArtDirectionDimension, ResolvedField>> = {};
    const provenance: Record<string, ArtDirectionTier> = {};
    const suppressed: SuppressedCandidate[] = [];

    const byDimension = new Map<ArtDirectionDimension, ArtDirectionCandidate[]>();
    for (const c of candidates) {
      const list = byDimension.get(c.dimension) || [];
      list.push(c);
      byDimension.set(c.dimension, list);
    }

    for (const [dimension, list] of byDimension) {
      // Hard lock: an actionable client instruction is never outscored. This is the
      // invariant that keeps "top view" from becoming "low hero angle".
      const clientLock = list.find((c) => c.source === "USER" && c.specificity === "HIGH");

      const winner =
        clientLock ||
        [...list].sort(
          (a, b) => b.score - a.score || TIER_RANK[a.source] - TIER_RANK[b.source]
        )[0];

      // A vague client word that lost still says something true about the brief, so
      // it rides along with the winner instead of vanishing.
      const qualifiers = list
        .filter((c) => c !== winner && c.source === "USER")
        .map((c) => c.value);

      fields[dimension] = {
        value: winner.value,
        source: winner.source,
        confidence: winner.confidence,
        specificity: winner.specificity,
        score: winner.score,
        qualifiers: qualifiers.length > 0 ? qualifiers : undefined,
      };
      provenance[dimension] = winner.source;

      for (const c of list) {
        if (c === winner) continue;
        suppressed.push({
          dimension,
          source: c.source,
          value: c.value,
          reason: c.source === "USER" ? "RETAINED_AS_QUALIFIER" : "OUTRANKED",
        });
      }
    }

    const rawNegatives = [...(input.assetDefaults?.negative_composition_constraints || [])];
    const negativeConstraints = this.filterContradictions(rawNegatives, fields, suppressed);

    const promptBlock = this.render(fields, referenceShotSheet, negativeConstraints, referenceIsAuthoritative);

    console.log("[ART_DIRECTION_RESOLVED]", {
      provenance,
      decisions: Object.entries(fields).map(
        ([dim, f]) => `${dim}<-${f!.source} (conf ${f!.confidence.toFixed(2)}, ${f!.specificity}, score ${f!.score})`
      ),
      client_locks: Object.entries(fields)
        .filter(([, f]) => f!.source === "USER" && f!.specificity === "HIGH")
        .map(([dim]) => dim),
      suppressed_count: suppressed.length,
    });

    return { fields, referenceShotSheet, negativeConstraints, provenance, candidates, suppressed, promptBlock };
  }

  /**
   * Judges how executable a statement is. Deterministic on purpose: an LLM call
   * here would add latency and a failure mode to a decision that is well served by
   * looking for concrete photographic vocabulary.
   */
  public static classifySpecificity(value: string): Specificity {
    const text = value.trim();
    if (!text) return "LOW";

    if (TECHNICAL_MARKERS.some((re) => re.test(text))) return "HIGH";

    const words = text
      .toLowerCase()
      .split(/[\s,;—-]+/)
      .map((w) => w.replace(/[^a-z0-9à-ỹ]/gi, ""))
      .filter(Boolean);

    // A short phrase built only from mood words is a feeling, not a direction.
    const meaningful = words.filter((w) => w.length > 2);
    if (meaningful.length > 0 && meaningful.every((w) => VAGUE_TERMS.has(w))) return "LOW";
    if (meaningful.length <= 3) {
      const vagueShare = meaningful.filter((w) => VAGUE_TERMS.has(w)).length / meaningful.length;
      return vagueShare >= 0.5 ? "LOW" : "MEDIUM";
    }

    // A full sentence naming a concrete scene, surface or behaviour of light.
    if (meaningful.length >= 8) return "HIGH";
    return "MEDIUM";
  }

  private static defaultConfidence(source: ArtDirectionTier, specificity: Specificity): number {
    // The client is believed most; how much that belief is worth depends on how
    // much they actually said.
    if (source === "USER") {
      return specificity === "HIGH" ? 0.95 : specificity === "MEDIUM" ? 0.7 : 0.4;
    }
    if (source === "REFERENCE") return specificity === "HIGH" ? 0.9 : 0.75;
    if (source === "STRATEGY") return specificity === "HIGH" ? 0.75 : 0.7;
    if (source === "KNOWLEDGE") return 0.65;
    return 0.5;
  }

  private static joinNonEmpty(parts: (string | undefined)[]): string {
    return parts.map((p) => (p || "").trim()).filter((p) => p.length > 0).join(". ");
  }

  /**
   * Drops FORBID lines that would contradict a directive the client actually gave.
   *
   * The asset-profile forbid lists are written for the generic case — the editorial
   * poster profile forbids "extreme macro close-up crop", the hero profile forbids
   * "wide environmental framing". When a client explicitly asks for one of those,
   * the forbid line turns their brief into a violation.
   */
  private static filterContradictions(
    negatives: string[],
    fields: Partial<Record<ArtDirectionDimension, ResolvedField>>,
    suppressed: SuppressedCandidate[]
  ): string[] {
    const userText = (Object.values(fields) as ResolvedField[])
      .filter((f) => f.source === "USER")
      .map((f) => f.value.toLowerCase())
      .join(" ");

    if (!userText.trim()) return this.dedupe(negatives);

    const kept: string[] = [];
    for (const line of negatives) {
      const tokens = line
        .toLowerCase()
        .replace(/^forbid\s+/i, "")
        .split(/[\s,]+/)
        .filter((t) => t.length > 4);

      const overlap = tokens.filter((t) => userText.includes(t)).length;
      if (overlap >= 2) {
        suppressed.push({
          dimension: "composition",
          source: "ASSET_DEFAULT",
          value: line,
          reason: "CONTRADICTS_CLIENT",
        });
        continue;
      }
      kept.push(line);
    }
    return this.dedupe(kept);
  }

  /**
   * Collapses near-duplicates as well as exact ones. Two layers writing the same
   * exclusion in slightly different grammar produced two lines saying one thing,
   * which is noise the model has to read twice.
   */
  private static dedupe(items: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !["that", "when", "with", "from", "this", "cuts", "cutting"].includes(w))
        .slice(0, 6)
        .join(" ");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  }

  private static buildShotSheet(m: InspirationStyleManifest): string {
    const MAX_LINE = 220;
    const line = (label: string, value?: string) => {
      if (!value || !value.trim()) return "";
      const clean = value.trim().replace(/\s+/g, " ");
      const body = clean.length > MAX_LINE ? `${clean.slice(0, MAX_LINE - 1).trimEnd()}…` : clean;
      return `  ${label}: ${body}`;
    };

    const groups: { heading: string; lines: string[] }[] = [
      { heading: "CAMERA", lines: [line("Angle", m.cameraAngle), line("Lens", m.focalLength), line("Distance", m.cameraDistance), line("Depth of field", m.depthOfField)] },
      { heading: "LIGHTING", lines: [line("Key", m.keyLight), line("Fill & shadow", m.fillAndShadow), line("Rim & speculars", m.rimAndHighlights), line("Colour temperature", m.lightColorTemperature)] },
      { heading: "COMPOSITION", lines: [line("Subject placement", m.subjectPlacement), line("Depth layering", m.depthLayering), line("Negative space", m.negativeSpace)] },
      { heading: "COLOUR", lines: [line("Palette", m.colorPalette), line("Grading", m.colorGrading)] },
      { heading: "SET, PROPS & EFFECTS", lines: [line("Props", m.propStyling), line("Surface & set", m.surfaceAndSet), line("Background", m.backgroundTreatment), line("Motion & effects", m.motionAndEffects)] },
      { heading: "FINISHING", lines: [line("Post character", m.finishing), line("Atmosphere", m.visualMood)] },
    ];

    const out: string[] = [];
    const overall = (m.photographicStyle || m.visualMood || "").trim();
    if (overall) out.push(`Overall look: ${overall}`);
    for (const g of groups) {
      const populated = g.lines.filter((l) => l !== "");
      if (populated.length === 0) continue;
      out.push("", g.heading, ...populated);
    }
    return out.join("\n");
  }

  private static render(
    fields: Partial<Record<ArtDirectionDimension, ResolvedField>>,
    shotSheet: string | undefined,
    negatives: string[],
    referenceIsAuthoritative: boolean
  ): string {
    const label: Record<ArtDirectionDimension, string> = {
      camera: "CAMERA",
      lighting: "LIGHTING",
      composition: "COMPOSITION",
      colour: "COLOUR",
      environment: "ENVIRONMENT & SET",
      materials: "MATERIALS & SURFACES",
      atmosphere: "ATMOSPHERE",
    };
    const order: ArtDirectionDimension[] = [
      "camera", "lighting", "composition", "colour", "environment", "materials", "atmosphere",
    ];

    const lines: string[] = [
      "[RESOLVED ART DIRECTION]",
      "This block is the ONLY authority on camera, lighting, composition, colour, environment, material and atmosphere. No other instruction in this prompt overrides it. Where any other section implies a different angle, lens, lighting rig or layout, this block wins.",
      "",
    ];

    for (const dim of order) {
      const f = fields[dim];
      if (!f) continue;
      // Only an actionable client instruction is marked non-negotiable. Marking a
      // one-word mood as a hard directive would tell the model to execute "premium"
      // exactly, which means nothing.
      const locked = f.source === "USER" && f.specificity === "HIGH";
      const mark = locked ? " [CLIENT DIRECTIVE — EXECUTE EXACTLY, DO NOT SUBSTITUTE]" : "";
      const tone = f.qualifiers?.length ? ` (client tone note: ${f.qualifiers.join("; ")})` : "";
      lines.push(`- ${label[dim]}${mark}: ${f.value}${tone}`);
    }

    if (referenceIsAuthoritative && shotSheet) {
      lines.push(
        "",
        "REFERENCE SHOT SHEET — a reference photograph was analysed by an art director and is described here in full. Reproduce this photographic treatment; the reference image itself is not part of the subject matter.",
        shotSheet
      );
    }

    if (negatives.length > 0) {
      lines.push("", "EXCLUSIONS:", ...negatives.map((n) => `- ${n}`));
    }

    return lines.join("\n");
  }
}
