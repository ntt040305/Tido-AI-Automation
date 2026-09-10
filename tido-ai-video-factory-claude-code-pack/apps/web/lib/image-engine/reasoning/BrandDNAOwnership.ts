import {
  BrandDNA,
  CATEGORY_PERMISSION,
  NO_BRAND_DNA,
  OwnershipVerdict,
  TONE_BEHAVIOR,
} from "./brand-dna.types";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { classifyBest } from "./semantic-relations";

/**
 * CIOS Phase 4.0.4.1 — ownership as a relation, not an overlap.
 *
 * What changed from the token test
 * -------------------------------
 * Phase 4.0.4 asked whether the idea contained a token the brief supplied. This
 * asks four questions instead, in descending order of how much they establish:
 *
 *   1. Does the idea rest on something the brand has *done*? History is the
 *      strongest ownership evidence there is, because a competitor cannot
 *      acquire another brand's past.
 *   2. Does it act out a stated behaviour rather than assert a value? A brand
 *      that says it is honest owns nothing; a brand that prints the price before
 *      it is asked for owns something.
 *   3. Does it use a distinctive asset — something recognisable without a logo?
 *   4. Does it rest on the specific situation this brief described? The weakest
 *      of the four, and what the whole 4.0.4 test consisted of.
 *
 * And one question that can only subtract: does the idea claim something the
 * category does not permit? A healthcare idea promising an outcome is not a
 * weakly-owned idea, it is one that cannot run.
 *
 * Confidence, and why it matters more than the score
 * -------------------------------------------------
 * Almost none of this is in a normal brief. `confidence` reports how much DNA was
 * actually known, and a verdict at low confidence should be read as "unknown",
 * not as "no". The token test could always answer; this one frequently cannot,
 * and the cases where it cannot are exactly the ones where nobody should be told
 * their idea is ownable.
 */

export class BrandDNAOwnership {
  /**
   * Builds what DNA the brief genuinely supports.
   *
   * Three of the six fields can be derived: behaviour from the stated tone,
   * category permission from the industry, distinctive assets from the product.
   * Values and history cannot be derived from anything a brief contains, and are
   * left empty rather than invented — a fabricated history is the one error in
   * this file that would be actively dangerous, because ownership reasoning
   * built on it would read as evidence.
   */
  public static resolve(brief: {
    brand?: string;
    product?: string;
    category?: string;
    tone?: string;
    /** A caller who knows the brand can declare any of these. */
    declared?: Partial<BrandDNA>;
  }): BrandDNA {
    const provenance: Record<string, "DECLARED" | "DERIVED" | "ABSENT"> = {};
    const d = brief.declared || {};

    const values = d.values?.length ? d.values : [];
    provenance.values = values.length ? "DECLARED" : "ABSENT";

    const history = d.history?.length ? d.history : [];
    provenance.history = history.length ? "DECLARED" : "ABSENT";

    let behavior = d.behavior?.length ? [...d.behavior] : [];
    provenance.behavior = behavior.length ? "DECLARED" : "ABSENT";
    if (!behavior.length && brief.tone) {
      const derived = TONE_BEHAVIOR.filter(([p]) => p.test(brief.tone!)).map(([, b]) => b);
      if (derived.length) {
        behavior = derived;
        provenance.behavior = "DERIVED";
      }
    }

    const category = String(brief.category || "").toLowerCase();
    const permission = d.category_permission ||
      CATEGORY_PERMISSION[category] || { permitted: [], forbidden: [] };
    provenance.category_permission = d.category_permission
      ? "DECLARED"
      : CATEGORY_PERMISSION[category]
        ? "DERIVED"
        : "ABSENT";

    let assets = d.distinctive_assets?.length ? [...d.distinctive_assets] : [];
    provenance.distinctive_assets = assets.length ? "DECLARED" : "ABSENT";
    if (!assets.length && brief.product) {
      // The product itself is the only asset a brief reliably names. It is a
      // weak one — most competitors have a comparable product — and it is
      // marked DERIVED so the reasoning can say so.
      assets = [String(brief.product).toLowerCase()];
      provenance.distinctive_assets = "DERIVED";
    }

    const known = Object.values(provenance).filter((p) => p !== "ABSENT").length;
    const declared = Object.values(provenance).filter((p) => p === "DECLARED").length;

    return {
      brand: String(brief.brand || ""),
      values,
      history,
      behavior,
      category_permission: permission,
      distinctive_assets: assets,
      provenance,
      // Declared fields count fully; derived ones count half, because a tone is
      // an intention and a product is not distinctive.
      completeness: Number(Math.min(1, (declared + (known - declared) * 0.5) / 5).toFixed(3)),
    };
  }

