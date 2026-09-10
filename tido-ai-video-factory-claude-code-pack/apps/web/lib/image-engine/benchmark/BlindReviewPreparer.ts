import {
  BENCHMARK_DIMENSIONS,
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkDimensionId,
  BenchmarkPipeline,
  BlindReviewCase,
  BlindReviewKey,
  BlindReviewPacket,
  BlindReviewResponse,
  BlindReviewSubmission,
} from "./creative-benchmark.types";

/**
 * Builds a blind review packet.
 *
 * The packet and the key are separate objects, and the packet is the thing a
 * reviewer receives. That separation is the whole mechanism: a packet that
 * carried its own answer key would be blind only by convention, and the first
 * time someone pasted the object into a spreadsheet the blinding would be gone.
 *
 * Three leaks are guarded here, because each one has broken a real blind test:
 *
 *   1. Attribution in the payload. `BlindReviewSubmission` has no pipeline field
 *      and is built by projection, not by copying the output object — so a field
 *      added to `BenchmarkOutput` later cannot leak in by accident.
 *   2. Positional bias. Assignment is randomised per case from a seed. A fixed
 *      order means a reviewer learns the pattern by case three.
 *   3. Empty-side tells. In offline mode the legacy concept is blank, which
 *      identifies it instantly. `assertBlind` catches that and the preparer
 *      refuses to build a concept-scoring packet from concept-free data.
 */

/** Deterministic PRNG: same seed, same packet, so a review is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BlindReviewOptions {
  seed?: number;
  packetId?: string;
  /** Restrict the questions asked. Defaults to every dimension. */
  dimensions?: BenchmarkDimensionId[];
}

export class BlindReviewPreparer {
  public static prepare(
    results: BenchmarkCaseResult[],
    cases: BenchmarkCase[],
    options: BlindReviewOptions = {}
  ): { packet: BlindReviewPacket; key: BlindReviewKey } {
    const seed = options.seed ?? 20260907;
    const packetId = options.packetId || `blind_${seed}`;
    const rand = mulberry32(seed);
    const caseById = new Map(cases.map((c) => [c.case_id, c]));

    const questions = BENCHMARK_DIMENSIONS.filter(
      (d) => !options.dimensions || options.dimensions.includes(d.id)
    ).map((d) => ({ dimension: d.id, question: d.question }));

    const assignment: Record<string, BenchmarkPipeline> = {};
    const blindCases: BlindReviewCase[] = [];

    for (const result of results) {
      const source = caseById.get(result.case_id);
      if (!source) continue;

      const ciosFirst = rand() < 0.5;
      assignment[result.case_id] = ciosFirst ? "CIOS" : "LEGACY";

      const first = ciosFirst ? result.cios : result.legacy;
      const second = ciosFirst ? result.legacy : result.cios;

      const project = (o: typeof first, label: "A" | "B"): BlindReviewSubmission => ({
        label,
        // Explicit projection. Copying the output object would carry `pipeline`
        // and `source` straight into the reviewer's hands.
        concept: {
          big_idea: o.concept.big_idea,
          core_message: o.concept.core_message,
          consumer_insight: o.concept.consumer_insight,
          differentiation: o.concept.differentiation,
        },
        direction: {
          camera: o.direction.camera,
          lighting: o.direction.lighting,
          composition: o.direction.composition,
          colour: o.direction.colour,
          atmosphere: o.direction.atmosphere,
          typography: o.direction.typography,
          material: o.direction.material,
        },
      });

      blindCases.push({
        case_id: result.case_id,
        industry: result.industry,
        creative_challenge: source.creative_challenge,
        brief_summary: {
          brand: source.brief.brand,
          product: source.brief.product,
          audience: source.brief.audience || "",
          objective: source.brief.objective || "",
          channel: source.brief.channel || "",
          tone: source.brief.tone || "",
        },
        must_address: source.criteria.must_address,
        submissions: [project(first, "A"), project(second, "B")],
        questions,
      });
    }

    const packet: BlindReviewPacket = {
      packet_id: packetId,
      seed,
      cases: blindCases,
      instructions: [
        "Score each submission from 0 to 10 on every question listed.",
        "Judge against the creative challenge and the must-address list, not against a general quality bar.",
        "Submission order is randomised per case. A and B are not the same system throughout.",
        "An empty field is a result, not an omission: score it as the absence it is.",
        "Score both submissions on a question before moving to the next question.",
      ],
    };

    return { packet, key: { packet_id: packetId, seed, assignment } };
  }

  /**
   * Fails loudly on anything that would identify a pipeline to the reviewer.
   *
   * Run before a packet is handed over. The serialised check is deliberately
   * crude and total: it searches the whole payload for the words that would give
   * the game away, rather than trusting that every future field was projected
   * carefully.
   */
  public static assertBlind(packet: BlindReviewPacket): string[] {
    const problems: string[] = [];
    const serialised = JSON.stringify(packet).toLowerCase();
    // Attribution terms only, matched as whole words. An earlier version of this
    // list included "shadow" and "pipeline", which are ordinary craft vocabulary
    // — "soft gradient shadows" in a lighting instruction tripped it, so the
    // guard would have failed every real packet and been switched off. A check
    // that cries wolf is a check nobody runs.
    const tells = ["cios", "legacy", "marketingbrain", "creativeknowledgeservice", "shadowservice"];
    for (const tell of tells) {
      if (new RegExp(`\\b${tell}\\b`).test(serialised)) {
        problems.push(`Packet payload contains the attribution term "${tell}".`);
      }
    }

    for (const c of packet.cases) {
      const [a, b] = c.submissions;
      const filled = (s: BlindReviewSubmission) =>
        Object.values(s.concept).filter(Boolean).length + Object.values(s.direction).filter(Boolean).length;
      const fa = filled(a);
      const fb = filled(b);
      // One side systematically emptier is a tell that survives any wording
      // check: a reviewer learns "the blank one is always the same system" in
      // two cases and the packet stops being blind.
      if (fa === 0 || fb === 0) {
        problems.push(`${c.case_id}: one submission is entirely empty, which identifies it.`);
      }
      const conceptA = Object.values(a.concept).filter(Boolean).length;
      const conceptB = Object.values(b.concept).filter(Boolean).length;
      if ((conceptA === 0) !== (conceptB === 0)) {
        problems.push(
          `${c.case_id}: exactly one submission has a concept, which identifies it. ` +
            "Run the benchmark in live mode, or restrict the packet to direction dimensions."
        );
      }
    }
    return problems;
  }

  /** Re-attributes a reviewer's answers using the key. */
  public static attribute(
    response: BlindReviewResponse,
    key: BlindReviewKey
  ): { case_id: string; pipeline: BenchmarkPipeline; dimension: BenchmarkDimensionId; score: number; comment?: string }[] {
    if (response.packet_id !== key.packet_id) {
      throw new Error(`Response packet ${response.packet_id} does not match key ${key.packet_id}.`);
    }
    return response.scores.map((s) => {
      const aIs = key.assignment[s.case_id];
      if (!aIs) throw new Error(`No assignment recorded for case ${s.case_id}.`);
      const other: BenchmarkPipeline = aIs === "CIOS" ? "LEGACY" : "CIOS";
      return {
        case_id: s.case_id,
        pipeline: s.label === "A" ? aIs : other,
        dimension: s.dimension,
        score: s.score,
        comment: s.comment,
      };
    });
  }
}
