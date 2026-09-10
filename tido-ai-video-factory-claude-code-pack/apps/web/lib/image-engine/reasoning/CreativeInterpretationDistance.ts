import { similarity } from "./OriginalityEvaluator";
import { Relation, classify } from "./semantic-relations";

/**
 * CIOS Phase 4.0.4.1 — the distance between a truth and an idea.
 *
 * The thing every layer before this got wrong
 * ------------------------------------------
 * Everything from 4.0.3 onward rewarded an idea for staying close to its human
 * truth. `strategic_fit` checked the truth was carried; the originality matrix
 * scored `relevance` as overlap with it; the taste engine noted when an idea had
 * "drifted from the truth it is meant to express". All of that pushes in one
 * direction, and the direction is wrong.
 *
 * **A great idea does not repeat the human truth. It transforms it.**
 *
 * "People give up privacy long before they will ask to keep it" is a truth. An
 * idea that says the same thing in different words has added nothing — the
 * planner already wrote it. The idea's job is to find the *thing* that carries
 * the truth: an act, an object, a confession, a place. That is a transformation,
 * and it necessarily reads as a departure from the sentence it came from.
 *
 * So distance is scored as a **band**, not a slope:
 *
 *   ECHO           too close. The idea is the truth with the words moved.
 *   LITERAL        close. It explains the truth rather than carrying it.
 *   TRANSFORMED    the target. Same subject, new proposition, new material.
 *   OBLIQUE        far. The connection is arguable but real.
 *   DISCONNECTED   too far. Whatever this is about, it is not the truth.
 *
 * Both ends are failures and they are different failures: an ECHO is a writing
 * problem, a DISCONNECTED is a thinking problem. Reporting them as one number
 * would put them on the same axis, and a single "relevance" score does exactly
 * that — which is why the middle band could never be the target before.
 *
 * The limit
 * --------
 * The band is drawn on lexical distance and a typed relation, so it can tell an
 * echo from a departure and cannot tell a good transformation from a bad one.
 * What it buys is that the system now *wants* the middle, which no earlier
 * scoring in this codebase did.
 */

export type InterpretationBand = "ECHO" | "LITERAL" | "TRANSFORMED" | "OBLIQUE" | "DISCONNECTED";

export interface InterpretationDistance {
  idea: string;
  truth: string;
  band: InterpretationBand;
  /** 0-1 lexical distance from the truth. */
  distance: number;
  /** How the idea stands to the truth. */
  relation: Relation;
  /** 0-1. Peaks in the TRANSFORMED band and falls off at both ends. */
  score: number;
  /** Material the idea introduced that the truth did not contain. */
  new_material: string[];
  reasoning: string;
  notes: string[];
}

/** Concrete things an idea can bring that a truth never does. */
const CARRIERS = [
  "aisle", "shelf", "counter", "room", "door", "house", "home", "flat", "table",
  "bill", "receipt", "phone", "screen", "photograph", "photo", "menu", "queue",
  "appointment", "morning", "night", "bottle", "bottles", "packet", "label",
  "box", "bag", "street", "shop", "face", "hands", "voice", "letter", "list",
  "seat", "mirror", "window", "kitchen", "car", "bus", "market", "sign",
  "price", "chair", "bed", "wardrobe", "till", "tag", "swing", "panel", "wait",
];

const BAND_REASONS: Record<InterpretationBand, string> = {
  ECHO: "This is the truth with the words moved. The planner already wrote it.",
  LITERAL: "This explains the truth rather than carrying it. It reads as a summary.",
  TRANSFORMED: "Same subject, new proposition, new material. This is what an idea is.",
  OBLIQUE: "The connection is arguable but real. It will need defending in the room.",
  DISCONNECTED: "Whatever this is about, it is not the truth it was built from.",
};

