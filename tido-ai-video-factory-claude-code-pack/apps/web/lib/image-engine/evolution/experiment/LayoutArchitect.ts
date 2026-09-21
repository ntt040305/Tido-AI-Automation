import type { AssetContext } from "./AssetContext";
import type { CreativeDecision } from "./CreativeDecision";
import type { ProductMeaning } from "./ProductMeaning";
import type { VisualDNA } from "./VisualDNAAnalyzer";
import type { Decision, DecisionBasis, LayoutDirection } from "./CreativeBlueprint";

/**
 * The Layout Architect — advertising composition, decided rather than inherited.
 *
 * Measured gap this closes: across the live runs the `layout` section grounded
 * 3 or 4 of its 6 fields, and every grounded one came from a clause the
 * director happened to write while deciding something else. Nothing in the
 * pipeline was deciding where the headline goes, where the logo sits, or what
 * the eye does first. A poster whose structure is left to the renderer is a
 * photograph with words on it, which is the difference between this system's
 * output and a brand campaign.
 *
 * Deterministic. No model call, no agent, no clock.
 *
 * Format awareness WITHOUT a category database
 * --------------------------------------------
 * The brief asked this module to understand "luxury product poster, ecommerce
 * advertisement, food advertisement, beverage advertisement, beauty campaign".
 * Three of those are product categories, and a table keyed on them is the one
 * thing this codebase has refused at every phase — `VisualDNAAnalyzer` strips
 * industry words out of observations for exactly this reason, because a
 * category is the shortest route back to the house style the whole experiment
 * exists to escape.
 *
 * What genuinely differs between those examples is not the product. It is:
 *
 *   - the ASSET TYPE, which `AssetContext` already models with `layout_intent`,
 *     `typography_role`, `information_density`, `viewer_behavior` and
 *     `visual_priority` — five real layout inputs, already resolved upstream;
 *   - the COPY STRUCTURE, which `copy_roles` already carries — a frame with a
 *     headline, an offer and a CTA is laid out differently from one with a
 *     product name alone, whatever is being sold;
 *   - the PRODUCT COUNT, which decides whether the frame has a hero or a row.
 *
 * A beverage poster and a beauty poster with the same asset type, the same
 * three copy roles and one product have the same structural problem. Their
 * difference is subject matter, and subject matter is the photographer's and
 * the art director's business, which this module does not touch.
 *
 * So: no category switch, no style preset, and the same code lays out a serum,
 * a bowl of pho, a laptop stand and an insurance ad.
 */

export interface LayoutArchitectInput {
  /** The resolved asset intent. The format spine of every decision below. */
  assetContext?: AssetContext | null;
  /** The director's contract, for staging the client already has. */
  decision?: CreativeDecision | null;
  productMeaning?: ProductMeaning | null;
  visualDNA?: VisualDNA | null;
  /** How many distinct products share the frame. */
  productCount?: number;
  /** True only when an image is explicitly roled LOGO. Never inferred. */
  hasLogo?: boolean;
  /** The client's own copy. USER tier, so it outranks the director's reading. */
  copyItems?: (string | { text: string; type?: string })[];
}

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

function made(
  value: string,
  because: string,
  derived_from: DecisionBasis,
  confidence: Decision["confidence"],
  /**
   * The format's own stated commercial job, where one exists.
   *
   * Layout is the one place this is honestly derivable: `AssetContext` already
   * says what the asset is FOR, and where the copy sits and where the eye goes
   * are the decisions that serve it. Nothing else in the blueprint has a source
   * for commercial effect, which is why it stays absent elsewhere.
   */
  commercialEffect?: string
): Decision | null {
  const v = clean(value);
  const b = clean(because);
  if (!v || !b || v.toLowerCase() === b.toLowerCase()) return null;
  const ce = clean(commercialEffect);
  return { value: v, because: b, derived_from, confidence, ...(ce ? { commercial_effect: ce } : {}) };
}

/** The roles the client's copy actually occupies, in the order assigned. */
function rolesOf(d: CreativeDecision | null | undefined): string[] {
  return (d?.copy_roles || []).map((r) => clean(r?.role).toUpperCase()).filter(Boolean);
}

