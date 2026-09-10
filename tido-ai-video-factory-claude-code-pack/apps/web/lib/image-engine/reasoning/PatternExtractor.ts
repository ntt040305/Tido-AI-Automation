import { CREATIVE_STRUCTURES, CreativeStructure, StructureDetection } from "./creative-patterns.types";
import { DynamicHumanTension } from "./DynamicHumanTensionDiscovery";
import { classify } from "./semantic-relations";

/**
 * CIOS Phase 4.0.5 — which creative device is this idea using?
 *
 * Why this is not the template fingerprint
 * ---------------------------------------
 * `CreativeTasteMemory.patternOf` reduces an idea to the frame that produced it.
 * This asks a different question: what *device* is the idea using, of the kind a
 * creative department would name out loud. The two come apart in both
 * directions — one frame can produce two devices depending on the material, and
 * two frames can produce the same device.
 *
 * The device is what transfers between briefs, which is why the memory holds it.
 *
 * Detection, and its honest reach
 * ------------------------------
 * Each structure is detected from surface features plus, where it helps, a
 * relation to the insight's own material. `object_carrying_truth` is the most
 * reliable — a concrete noun doing subject work is visible. `unexpected_
 * perspective` is the least: seeing a situation from somewhere nobody stands is
 * a property of the thought, and what is detected here is the linguistic
 * signature that usually accompanies it.
 *
 * An idea can exhibit more than one structure and often does. Nothing forces a
 * single label, because forcing one would lose the case that matters most: an
 * idea carrying two devices well is usually the strongest thing in a shortlist.
 */

