import {
  AUDIENCE_VOCABULARY,
  BRAND_POSITION_VOCABULARY,
  CREATIVE_STAGES,
  KNOWLEDGE_TYPES,
  REASONING_DOMAINS,
  ReasoningContext,
  ReasoningKnowledgeObject,
} from "./reasoning-knowledge.types";

/**
 * Validation and the quality gate for Layer 2 knowledge.
 *
 * Two distinct checks, deliberately kept apart:
 *
 *   Structural  — does the object match the V2 schema? A failure means it cannot
 *                 be loaded or retrieved. Reported as an ERROR.
 *   Quality     — does it carry actual decision intelligence (Governance §14)?
 *                 A failure means it is information, not reasoning. Reported as a
 *                 WARNING so a corpus can be authored incrementally, but nothing
 *                 should reach production carrying one.
 *
 * The quality gate is the mechanism that stops Layer 2 drifting back into the
 * hedged, decision-free prose that Layer 1's own standard mandates. It is the
 * whole reason this layer exists, so it is enforced in code rather than left to
 * review discipline.
 */

export interface ValidationIssue {
  knowledge_id: string;
  file?: string;
  severity: "ERROR" | "WARNING";
  gate?: string;
  field?: string;
  message: string;
}

export interface ValidationSummary {
  total: number;
  valid: number;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
}

const ID_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+){2,}\.[0-9]{3}(\.v[0-9]+)?$/;

const CONTEXT_AXES: (keyof ReasoningContext)[] = [
  "industry",
  "category",
  "audience",
  "objective",
  "channel",
  "asset_type",
  "brand_position",
];

/** Domains where Governance §8 makes human_insight mandatory, not optional. */
const HUMAN_INSIGHT_REQUIRED_DOMAINS = new Set(["strategy", "audience", "concept", "differentiation"]);

/**
 * Hedge markers. Layer 2 exists to make decisions; a `decision` field written in
 * the language of Layer 1 ("may", "should", "as appropriate") has not made one.
 */
const HEDGE_PATTERN =
  /\b(may|might|could|as appropriate|according to the needs|where appropriate|if desired|generally|typically|often)\b/i;

function asArray(v: unknown): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

export class ReasoningKnowledgeValidator {
  // ── Structural validation ─────────────────────────────────────────────
  public static validateStructure(obj: ReasoningKnowledgeObject): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const id = obj.knowledge_id || "(missing id)";
    const err = (field: string, message: string) =>
      issues.push({ knowledge_id: id, file: obj._file, severity: "ERROR", field, message });

    if (!obj.knowledge_id) err("knowledge_id", "Missing.");
    else if (!ID_PATTERN.test(obj.knowledge_id))
      err("knowledge_id", `Must match domain.sub_domain.topic.number (Governance §3). Got "${obj.knowledge_id}".`);

    if (!obj.name) err("name", "Missing.");
    if (!obj.sub_domain) err("sub_domain", "Missing.");

    if (!obj.domain) err("domain", "Missing.");
    else if (!(REASONING_DOMAINS as readonly string[]).includes(obj.domain))
      err("domain", `"${obj.domain}" is not a CIOS domain.`);

    if (!obj.knowledge_type) err("knowledge_type", "Missing.");
    else if (!(KNOWLEDGE_TYPES as readonly string[]).includes(obj.knowledge_type))
      err("knowledge_type", `"${obj.knowledge_type}" is not allowed (Governance §5).`);

    const stages = asArray(obj.creative_stage);
    if (stages.length === 0) err("creative_stage", "At least one stage required (Governance §6).");
    for (const s of stages) {
      if (!(CREATIVE_STAGES as readonly string[]).includes(s))
        err("creative_stage", `"${s}" is not an allowed stage (Governance §6).`);
    }

    // Context is mandatory on every axis (Governance §4).
    if (!obj.context || typeof obj.context !== "object") {
      err("context", "Missing. Context is mandatory (Governance §4).");
    } else {
      for (const axis of CONTEXT_AXES) {
        const value = (obj.context as any)[axis];
        if (value == null || (Array.isArray(value) && value.length === 0) || value === "")
          err(`context.${axis}`, "Missing. All seven context axes are mandatory (Governance §4).");
      }
    }

    for (const field of ["problem", "decision", "reasoning", "why_this_works", "impact"] as const) {
      if (!obj[field] || String(obj[field]).trim().length < 10)
        err(field, "Missing or too short to carry meaning (Governance §7).");
    }

