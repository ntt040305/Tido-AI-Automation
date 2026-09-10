import { InsightTerms } from "./human-insight.archetypes";
import { HumanTensionAnalyzer } from "./HumanTensionAnalyzer";
import { InsightContradiction } from "./InsightContradictionEngine";
import { InsightExpressionModes, ModeExpression } from "./InsightExpressionModes";
import { MOTIVATION_FAMILIES } from "./human-motivation.types";
import { CreativeTerritory } from "./creative-taste.types";
import { HumanInsight } from "./human-insight.types";

/**
 * CIOS Phase 4.0.4 — the ground a campaign stands on.
 *
 * The missing layer
 * ----------------
 * Phases 4.0.3.x went from a human truth straight to a big idea. One truth, one
 * idea, and the idea *was* the strategy — which meant there was never anything to
 * choose between, and "ranking" one idea against nothing is not ranking.
 *
 * A territory is the intermediate a director actually works in. It names the
 * ground: what the tension is, what the brand does about it, what the work feels
 * like, what it looks like, and what it is about over time rather than in one
 * execution. Several ideas then compete inside it, and the ones that lose lose
 * on the same ground rather than on different grounds.
 *
 * How a territory is built
 * -----------------------
 * Entirely from material the insight layers established — the contradiction for
 * the tension, the motivation stack for the brand role and the emotional space,
 * the ladder's creative-opportunity rung for the story direction. Nothing new is
 * asserted about the audience here.
 *
 * `visual_world` is the one field with no upstream source, and it is the one to
 * read sceptically. It is composed from the concrete nouns already present in the
 * insight rather than invented, so where the insight is abstract the visual world
 * says so instead of supplying a mood board that nothing supports. Art direction
 * is downstream of this and is not this file's business — the field is a
 * direction, not a brief.
 */

/** Concrete nouns the visual world can be built from. */
const FILMABLE = [
  "aisle", "shelf", "counter", "room", "door", "house", "home", "flat", "table",
  "bill", "receipt", "phone", "screen", "photograph", "menu", "queue", "morning",
  "night", "bottle", "packet", "label", "box", "bag", "street", "shop", "face",
  "hands", "voice", "letter", "list", "seat", "mirror", "window", "kitchen",
  "car", "bus", "market", "sign", "price", "appointment", "chair", "bed",
];

export class CreativeTerritoryEngine {
  /**
   * Builds the territory an insight supports, or nothing.
   *
   * Returns null where the insight has no truth or no contradiction — a
   * territory with no tension at its centre is a mood, and a mood is not ground
   * anyone can stand on.
   */
  public static build(
    insight: HumanInsight,
    terms: InsightTerms,
    contradiction: InsightContradiction
  ): CreativeTerritory | null {
    const truth = strip(insight.human_truth);
    if (!truth || !contradiction.passed) return null;

    const stack = insight.dynamic_tension?.motivation;
    const family = MOTIVATION_FAMILIES.find((f) => f.id === stack?.family);
    const at = (s: Parameters<typeof HumanTensionAnalyzer.at>[1]) =>
      strip(HumanTensionAnalyzer.at(insight.ladder, s)?.statement || "");

    const want = lower(strip(contradiction.desire || family?.short_want || ""));
    const identity = lower(strip(contradiction.tradeoff || family?.short_identity || ""));
    const fear = lower(strip(contradiction.fear || ""));
    const opportunity = at("creative_opportunity");

    // ── Name ───────────────────────────────────────────────────────────
    // Two or three words a team would say out loud. Built from the thing at
    // stake rather than from the product, because a territory a brand can own is
    // never named after the brand.
    const name = this.nameFor(family?.stake || want, identity);

    // ── Visual world ───────────────────────────────────────────────────
    // From concrete nouns already in the insight. Where there are none, the
    // field says so rather than inventing a look nothing supports.
    const material = `${truth} ${at("hidden_emotion")} ${at("social_fear")} ${terms.key || ""}`;
    const seen = FILMABLE.filter((f) => new RegExp(`\\b${f}s?\\b`, "i").test(material));
    const visual_world = seen.length
      ? sentence(
          `Ordinary places where this is actually decided — ${seen.slice(0, 3).join(", ")} — shot at the ` +
            "moment before the decision rather than after it"
        )
      : sentence(
          "Not established. The insight carries nothing concrete, so any visual world stated here " +
            "would be invention rather than direction"
        );

    return {
      name,
      central_tension: sentence(
        want && identity
          ? `${cap(terms.who)} want ${want} and will not pay for it with ${identity}`
          : strip(contradiction.tension)
      ),
      // What the brand *does*, not what it says. A role that is a claim is not a
      // role.
      brand_role: sentence(
        want
          ? `The one that removes the cost, so ${want} stops requiring anything to be given up`
          : "The one that names the cost nobody else will"
      ),
      emotional_space: sentence(
        fear
          ? `The quiet between wanting it and being seen wanting it — where ${fear} is being managed`
          : strip(stack?.emotional_need || "The space where the decision is actually made")
      ),
      visual_world,
      story_direction: sentence(
        opportunity
          ? strip(opportunity).replace(/^A brand could answer this by /i, "Over time, the brand ")
          : `Over time, the brand becomes the place where ${want || "this"} does not cost anything`
      ),
      derived_from: [insight.archetype, stack?.family || ""].filter(Boolean),
    };
  }