export class CreativeInterpretationDistance {
  public static measure(idea: string, truth: string): InterpretationDistance {
    const i = String(idea || "").trim();
    const t = String(truth || "").trim();
    const notes: string[] = [];

    if (!i || !t) {
      return {
        idea: i,
        truth: t,
        band: "DISCONNECTED",
        distance: 1,
        relation: "UNRELATED",
        score: 0,
        new_material: [],
        reasoning: t ? "No idea to measure." : "No truth to measure against.",
        notes: ["Nothing to compare."],
      };
    }

    const sim = similarity(i, t);
    const distance = Number((1 - sim).toFixed(3));
    const verdict = classify(i, t);

    // What the idea brought that the truth did not. A transformation is visible
    // here: an idea that adds a receipt, a counter, a wait to an abstract truth
    // has done the work of carrying it.
    const truthLower = t.toLowerCase();
    const new_material = CARRIERS.filter(
      (c) => new RegExp(`\\b${c}s?\\b`, "i").test(i) && !new RegExp(`\\b${c}s?\\b`, "i").test(truthLower)
    );

    const band = this.bandFor(verdict.relation, sim, new_material.length);
    if (band === "ECHO") notes.push("The idea and the truth are the same sentence.");
    if (band === "DISCONNECTED") notes.push("No shared subject between the idea and its own truth.");
    if (!new_material.length && band === "TRANSFORMED") {
      notes.push("Transformed in structure, but it brought nothing concrete to carry the truth on.");
    }

    return {
      idea: i,
      truth: t,
      band,
      distance,
      relation: verdict.relation,
      score: this.scoreFor(band, new_material.length),
      new_material,
      reasoning: BAND_REASONS[band],
      notes,
    };
  }

  /**
   * The band.
   *
   * Relation decides first and similarity refines, because the relation is the
   * more meaningful signal: an idea can share a lot of vocabulary with its truth
   * and still transform it, and the reverse.
   */
  private static bandFor(relation: Relation, sim: number, carriers: number): InterpretationBand {
    if (relation === "RESTATES" || sim >= 0.62) return "ECHO";
    if (relation === "UNRELATED" && sim < 0.08) return "DISCONNECTED";
    if (relation === "TRANSFORMS" || relation === "ENACTS") {
      // A transformation with nothing concrete in it is still only an
      // explanation of the truth.
      return carriers > 0 || sim < 0.4 ? "TRANSFORMED" : "LITERAL";
    }
    if (relation === "CONTRADICTS") return "OBLIQUE";
    if (sim >= 0.35) return "LITERAL";
    return relation === "INVOKES" ? "OBLIQUE" : "DISCONNECTED";
  }

  /**
   * Peaks in the middle.
   *
   * Both ends are failures and the curve says so. This is the one score in the
   * codebase that is not monotonic in its underlying measure, and that is the
   * whole point of the file.
   */
  private static scoreFor(band: InterpretationBand, carriers: number): number {
    const base: Record<InterpretationBand, number> = {
      ECHO: 0.15,
      LITERAL: 0.5,
      TRANSFORMED: 0.9,
      OBLIQUE: 0.55,
      DISCONNECTED: 0.05,
    };
    const bonus = band === "TRANSFORMED" ? Math.min(0.1, carriers * 0.05) : 0;
    return Number(Math.min(1, base[band] + bonus).toFixed(3));
  }

  public static aggregate(results: InterpretationDistance[]): {
    cases: number;
    mean_score: number;
    by_band: Record<InterpretationBand, number>;
    mean_distance: number;
    /** Ideas that merely restate their own truth. */
    echoes: number;
    /** Ideas in the target band. */
    transformed: number;
  } {
    const by_band = {
      ECHO: 0,
      LITERAL: 0,
      TRANSFORMED: 0,
      OBLIQUE: 0,
      DISCONNECTED: 0,
    } as Record<InterpretationBand, number>;
    for (const r of results) by_band[r.band]++;
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      cases: results.length,
      mean_score: Number(mean(results.map((r) => r.score)).toFixed(3)),
      by_band,
      mean_distance: Number(mean(results.map((r) => r.distance)).toFixed(3)),
      echoes: by_band.ECHO,
      transformed: by_band.TRANSFORMED,
    };
  }

  public static format(agg: ReturnType<typeof CreativeInterpretationDistance.aggregate>): string {
    return [
      `INTERPRETATION DISTANCE — ${agg.cases} ideas · mean ${agg.mean_score.toFixed(2)}`,
      `  echo         (the truth restated) : ${agg.by_band.ECHO}`,
      `  literal      (explains the truth) : ${agg.by_band.LITERAL}`,
      `  transformed  (carries the truth)  : ${agg.by_band.TRANSFORMED}   ← the target`,
      `  oblique      (arguable link)      : ${agg.by_band.OBLIQUE}`,
      `  disconnected (not about it)       : ${agg.by_band.DISCONNECTED}`,
      "",
      "  note: both ends are failures and they are different failures — an echo is a writing",
      "        problem, a disconnection is a thinking problem. This is the only score here that",
      "        is not monotonic in its own measure, because a great idea does not repeat the",
      "        human truth, it transforms it.",
    ].join("\n");
  }
}