    if (asArray(obj.use_when).length === 0) err("use_when", "Missing (Governance §14 Context Test).");
    if (asArray(obj.avoid_when).length === 0) err("avoid_when", "Missing (Governance §14 Limitation Test).");

    const numeric: [string, unknown, number, number][] = [
      ["priority", obj.priority, 1, 10],
      ["impact_score", obj.impact_score, 1, 10],
      ["confidence", obj.confidence, 0, 1],
    ];
    for (const [field, value, min, max] of numeric) {
      if (typeof value !== "number" || Number.isNaN(value))
        err(field, `Must be a number in ${min}-${max} (Governance §11).`);
      else if (value < min || value > max) err(field, `Out of range ${min}-${max}: ${value}.`);
    }
    if (obj.context_relevance != null && (obj.context_relevance < 0 || obj.context_relevance > 1))
      err("context_relevance", "Out of range 0-1.");

    return issues;
  }

  // ── Quality gate (Governance §14) ─────────────────────────────────────
  public static runQualityGate(obj: ReasoningKnowledgeObject): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const id = obj.knowledge_id || "(missing id)";
    const warn = (gate: string, message: string) =>
      issues.push({ knowledge_id: id, file: obj._file, severity: "WARNING", gate, message });

    // Context Test — does it say when it applies?
    if (obj.context) {
      const wildcards = CONTEXT_AXES.filter((a) => asArray((obj.context as any)[a]).every((v) => v === "*"));
      if (wildcards.length >= 6)
        warn(
          "Context Test",
          `${wildcards.length}/7 context axes are "*". Knowledge that applies everywhere decides nothing (Governance §4).`
        );
    }

    // Decision Test — does it recommend an action, in decisive language?
    if (obj.decision && HEDGE_PATTERN.test(obj.decision))
      warn(
        "Decision Test",
        `decision uses hedging ("${(obj.decision.match(HEDGE_PATTERN) || [])[0]}"). Layer 2 must choose, not survey options.`
      );

    // Reasoning Test
    if (obj.reasoning && obj.reasoning.trim().length < 30)
      warn("Reasoning Test", "reasoning is too short to explain why the decision is correct.");

    // Limitation Test — trade-offs are required by Governance §10.
    if (!obj.trade_off) warn("Limitation Test", "No trade_off. Every rule must state its cost (Governance §10).");

    // Expert Test — anti-patterns are what a senior creative actually contributes.
    if (!obj.anti_patterns || obj.anti_patterns.length === 0)
      warn("Expert Test", "No anti_patterns. Governance §9 requires failure cases on important objects.");

    // Human insight, where the domain demands it.
    if (HUMAN_INSIGHT_REQUIRED_DOMAINS.has(obj.domain) && !obj.human_insight)
      warn(
        "Expert Test",
        `human_insight is required for domain "${obj.domain}" — without it knowledge is incomplete (Governance §8).`
      );

    // Transfer Test
    if (obj.examples?.length) {
      const missing = obj.examples.filter((e) => !e.transferable_rule);
      if (missing.length)
        warn("Transfer Test", `${missing.length} example(s) have no transferable_rule (Governance §15).`);
    }

    // Controlled vocabulary (Governance §13) — a warning, since the lists are examples.
    const audiences = asArray(obj.context?.audience).filter((v) => v !== "*");
    for (const a of audiences) {
      if (!(AUDIENCE_VOCABULARY as readonly string[]).includes(a))
        warn("Vocabulary", `audience "${a}" is outside the controlled vocabulary (Governance §13).`);
    }
    const positions = asArray(obj.context?.brand_position).filter((v) => v !== "*");
    for (const p of positions) {
      if (!(BRAND_POSITION_VOCABULARY as readonly string[]).includes(p))
        warn("Vocabulary", `brand_position "${p}" is outside the controlled vocabulary (Governance §13).`);
    }

    return issues;
  }

  public static validateAll(objects: ReasoningKnowledgeObject[]): ValidationSummary {
    const issues: ValidationIssue[] = [];
    let valid = 0;

    for (const obj of objects) {
      const structural = this.validateStructure(obj);
      const quality = this.runQualityGate(obj);
      issues.push(...structural, ...quality);
      if (structural.length === 0) valid++;
    }

    return {
      total: objects.length,
      valid,
      errors: issues.filter((i) => i.severity === "ERROR").length,
      warnings: issues.filter((i) => i.severity === "WARNING").length,
      issues,
    };
  }
}