/** Blame moving off the person carrying it. */
const REVERSAL =
  /\b(?:was never|is not\b[^.]*\bit is\b|not\b[^.]*\bbut\b|did not get this wrong|stop asking|the failure|it was never|nobody's fault|not because\b[^.]*\bbut because\b)\b/i;

/** Concrete things that can carry an argument. */
const OBJECTS = [
  "receipt", "bill", "price", "tag", "label", "panel", "packet", "bottle",
  "bottles", "box", "bag", "letter", "list", "note", "menu", "photograph",
  "photo", "screen", "phone", "mirror", "window", "door", "seat", "chair",
  "table", "counter", "shelf", "aisle", "till", "queue", "wait", "swing",
  "wardrobe", "kitchen", "sign", "card", "key", "coat", "shirt", "size",
];

/** Repeated ordinary acts. */
const RITUAL =
  /\b(?:every (?:day|time|morning|night|week|year)|each (?:day|time|morning)|before (?:she|he|they|you|anyone) |after (?:she|he|they|you) |again|routine|habit|always|still|once a|twice a|on the way)\b/i;

/** Who someone is, or has stopped being. */
const IDENTITY =
  /\b(?:stop being|no longer|someone who|the kind of person|who they (?:are|have become)|version of (?:herself|himself|themselves)|being (?:seen|read) as|what it says about|stopped being)\b/i;

/** Seeing it from somewhere nobody stands. */
const PERSPECTIVE =
  /\b(?:what looks like|what people call|nobody (?:puts|says|calls|admits|thinks)|turn out to be the same|here is what|from the outside|is why we|the whole of it|what nobody)\b/i;

/** Language that only reports a device rather than performing it. */
const REPORTED = /\b(?:this (?:idea|campaign|ad) (?:is|shows|uses))\b/i;

export class PatternExtractor {
  /**
   * Every structure the idea genuinely exhibits, strongest first.
   *
   * Returns an empty array where none is present, which is a real outcome: a
   * flat declarative uses no device, and that is worth recording rather than
   * rounding up to the nearest one.
   */
  public static extract(
    idea: string,
    context: { human_truth?: string; tension?: DynamicHumanTension | null } = {}
  ): StructureDetection[] {
    const t = String(idea || "").trim();
    if (!t || REPORTED.test(t)) return [];

    const found: StructureDetection[] = [];

    // ── Emotional reversal ─────────────────────────────────────────────
    const reversal = t.match(REVERSAL);
    if (reversal) {
      // A reversal is stronger when it moves blame off a named person than when
      // it merely contains a contrast.
      const movesBlame = /\b(?:was never|did not get this wrong|stop asking|the failure)\b/i.test(t);
      found.push({
        structure: "emotional_reversal",
        strength: movesBlame ? 0.9 : 0.55,
        evidence: `turns the reading over: "${reversal[0]}"`,
      });
    }

    // ── Object carrying truth ──────────────────────────────────────────
    // The most reliably detectable of the five: a concrete noun doing subject
    // work rather than sitting in a list.
    const objects = OBJECTS.filter((o) => new RegExp(`\\b${o}s?\\b`, "i").test(t));
    if (objects.length) {
      const leads = new RegExp(`^(?:the |a |an )?${objects[0]}s?\\b`, "i").test(t);
      const truthHasIt = context.human_truth
        ? objects.some((o) => new RegExp(`\\b${o}s?\\b`, "i").test(context.human_truth!))
        : false;
      found.push({
        structure: "object_carrying_truth",
        // Strongest when the object is new to the idea and leads the sentence:
        // that is the object carrying the argument rather than decorating it.
        strength: leads && !truthHasIt ? 0.95 : truthHasIt ? 0.4 : 0.7,
        evidence: `carries it on ${objects.slice(0, 2).join(" and ")}${leads ? ", leading the sentence" : ""}`,
      });
    }

    // ── Human ritual ───────────────────────────────────────────────────
    const ritual = t.match(RITUAL);
    if (ritual) {
      const act = context.tension?.observable_behavior
        ? classify(t, context.tension.observable_behavior).relation
        : "UNRELATED";
      found.push({
        structure: "human_ritual",
        strength: act === "ENACTS" ? 0.9 : 0.6,
        evidence: `an ordinary repeated act: "${ritual[0]}"`,
      });
    }

    // ── Identity transformation ────────────────────────────────────────
    const identity = t.match(IDENTITY);
    if (identity) {
      const stake = /\b(?:stop being|no longer|stopped being|would have to)\b/i.test(t);
      found.push({
        structure: "identity_transformation",
        strength: stake ? 0.85 : 0.55,
        evidence: `who they are is the stake: "${identity[0]}"`,
      });
    }

    // ── Unexpected perspective ─────────────────────────────────────────
    // The weakest of the five. Seeing a situation from somewhere nobody stands
    // is a property of the thought; what is detected is the signature that
    // usually accompanies it.
    const perspective = t.match(PERSPECTIVE);
    if (perspective) {
      found.push({
        structure: "unexpected_perspective",
        strength: 0.6,
        evidence: `stands somewhere else: "${perspective[0]}"`,
      });
    }

    return found.sort((a, b) => b.strength - a.strength);
  }

  /** The dominant structure, or null where the idea uses no device. */
  public static dominant(
    idea: string,
    context: { human_truth?: string; tension?: DynamicHumanTension | null } = {}
  ): CreativeStructure | null {
    const found = this.extract(idea, context);
    return found.length ? found[0].structure : null;
  }

  public static aggregate(detections: StructureDetection[][]): {
    ideas: number;
    /** How many ideas used no device at all. */
    structureless: number;
    by_structure: Record<CreativeStructure, number>;
    mean_structures_per_idea: number;
    /** Structures the engine has never produced. */
    never_produced: CreativeStructure[];
  } {
    const by_structure = {} as Record<CreativeStructure, number>;
    for (const s of CREATIVE_STRUCTURES) by_structure[s] = 0;
    let total = 0;
    let structureless = 0;
    for (const d of detections) {
      if (!d.length) structureless++;
      total += d.length;
      for (const x of d) by_structure[x.structure]++;
    }
    return {
      ideas: detections.length,
      structureless,
      by_structure,
      mean_structures_per_idea: Number((total / (detections.length || 1)).toFixed(2)),
      never_produced: CREATIVE_STRUCTURES.filter((s) => by_structure[s] === 0),
    };
  }

  public static format(agg: ReturnType<typeof PatternExtractor.aggregate>): string {
    const L = [`CREATIVE STRUCTURES — ${agg.ideas} ideas · ${agg.mean_structures_per_idea} devices each`];
    for (const s of CREATIVE_STRUCTURES) {
      L.push(`  ${s.padEnd(26)} ${String(agg.by_structure[s]).padStart(4)}`);
    }
    L.push(`  using no device at all     ${String(agg.structureless).padStart(4)}`);
    if (agg.never_produced.length) {
      L.push(`  never produced             ${agg.never_produced.join(", ")}`);
    }
    L.push("");
    L.push("  note: a structure is a device a department would name, not the template that made");
    L.push("        it. object_carrying_truth is the most reliably detected; unexpected_perspective");
    L.push("        the least, because it is a property of the thought rather than of the words.");
    return L.join("\n");
  }
}
