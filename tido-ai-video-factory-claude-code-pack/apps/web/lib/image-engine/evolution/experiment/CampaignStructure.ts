import type { AssetContext } from "./AssetContext";
import type { MarketingInsight } from "./MarketingInsight";
import type { CreativeDecision } from "./CreativeDecision";
import type { Decision, DecisionBasis } from "./CreativeBlueprint";

/**
 * Template Intelligence — which advertising structure this brief needs.
 *
 * Not templates. A template prescribes a layout; this picks a STRUCTURE, which
 * is a claim about what the advertisement has to do — lead with an offer, lead
 * with a demonstration, lead with someone else's word. The layout that follows
 * is still decided by `LayoutArchitect` from the asset type, so nothing here
 * pins a composition.
 *
 * Decided from evidence, never from category
 * ------------------------------------------
 * A structure is chosen from what the brief actually supplies: whether the copy
 * contains an offer, whether the format expects a person, whether several
 * products share the frame, what the campaign objective says. A skincare brief
 * and a coffee brief with the same offer, the same format and the same audience
 * get the same structure, because their advertising problem is the same one.
 * Nothing here keys on what the product is.
 *
 * Deterministic, pure, no model call.
 */

export type CampaignStructure =
  | "product_hero"
  | "sale_offer"
  | "launch"
  | "social_hook"
  | "ugc_testimonial"
  | "comparison"
  | "storytelling";

export interface StructureChoice {
  structure: CampaignStructure;
  decision: Decision;
  /** Structures that fit but scored lower, with the evidence that separated them. */
  alternatives: { structure: CampaignStructure; why_not: string }[];
}

export interface StructureInput {
  assetContext?: AssetContext | null;
  marketingInsight?: MarketingInsight | null;
  decision?: CreativeDecision | null;
  objective?: string;
  productCount?: number;
  /** The client's own copy, with whatever roles they labelled. */
  copyItems?: (string | { text: string; type?: string })[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

interface Candidate {
  structure: CampaignStructure;
  score: number;
  evidence: string;
  derived_from: DecisionBasis;
}

/**
 * Chooses the structure. Pure and total.
 *
 * Returns null when nothing in the brief distinguishes one structure from
 * another — a choice made with no evidence is a default wearing a decision's
 * clothes, and `LayoutArchitect` already handles the undifferentiated case.
 */
export function chooseStructure(input: StructureInput): StructureChoice | null {
  const ac = input.assetContext || null;
  const assetType = clean(ac?.asset_type);
  const objective = clean(input.objective).toLowerCase();
  const count = Math.max(1, input.productCount || 1);
  const roles = (input.copyItems || [])
    .map((c) => (typeof c === "string" ? "" : clean((c as any)?.type)))
    .filter(Boolean)
    .map((r) => r.toLowerCase());

  const candidates: Candidate[] = [];

  // An offer in the client's own copy is the strongest single signal there is:
  // they told us what the advertisement is for.
  if (roles.includes("offer") || roles.includes("price")) {
    candidates.push({
      structure: "sale_offer",
      score: 10,
      evidence: "the client labelled one of their strings an offer",
      derived_from: "user",
    });
  }

  if (count > 1) {
    candidates.push({
      structure: "comparison",
      score: 7,
      evidence: `${count} distinct products share the frame, which is a comparison whether or not it is framed as one`,
      derived_from: "user",
    });
  }

  if (assetType === "product_hero") {
    candidates.push({
      structure: "product_hero",
      score: 8,
      evidence: "the requested asset type is a product hero",
      derived_from: "user",
    });
  }

  if (assetType === "ugc_thumbnail") {
    candidates.push({
      structure: "ugc_testimonial",
      score: 8,
      evidence: "the requested asset type is UGC, which speaks in someone else's voice",
      derived_from: "user",
    });
  }

  if (assetType === "social_ad") {
    candidates.push({
      structure: "social_hook",
      score: 6,
      evidence: "a social asset is scrolled past unless it stops someone in the first moment",
      derived_from: "strategy",
    });
  }

  if (/ra mắt|launch|new|mới/i.test(objective)) {
    candidates.push({
      structure: "launch",
      score: 7,
      evidence: `the campaign objective states a launch ("${clean(input.objective)}")`,
      derived_from: "user",
    });
  }

  // A recorded tension is what a story needs. Without one, storytelling is a
  // description with a longer caption.
  const problem = input.marketingInsight?.customer_problem;
  if (problem && clean(input.decision?.deliberately_avoided)) {
    candidates.push({
      structure: "storytelling",
      score: 6,
      evidence: `a customer problem is established and the director recorded a trade-off, which is what a story resolves`,
      derived_from: problem.derived_from,
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  return {
    structure: winner.structure,
    decision: {
      value: winner.structure.replace(/_/g, " "),
      because: winner.evidence,
      derived_from: winner.derived_from,
      // A single signal is a reading; several agreeing is a finding.
      confidence: winner.score >= 8 ? "high" : candidates.length > 1 ? "medium" : "low",
    },
    alternatives: candidates.slice(1).map((c) => ({
      structure: c.structure,
      why_not: `${c.evidence} — but that signal is weaker than the one chosen`,
    })),
  };
}

/** Structure names only — never the brief's text. */
export function structureTelemetry(c: StructureChoice | null | undefined) {
  if (!c) return { structure: null };
  return {
    structure: c.structure,
    confidence: c.decision.confidence,
    derived_from: c.decision.derived_from,
    alternatives: c.alternatives.map((a) => a.structure),
  };
}