  /** Judges one idea against a brand's DNA. */
  public static evaluate(
    idea: string,
    dna: BrandDNA,
    context: {
      /** The behaviour the brief described, for the weakest of the four checks. */
      behaviour?: string;
      keyPhrase?: string;
      tension?: DynamicHumanTension | null;
    } = {}
  ): OwnershipVerdict {
    const t = String(idea || "").trim();
    const reasoning: string[] = [];
    const notes: string[] = [];

    if (!t) {
      return {
        ownership: 0,
        reasoning: [],
        confidence: 0,
        breaches_permission: false,
        notes: ["No idea to judge."],
      };
    }
    if (dna === NO_BRAND_DNA || !dna.brand) {
      notes.push("No brand DNA at all, so ownership cannot be established either way.");
    }

    let ownership = 0;

    // ── 1. History — the strongest evidence ────────────────────────────
    //
    // Phase 4.0.4.1: judged as a *relation* rather than as shared words. An idea
    // that enacts a history owns it; an idea that merely names one is trading on
    // it. Those are different claims and a word count could not separate them.
    const history = classifyBest(t, dna.history);
    if (history) {
      const weight = history.verdict.relation === "ENACTS" ? 0.45 : history.verdict.relation === "TRANSFORMS" ? 0.35 : 0.2;
      ownership += weight;
      reasoning.push(
        `${history.verdict.relation === "ENACTS" ? "Enacts" : history.verdict.relation === "TRANSFORMS" ? "Builds on" : "Invokes"} ` +
          `something the brand has done — ${history.verdict.evidence}: "${truncate(history.reference)}".`
      );
    }

    // ── 2. Behaviour acted out, not asserted ───────────────────────────
    // The distinction this relation makes is the whole point of the dimension:
    // a brand that *says* it is honest owns nothing, a brand whose idea prints
    // the price before it is asked for owns something.
    const behaviour = classifyBest(t, dna.behavior);
    if (behaviour) {
      const enacted = behaviour.verdict.relation === "ENACTS";
      const weight = enacted ? 0.3 : behaviour.verdict.relation === "TRANSFORMS" ? 0.22 : 0.1;
      ownership += weight;
      const how = dna.provenance.behavior === "DERIVED" ? " (derived from the stated tone, which is an intention rather than a record)" : "";
      reasoning.push(
        `${enacted ? "Acts out" : "References"} a brand behaviour${how} — ${behaviour.verdict.evidence}: ` +
          `"${truncate(behaviour.reference)}".`
      );
      if (!enacted) {
        notes.push("The behaviour is named rather than performed, which is a weaker claim on it.");
      }
    }

    // ── 3. A distinctive asset ─────────────────────────────────────────
    const assetHit = dna.distinctive_assets.find((a) => shares(t, a, 1));
    if (assetHit) {
      const weight = dna.provenance.distinctive_assets === "DERIVED" ? 0.12 : 0.3;
      ownership += weight;
      reasoning.push(
        dna.provenance.distinctive_assets === "DERIVED"
          ? `Uses the product, which most competitors have a version of: "${truncate(assetHit)}".`
          : `Uses a distinctive asset: "${truncate(assetHit)}".`
      );
    }

    // ── 4. The brief's own situation — the weakest ─────────────────────
    // This is what the whole 4.0.4 test consisted of. Kept, and weighted as the
    // least of the four rather than as the only one.
    const situational =
      (context.behaviour && shares(t, context.behaviour, 2)) ||
      (context.keyPhrase && shares(t, context.keyPhrase, 2));
    if (situational) {
      ownership += 0.25;
      reasoning.push("Rests on the specific situation this brief described.");
    }

    // ── Category permission — subtracts only ───────────────────────────
    const breach = dna.category_permission.forbidden.find((f) => claimsForbidden(t, f));
    if (breach) {
      reasoning.push(`Claims something this category does not permit: "${breach}".`);
      notes.push("A permission breach is not a weak idea; it is one that cannot run.");
    }

    // A brand can also be the wrong one to say something because the idea
    // contradicts what it holds. Shared words could never show this; an opposed
    // relation on a shared subject can.
    const value = classifyBest(t, dna.values, ["CONTRADICTS", "ENACTS", "TRANSFORMS", "INVOKES", "RESTATES", "UNRELATED"]);
    if (value && value.verdict.relation === "CONTRADICTS") {
      ownership = Math.max(0, ownership - 0.3);
      reasoning.push(`Contradicts a stated brand value: "${truncate(value.reference)}".`);
      notes.push("An idea that contradicts what the brand holds is not weakly owned; it is off-brand.");
    }

    if (!reasoning.length) {
      reasoning.push("Rests on nothing this brand has, does, owns, or was briefed on.");
    }

    // ── Confidence ─────────────────────────────────────────────────────
    // What the verdict is worth, given how much DNA existed to judge against.
    const confidence = Number(Math.min(1, 0.2 + dna.completeness * 0.8).toFixed(3));
    if (confidence < 0.5) {
      notes.push(
        `Low confidence (${confidence.toFixed(2)}): most of this brand's DNA is unknown, so read a low ` +
          "ownership score as unestablished rather than as absent."
      );
    }

    return {
      ownership: Number(Math.min(1, ownership).toFixed(3)),
      reasoning,
      confidence,
      breaches_permission: Boolean(breach),
      breach,
      notes,
    };
  }

