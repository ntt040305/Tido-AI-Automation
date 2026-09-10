import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";

/**
 * CIOS Phase 4.0.4.1 — why a thing is remembered, rather than how short it is.
 *
 * What was wrong with the 4.0.4 measure
 * ------------------------------------
 * `memorability` was brevity plus a count of concrete nouns. Both correlate with
 * recall and neither is a reason for it. A twelve-word sentence with a noun in it
 * scored well; "the leading choice for quality you can trust" is eight words and
 * contains "choice", and nobody has ever remembered it.
 *
 * These five ask what actually makes something stay:
 *
 *   emotional_hook        Is there a feeling attached? Unattached facts decay.
 *   mental_image          Can you see it? A picture is a second retrieval route.
 *   linguistic_distinction Does the sentence have a shape? Reversals, repetitions
 *                          and contrasts are retained; flat declaratives are not.
 *   story_potential       Is there a before and an after? A situation with change
 *                          in it is a story, and stories are rehearsed.
 *   repeatability         Could one person say it to another without the deck?
 *
 * Still proxies
 * ------------
 * Every one of them. `story_potential` looks for temporal or causal structure,
 * which is where stories live and is not the same as being one. What these buy
 * over the old measure is that a failure now says *which* route to memory is
 * missing, so it can be fixed rather than merely noted.
 */

export const MEMORY_WEIGHTS = {
  emotional_hook: 25,
  mental_image: 25,
  linguistic_distinction: 20,
  story_potential: 15,
  repeatability: 15,
} as const;

export type MemoryDimension = keyof typeof MEMORY_WEIGHTS;

export interface MemoryPatternScore {
  idea: string;
  dimensions: Record<MemoryDimension, number>;
  /** 0-100. */
  total: number;
  /** Which route to memory is missing, for diagnosis. */
  weakest: MemoryDimension;
  evidence: Record<MemoryDimension, string>;
  notes: string[];
}

/** Feelings named rather than gestured at. */
const FELT = [
  "afraid", "fear", "shame", "ashamed", "guilt", "pride", "relief", "exposed",
  "humiliat", "blame", "judged", "isolat", "alone", "doubt", "resent",
  "embarrass", "exclud", "belong", "regret", "insult", "underestimat",
  "verdict", "concede", "admit", "apolog", "tired", "exhaust", "worth",
  "protect", "defend", "permission", "avoid", "quietly", "never once",
];

/** Things a reader can see, hold, or stand in. */
const SEEABLE = [
  "aisle", "shelf", "counter", "room", "door", "house", "home", "flat", "table",
  "bill", "receipt", "phone", "screen", "photograph", "photo", "menu", "queue",
  "appointment", "morning", "night", "bottle", "bottles", "packet", "label",
  "box", "bag", "street", "shop", "face", "hands", "voice", "letter", "list",
  "seat", "mirror", "window", "kitchen", "car", "bus", "market", "sign",
  "price", "chair", "bed", "wardrobe", "shelf", "till", "doorway", "aisle",
];