  /**
   * Several territories, from the same insight. Phase 4.0.7.
   *
   * Why this exists
   * --------------
   * The audit measured 0.92 territories per brief: every idea in the run was
   * competing on identical ground, so "ranking" was choosing between six phrasings
   * of one strategy. A director does not do that. They put three different
   * grounds on the table and argue about which one the brand can own.
   *
   * These are not renames of `build()`. Each takes its central tension from a
   * *different layer of the motivation stack*, which is the only honest way to get
   * more than one territory out of one insight:
   *
   *   the stake        — what is lost if the need goes unmet  (this is `build()`)
   *   the consequence  — what other people would conclude
   *   the underneath   — the larger thing the small thing is a case of
   *   the act          — the observed behaviour, taken as the subject
   *
   * A layer the insight does not carry produces no territory rather than a padded
   * one, so a thin insight yields one or two and the pool builder is told it has
   * fewer grounds to work with. `build()` is unchanged and remains the first
   * entry, so every existing caller sees exactly what it saw before.
   */
  public static buildMany(
    insight: HumanInsight,
    terms: InsightTerms,
    contradiction: InsightContradiction
  ): CreativeTerritory[] {
    const primary = this.build(insight, terms, contradiction);
    if (!primary) return [];

    const out: CreativeTerritory[] = [primary];
    const stack = insight.dynamic_tension?.motivation;
    const behaviour = strip(insight.dynamic_tension?.observable_behavior || "");
    const who = terms.who || "people";
    const fear = lower(strip(contradiction.fear || ""));
    const want = lower(strip(contradiction.desire || ""));

    // ── The consequence ────────────────────────────────────────────────
    // Ground built on what other people would conclude, rather than on what is
    // lost. A campaign here is about the audience of the decision, not the
    // decision — genuinely different work, not a different sentence.
    const consequence = lower(strip(stack?.social_consequence || ""));
    if (consequence && consequence.split(/\s+/).length >= 3) {
      out.push({
        name: this.nameFor(consequence, ""),
        central_tension: sentence(`What ${who} do here is read by other people as ${consequence}`),
        brand_role: sentence("The one that changes what the act says about them, rather than what it costs"),
        emotional_space: sentence(
          fear ? `Being watched deciding, where ${fear} is the thing being avoided` : "The moment of being seen choosing"
        ),
        visual_world: primary.visual_world,
        story_direction: sentence(`Over time, the brand makes this a thing ${who} are seen doing on purpose`),
        derived_from: [insight.archetype, "motivation:social_consequence"].filter(Boolean),
      });
    }

    // ── The underneath ─────────────────────────────────────────────────
    const underneath = lower(strip(stack?.existential_tension || ""));
    if (underneath && underneath.split(/\s+/).length >= 4) {
      out.push({
        name: this.nameFor(underneath, ""),
        central_tension: sentence(cap(underneath)),
        brand_role: sentence("The one that takes the small decision seriously because of what it is a case of"),
        emotional_space: sentence(
          strip(stack?.emotional_need || "The larger thing, arriving in a small moment")
        ),
        visual_world: primary.visual_world,
        story_direction: sentence(`Over time, the brand argues that this was never a small thing`),
        derived_from: [insight.archetype, "motivation:existential_tension"].filter(Boolean),
      });
    }

    // ── The act ────────────────────────────────────────────────────────
    // Only where a behaviour was actually observed or reconstructed. A territory
    // built on an act nobody performs is the failure mode this guard exists for.
    if (behaviour && behaviour.split(/\s+/).length >= 2 && behaviour.split(/\s+/).length <= 12) {
      out.push({
        name: this.nameFor(behaviour, want),
        central_tension: sentence(`${cap(who)} ${lower(behaviour)}, and the category has never once asked why`),
        brand_role: sentence("The one that notices the act and takes its side"),
        emotional_space: sentence("The ordinary repeated moment, before anyone explains it"),
        visual_world: primary.visual_world,
        story_direction: sentence("Over time, the brand becomes the one that understood the habit"),
        derived_from: [insight.archetype, "behaviour"].filter(Boolean),
      });
    }

    // Two territories with the same name are one territory. Deduplicated here
    // rather than at the pool, so the count the builder reads is truthful.
    const seen = new Set<string>();
    return out.filter((t) => {
      const k = t.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /**
   * Several ideas inside one territory.
   *
   * The expression modes already produce one idea per mode; what this adds is
   * that they are now produced *against a named territory* and can be compared
   * on it. The territory is carried on each so the ranking can say which ground
   * an idea was competing on.
   */
  public static ideasFor(
    territory: CreativeTerritory,
    insight: HumanInsight,
    terms: InsightTerms,
    contradiction: InsightContradiction,
    dna?: import("./brand-dna.types").BrandDNA
  ): { territory: CreativeTerritory; ideas: ModeExpression[] } {
    return {
      territory,
      ideas: InsightExpressionModes.express(insight, terms, contradiction, dna),
    };
  }

  /**
   * A short name, from the stake.
   *
   * Deliberately mechanical: two or three content words, title-cased. A generated
   * name that tries to be clever reads worse than one that is plainly descriptive,
   * and a director renames it in the meeting anyway.
   */
  private static nameFor(stake: string, identity: string): string {
    const source = strip(stake) || strip(identity) || "the unnamed ground";
    const words = source
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w));
    const picked = words.slice(0, 3);
    if (!picked.length) return "Unnamed Territory";
    return picked.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  /** Run-level summary. */
  public static aggregate(territories: (CreativeTerritory | null)[]): {
    cases: number;
    built: number;
    distinct_names: number;
    /** Territories whose visual world could not be established. */
    unestablished_visual: number;
    most_common?: { name: string; count: number };
  } {
    const built = territories.filter(Boolean) as CreativeTerritory[];
    const names = new Map<string, number>();
    for (const t of built) names.set(t.name, (names.get(t.name) || 0) + 1);
    const top = [...names.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      cases: territories.length,
      built: built.length,
      distinct_names: names.size,
      unestablished_visual: built.filter((t) => /^Not established/.test(t.visual_world)).length,
      most_common: top ? { name: top[0], count: top[1] } : undefined,
    };
  }

  public static format(agg: ReturnType<typeof CreativeTerritoryEngine.aggregate>): string {
    return [
      `TERRITORIES — ${agg.built} built from ${agg.cases} insights`,
      `  distinct names        : ${agg.distinct_names}`,
      `  visual world unestablished : ${agg.unestablished_visual}`,
      agg.most_common
        ? `  most common           : ${agg.most_common.name} (${agg.most_common.count})`
        : "",
      "",
      "  note: a territory is built only from what the insight layers established. Where the",
      "        insight carries nothing concrete, visual_world reports that rather than inventing",
      "        a look. Art direction is downstream and is not decided here.",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

const STOP = new Set([
  "being", "that", "this", "with", "from", "have", "your", "their", "them",
  "they", "what", "when", "where", "which", "will", "would", "about", "into",
  "over", "under", "than", "then", "kind", "person", "people", "later", "does",
]);

function sentence(text: string): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const body = t.replace(/[.]+$/, "");
  return body.charAt(0).toUpperCase() + body.slice(1) + ".";
}
function strip(text: string): string {
  return String(text || "").replace(/[.]+$/, "").trim();
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function lower(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