  public static aggregate(verdicts: OwnershipVerdict[]): {
    cases: number;
    mean_ownership: number;
    mean_confidence: number;
    owned: number;
    ownership_rate: number;
    breaches: number;
    /** Verdicts too low-confidence to act on either way. */
    unestablished: number;
  } {
    const n = verdicts.length || 1;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const owned = verdicts.filter((v) => v.ownership >= 0.45 && !v.breaches_permission).length;
    return {
      cases: verdicts.length,
      mean_ownership: Number(mean(verdicts.map((v) => v.ownership)).toFixed(3)),
      mean_confidence: Number(mean(verdicts.map((v) => v.confidence)).toFixed(3)),
      owned,
      ownership_rate: Number((owned / n).toFixed(3)),
      breaches: verdicts.filter((v) => v.breaches_permission).length,
      unestablished: verdicts.filter((v) => v.confidence < 0.5).length,
    };
  }

  public static format(agg: ReturnType<typeof BrandDNAOwnership.aggregate>): string {
    return [
      `BRAND DNA OWNERSHIP — ${agg.cases} ideas`,
      `  mean ownership     : ${agg.mean_ownership.toFixed(2)}`,
      `  owned (>=0.45)     : ${agg.owned} (${(agg.ownership_rate * 100).toFixed(0)}%)`,
      `  permission breaches: ${agg.breaches}`,
      `  mean confidence    : ${agg.mean_confidence.toFixed(2)}`,
      `  unestablished      : ${agg.unestablished} (DNA too thin to judge)`,
      "",
      "  note: history is the strongest ownership evidence and no brief in this benchmark",
      "        supplies any, so most verdicts here rest on derived behaviour and the brief's",
      "        own situation. Read a low score at low confidence as unknown, not as no.",
    ].join("\n");
  }
}

/** Do the two texts share at least `n` content words? */
function shares(a: string, b: string, n: number): boolean {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (!wb.length) return false;
  let hits = 0;
  for (const w of wb) if (wa.includes(w)) hits++;
  return hits >= Math.min(n, wb.length);
}

/**
 * Does the idea make a forbidden claim?
 *
 * Matched on the claim's own verb-and-object rather than on any shared word, so
 * "promising an outcome" is not triggered by an idea that merely says "outcome".
 */
function claimsForbidden(idea: string, forbidden: string): boolean {
  const t = idea.toLowerCase();
  const f = forbidden.toLowerCase();
  if (/promis\w*/.test(f)) {
    const object = f.replace(/^.*promis\w*\s+(?:an?\s+)?/, "").trim();
    return /\b(?:promise|guarantee|will\s+\w+|ensures?|assures?)\b/.test(t) && shares(t, object, 1);
  }
  if (/implying|imply/.test(f)) {
    const object = f.replace(/^.*impl\w*\s+(?:an?\s+|it\s+)?/, "").trim();
    return shares(t, object, 2);
  }
  if (/claiming|claim/.test(f)) {
    const object = f.replace(/^.*claim\w*\s+/, "").trim();
    return /\b(?:claims?|best|leading|only)\b/.test(t) && shares(t, object, 1);
  }
  return shares(t, f, 3);
}

function contentWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !COMMON.has(w));
}

const COMMON = new Set([
  "that", "this", "with", "from", "they", "them", "their", "have", "will",
  "would", "about", "there", "these", "those", "what", "when", "where", "which",
  "while", "because", "than", "then", "more", "most", "some", "such", "only",
  "very", "just", "also", "into", "over", "under", "been", "being", "does",
  "something", "anything", "nothing", "people", "someone",
]);

function truncate(s: string): string {
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}