/** Shapes a sentence can have that make it stick. */
const SHAPES: [RegExp, string][] = [
  [/\b(\w+)\b[^.]*\bnot\b[^.]*\b\1\b/i, "repetition across a negation"],
  [/\bis not\b[^.]*\bit is\b/i, "correction structure"],
  [/\bnot\b[^.]*\bbut\b/i, "not-but contrast"],
  [/\brather than\b|\binstead of\b/i, "explicit alternative"],
  [/\bturn out to be\b|\bthe same\b/i, "identity reveal"],
  [/\bnever\b|\bnobody\b|\bnot one of them\b/i, "absolute"],
  [/\bmore than\b|\blong before\b|\bbefore they\b/i, "comparison of degree"],
  [/^["“]/, "quoted speech"],
  [/\bwhat looks like\b|\bwhat people call\b/i, "reframe opener"],
];

/** Temporal or causal structure — where a story lives. */
const NARRATIVE =
  /\b(?:before|after|then|once|already|still|used to|has (?:been|become)|ends up|turns into|comes back|goes on|every time|by the time|until)\b/i;

/** Vocabulary nobody repeats out loud. */
const UNREPEATABLE =
  /\b(?:proposition|positioning|framework|ecosystem|leverage|optimis\w*|optimiz\w*|synerg\w*|touchpoint|stakeholder|paradigm|holistic)\b/i;

export class MemoryPatternEvaluator {
  public static evaluate(
    idea: string,
    context: { tension?: DynamicHumanTension | null } = {}
  ): MemoryPatternScore {
    const t = String(idea || "").trim();
    const notes: string[] = [];
    const evidence = {} as Record<MemoryDimension, string>;

    if (!t) {
      const zero = {} as Record<MemoryDimension, number>;
      for (const k of Object.keys(MEMORY_WEIGHTS) as MemoryDimension[]) {
        zero[k] = 0;
        evidence[k] = "no idea";
      }
      return { idea: t, dimensions: zero, total: 0, weakest: "emotional_hook", evidence, notes };
    }

    const lowered = t.toLowerCase();

    // ── Emotional hook ─────────────────────────────────────────────────
    const feelings = FELT.filter((f) => lowered.includes(f));
    const emotional_hook = clamp(Math.min(1, feelings.length * 0.45));
    evidence.emotional_hook = feelings.length
      ? `names ${feelings.slice(0, 3).join(", ")}`
      : "no feeling attached";
    if (!feelings.length) notes.push("Nothing to attach the memory to: an unattached fact decays.");

    // ── Mental image ───────────────────────────────────────────────────
    const seen = SEEABLE.filter((s) => new RegExp(`\\b${s}\\b`, "i").test(t));
    const mental_image = clamp(Math.min(1, seen.length * 0.5));
    evidence.mental_image = seen.length ? `you can see: ${seen.slice(0, 3).join(", ")}` : "nothing to picture";

    // ── Linguistic distinction ─────────────────────────────────────────
    const shapes = SHAPES.filter(([p]) => p.test(t)).map(([, n]) => n);
    const linguistic_distinction = clamp(Math.min(1, shapes.length * 0.4));
    evidence.linguistic_distinction = shapes.length
      ? shapes.slice(0, 2).join(" + ")
      : "a flat declarative with no shape";

    // ── Story potential ────────────────────────────────────────────────
    const narrative = NARRATIVE.test(t);
    const hasActor = /\b(?:she|he|they|people|women|men|someone|nobody|everyone|i)\b/i.test(t);
    const behaviourNamed = Boolean(context.tension?.observable_behavior);
    const story_potential = clamp(
      (narrative ? 0.45 : 0) + (hasActor ? 0.35 : 0) + (behaviourNamed ? 0.2 : 0)
    );
    evidence.story_potential = narrative
      ? `has a before and after: "${t.match(NARRATIVE)?.[0]}"`
      : hasActor
        ? "has someone in it, but nothing happens"
        : "no actor and no change";

    // ── Repeatability ──────────────────────────────────────────────────
    const words = t.split(/\s+/).length;
    const unrepeatable = UNREPEATABLE.test(t);
    const clauses = t.split(/[,;:—]/).filter((c) => c.trim().length > 3).length;
    const repeatability = clamp(
      (words <= 14 ? 0.6 : words <= 20 ? 0.4 : 0.15) +
        (clauses <= 2 ? 0.4 : 0.15) -
        (unrepeatable ? 0.6 : 0)
    );
    evidence.repeatability = unrepeatable
      ? `contains a word nobody says: "${t.match(UNREPEATABLE)?.[0]}"`
      : `${words} words, ${clauses} clause(s)`;

    const dimensions: Record<MemoryDimension, number> = {
      emotional_hook: round(emotional_hook),
      mental_image: round(mental_image),
      linguistic_distinction: round(linguistic_distinction),
      story_potential: round(story_potential),
      repeatability: round(repeatability),
    };

    let total = 0;
    for (const k of Object.keys(MEMORY_WEIGHTS) as MemoryDimension[]) {
      total += dimensions[k] * MEMORY_WEIGHTS[k];
    }
    const weakest = (Object.keys(MEMORY_WEIGHTS) as MemoryDimension[]).sort(
      (a, b) => dimensions[a] * MEMORY_WEIGHTS[a] - dimensions[b] * MEMORY_WEIGHTS[b]
    )[0];

    return { idea: t, dimensions, total: Number(total.toFixed(2)), weakest, evidence, notes };
  }

  public static aggregate(scores: MemoryPatternScore[]): {
    cases: number;
    mean_total: number;
    by_dimension: Record<MemoryDimension, number>;
    weakest: MemoryDimension;
  } {
    const dims = Object.keys(MEMORY_WEIGHTS) as MemoryDimension[];
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const by_dimension = {} as Record<MemoryDimension, number>;
    for (const d of dims) by_dimension[d] = Number(mean(scores.map((s) => s.dimensions[d])).toFixed(4));
    const weakest = [...dims].sort(
      (a, b) => by_dimension[a] * MEMORY_WEIGHTS[a] - by_dimension[b] * MEMORY_WEIGHTS[b]
    )[0];
    return {
      cases: scores.length,
      mean_total: Number(mean(scores.map((s) => s.total)).toFixed(2)),
      by_dimension,
      weakest,
    };
  }

  public static format(agg: ReturnType<typeof MemoryPatternEvaluator.aggregate>): string {
    const L = [`MEMORY PATTERN — ${agg.cases} ideas · mean ${agg.mean_total.toFixed(1)} / 100`];
    for (const d of Object.keys(MEMORY_WEIGHTS) as MemoryDimension[]) {
      const w = MEMORY_WEIGHTS[d];
      L.push(`  ${d.padEnd(24)} ${(agg.by_dimension[d] * w).toFixed(1).padStart(5)} / ${String(w).padStart(2)}`);
    }
    L.push(`  weakest route to memory  : ${agg.weakest}`);
    L.push("");
    L.push("  note: five proxies replacing one. story_potential looks for temporal structure,");
    L.push("        which is where stories live and is not the same as being one. What they buy");
    L.push("        over brevity-and-nouns is that a failure now names which route is missing.");
    return L.join("\n");
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round(n: number): number {
  return Number(clamp(n).toFixed(4));
}
