import type { MarketingBrainStrategy } from "../../llm/prompt-strategy.schema";
import type { ProductTruth, TruthClaim } from "./ProductTruth";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import {
  BRIEF_FIELDS,
  BRIEF_SOURCES,
  BriefField,
  BriefFieldName,
  CreativeBrief,
} from "./CreativeBrief";

/**
 * Phase 1.1B — ProductTruth + VisualDNA + Marketing Strategy → Creative Brief.
 *
 * A deterministic transformation layer. No model call, no agent, no clock, no
 * randomness: the same inputs produce the same brief every time, which is what
 * makes it testable offline and what stops it becoming a sixth place where
 * creative decisions get made.
 *
 * The rule this service is built around
 * -------------------------------------
 * IT ASSEMBLES, IT DOES NOT AUTHOR. Every value is composed from claims that
 * already exist upstream, and `derived_from` names the ones used. Where the
 * inputs are silent the field is null and `missing` says so.
 *
 * That is not timidity. A brief field invented to fill a schema slot is
 * indistinguishable, downstream, from one a client supplied — and the director
 * will treat both as given. Phase 0.5 measured what unforced creative input
 * produces: six of twelve routes that explicitly disclaim having an idea. An
 * empty field is visible; a plausible invention is not.
 *
 * Why strategy is optional
 * ------------------------
 * The architecture this phase was asked for reads ProductTruth + VisualDNA +
 * Marketing Strategy → Brief → Director. In the pipeline as it stands the
 * marketing strategy is produced by `MasterPromptCompilerService`, which runs
 * AFTER the director has judged. So at the only insertion point where a brief
 * can reach the director, the strategy does not exist yet.
 *
 * Rather than move the marketing brain — a reordering far beyond this phase —
 * the builder takes strategy as optional and reports the two fields that depend
 * on it as missing when it is absent. `completeness` then states the real
 * number instead of a flattering one. The ordering problem is recorded, not
 * papered over.
 */

export interface CreativeBriefInput {
  productTruth?: ProductTruth | null;
  visualDNA?: VisualDNA | null;
  /**
   * Absent at the director insertion point today. See the note above; when the
   * ordering is resolved this is the only change required here.
   */
  strategy?: MarketingBrainStrategy | null;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** A claim that actually says something. ABSENT claims carry an empty value. */
function stated(claim: TruthClaim | undefined | null): string {
  if (!claim || claim.provenance === "ABSENT") return "";
  return clean(claim.value);
}

/** Builds a field, or null when every source was silent. */
function field(parts: { text: string; source: string }[]): BriefField | null {
  const used = parts.filter((p) => p.text.trim());
  if (!used.length) return null;
  return {
    value: used.map((p) => p.text.trim()).join(" "),
    // Sources in the order they contributed, deduplicated. A source that
    // contributed nothing is not cited: a provenance list that names inputs the
    // value does not rest on is a worse lie than no list at all.
    derived_from: [...new Set(used.map((p) => p.source))],
  };
}

export class CreativeBriefBuilderService {
  /**
   * Pure and total. Never throws, and never returns null: a brief with five
   * empty fields is a legitimate answer for a request that supplied nothing,
   * and a caller inside a paid render must not be taken down by an absent
   * adjective.
   */
  static build(input: CreativeBriefInput): CreativeBrief {
    const t = input.productTruth || null;
    const s = input.strategy || null;
    const observed = input.visualDNA?.observed?.product || null;

    // ── product_story ────────────────────────────────────────────────────
    // What it does, and where that matters. Differentiation joins when a later
    // phase fills it; today it is DERIVED-only and therefore ABSENT.
    const product_story = field([
      { text: stated(t?.functional_truth), source: BRIEF_SOURCES.FUNCTIONAL_TRUTH },
      { text: stated(t?.differentiation), source: BRIEF_SOURCES.DIFFERENTIATION },
      { text: stated(t?.usage_context), source: BRIEF_SOURCES.USAGE_CONTEXT },
    ]);

    // ── consumer_problem ─────────────────────────────────────────────────
    // Strategy's territory entirely. `target_audience` is on the request and is
    // deliberately NOT used here: who the buyer is and what they are trying to
    // solve are different questions, and answering the second with the first
    // would be the invention this service refuses.
    const consumer_problem = field([
      { text: clean(s?.consumer_insight), source: BRIEF_SOURCES.CONSUMER_INSIGHT },
      { text: clean(s?.target_customer_psychology), source: BRIEF_SOURCES.CUSTOMER_PSYCHOLOGY },
    ]);

    // ── emotional_angle ──────────────────────────────────────────────────
    const emotional_angle = field([
      { text: stated(t?.emotional_value), source: BRIEF_SOURCES.EMOTIONAL_VALUE },
      { text: clean(s?.emotional_response), source: BRIEF_SOURCES.EMOTIONAL_RESPONSE },
      { text: clean(s?.creative_message), source: BRIEF_SOURCES.CREATIVE_MESSAGE },
    ]);

    // ── visual_opportunity ───────────────────────────────────────────────
    // What a camera can actually point at. Read off the image where one was
    // analysed, because material is observable and describing it from anywhere
    // else with the observation available is the defect ProductTruth's OBSERVED
    // tier exists to prevent.
    const observedParts = observed
      ? [
          clean(observed.form),
          (observed.materials || []).map(clean).filter(Boolean).join(", "),
          clean(observed.finish),
          clean(observed.surface_detail),
        ].filter(Boolean)
      : [];
    const visual_opportunity = field([
      { text: observedParts.join("; "), source: BRIEF_SOURCES.OBSERVED_PRODUCT },
      // Only when no image was read. With one, the line above already carries
      // it and a second copy would be two descriptions of one surface.
      { text: observedParts.length ? "" : stated(t?.sensory), source: BRIEF_SOURCES.SENSORY },
    ]);

    // ── avoid_direction ──────────────────────────────────────────────────
    // The one field derived from absence rather than presence, and the most
    // useful thing this layer produces. ProductTruth already knows which claims
    // nothing establishes; a direction resting on one of them is resting on
    // nothing, and saying so costs no new information.
    const absentNames: string[] = [];
    const absent: [string, TruthClaim | undefined][] = [
      ["what makes this one different from others in its category", t?.differentiation],
      ["what it is worth to someone beyond what it does", t?.emotional_value],
      ["how, where and by whom it is actually used", t?.usage_context],
      ["what the product physically is", t?.sensory],
      ["what the product does", t?.functional_truth],
    ];
    for (const [label, claim] of absent) {
      if (claim && claim.provenance === "ABSENT") absentNames.push(label);
    }
    const avoid_direction = field([
      {
        text: absentNames.length
          ? `Do not build the idea on: ${absentNames.join("; ")}. Nothing supplied or observed establishes these.`
          : "",
        source: BRIEF_SOURCES.ABSENT_CLAIMS,
      },
    ]);

    const fields: Record<BriefFieldName, BriefField | null> = {
      product_story,
      consumer_problem,
      emotional_angle,
      visual_opportunity,
      avoid_direction,
    };

    const missing = BRIEF_FIELDS.filter((f) => !fields[f]);
    const filled = BRIEF_FIELDS.length - missing.length;

    return {
      ...fields,
      completeness: Math.round((filled / BRIEF_FIELDS.length) * 100) / 100,
      missing,
    };
  }
}