export class LayoutArchitect {
  /**
   * Fills the blueprint's existing `layout` section. Pure and total.
   *
   * Deliberately returns the SAME `LayoutDirection` the blueprint already
   * defines rather than a new structure. A second layout authority is the
   * defect this project has paid for twice — two scenes in Phase 0.3, two
   * layout authorities in Phase 0.4 — and adding a third would be the same
   * mistake with a better name.
   *
   * The director still outranks it: every field below is a FALLBACK, consulted
   * by the brain only where the director said nothing. That preserves
   * USER > CREATIVE DIRECTOR > AI rather than quietly inverting it.
   */
  static design(input: LayoutArchitectInput): LayoutDirection {
    const ac = input.assetContext || null;
    const d = input.decision || null;
    const pm = input.productMeaning || null;
    // The director's roles where it assigned any; otherwise the client's own
    // labels. Without this the text area is undecided on every run where
    // `typography_roles_v1` is off, which was 12/12 of the last live run.
    const clientRoles = (input.copyItems || [])
      .map((c) => (typeof c === "string" ? "" : clean((c as any)?.type)))
      .filter(Boolean)
      .map((r) => r.toUpperCase());
    const roles = rolesOf(d).length ? rolesOf(d) : clientRoles;
    const count = Math.max(1, input.productCount || 1);
    const observed = input.visualDNA?.observed?.product || null;

    const intent = clean(ac?.layout_intent);
    const priority = clean(ac?.visual_priority);
    const density = clean(ac?.information_density);
    const behaviour = clean(ac?.viewer_behavior);
    const typoRole = clean(ac?.typography_role);
    const goal = clean(ac?.communication_goal);
    const fmt = clean(ac?.asset_type).replace(/_/g, " ");

    const cite = (field: string) => `AssetContext.${field} for a ${fmt || "this"} asset`;

    // ── the structure itself ───────────────────────────────────────────────
    // What kind of poster this is, structurally: one dominant subject, a row,
    // or a divided frame. Decided from the format's own stated intent.
    const visual_balance = made(
      intent
        ? `${intent} The frame resolves as ${count > 1 ? `a row of ${count} equal subjects` : "one dominant subject"}, with the remaining weight carried by the copy block rather than by added decoration.`
        : count > 1
          ? `A row of ${count} equal subjects, weight shared evenly so no one product reads as the hero.`
          : "",
      intent ? cite("layout_intent") : "the client attached several distinct products, which rules out a single hero",
      ac ? "strategy" : "user",
      intent ? "high" : "medium"
    );

    // ── product placement ──────────────────────────────────────────────────
    const staging = (d?.staging_requirements || []).map(clean).filter(Boolean);
    const product_position = made(
      staging.length
        ? staging.join("; ")
        : priority
          ? `${priority} The product holds the optical centre; copy is placed around it and never across its markings.`
          : observed
            ? "The product holds the optical centre, turned so its identifying surface faces the viewer."
            : "",
      staging.length
        ? "the director staged the subjects explicitly"
        : priority
          ? cite("visual_priority")
          : "VisualDNA.observed.product — the identifying surface has to face the viewer to be recognised",
      staging.length ? "director" : priority ? "strategy" : "visual_dna",
      staging.length ? "high" : "medium",
      goal
    );

    // ── where the words live ───────────────────────────────────────────────
    // Derived from which roles the client actually supplied. A frame with a
    // CTA has to reserve a different area from one with a product name alone,
    // and that is true of every category.
    const hasHeadline = roles.includes("HEADLINE");
    const hasCta = roles.includes("CTA") || roles.includes("OFFER");
    const text_area = made(
      roles.length
        ? [
            hasHeadline
              ? "The headline occupies a clear band with the product entirely outside it — never overlapping the label."
              : "",
            hasCta
              ? "The closing line sits in the opposite band from the headline, so the eye travels across the product to reach it."
              : "",
            roles.length > 2
              ? `All ${roles.length} strings share two bands only; a third band would fragment the frame.`
              : "",
            density ? density : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "",
      roles.length
        ? `${rolesOf(d).length ? "CreativeDecision.copy_roles" : "the client's own copy labels"} supplied ${roles.join(", ")}${density ? `, and ${cite("information_density")}` : ""}`
        : "",
      "director",
      "high",
      goal
    );

    // ── the logo ───────────────────────────────────────────────────────────
    // Only when one was actually attached. A logo position invented for a brief
    // with no logo is an instruction to draw one, which is how invented marks
    // get into renders.
    const negative_space = made(
      [
        density
          ? `${density}`
          : "Copy and product are separated by open space rather than by a rule or a panel.",
        input.hasLogo
          ? "The attached logo sits in a corner at the smallest size that stays legible, clear of both the product and the copy bands."
          : "",
        behaviour ? `The space has to survive ${behaviour.toLowerCase()}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      [
        density ? cite("information_density") : "",
        behaviour ? cite("viewer_behavior") : "",
        // Without its own basis the logo line would be dropped by `made`, and a
        // client who attached a logo would get no position for it.
        input.hasLogo ? "an image was attached with the LOGO role" : "",
      ]
        .filter(Boolean)
        .join("; "),
      "strategy",
      "medium"
    );

    // ── visual flow ────────────────────────────────────────────────────────
    const attention_flow = made(
      roles.length || priority
        ? `The eye lands on ${priority ? priority.toLowerCase().replace(/\.$/, "") : "the product"}, then reads ${roles.length ? roles.join(" → ") : "the copy"}${
            pm?.visual_implication ? ", and the product's own markings stay legible throughout that path" : ""
          }.`
        : "",
      [
        priority ? cite("visual_priority") : "",
        roles.length ? "the reading order the director assigned to the client's strings" : "",
        pm?.visual_implication ? `ProductMeaning.visual_implication — ${pm.visual_implication.because}` : "",
      ]
        .filter(Boolean)
        .join("; "),
      roles.length ? "director" : "strategy",
      "high",
      goal
    );

    const composition_balance = made(
      typoRole
        ? `${typoRole} Type and image are weighed against each other rather than layered: whichever carries the message leads, and the other supports it.`
        : "",
      typoRole ? cite("typography_role") : "",
      "strategy",
      "medium"
    );

    return {
      visual_balance,
      product_position,
      text_area,
      negative_space,
      attention_flow,
      composition_balance,
    };
  }
}

/** Counts and field names only — never the layout text. */
export function layoutArchitectTelemetry(l: LayoutDirection | null | undefined) {
  if (!l) return { layout_architect: false };
  const fields = Object.keys(l) as (keyof LayoutDirection)[];
  const filled = fields.filter((f) => l[f]);
  const byBasis: Record<string, number> = {};
  for (const f of filled) byBasis[l[f]!.derived_from] = (byBasis[l[f]!.derived_from] || 0) + 1;
  return {
    layout_architect: true,
    filled: filled.length,
    of: fields.length,
    missing: fields.filter((f) => !l[f]),
    by_basis: byBasis,
  };
}
