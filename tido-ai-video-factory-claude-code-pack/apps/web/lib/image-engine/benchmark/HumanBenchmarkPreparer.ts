import { concreteness } from "./CreativeBenchmarkScorer";
import { BenchmarkCase, BenchmarkCaseResult, BenchmarkOutput, BenchmarkPipeline } from "./creative-benchmark.types";
import {
  BlindnessAudit,
  BlindnessFinding,
  HUMAN_CRITERIA,
  HumanBenchmarkKey,
  HumanBenchmarkPacket,
  HumanReviewCase,
  HumanSubmission,
} from "./human-benchmark.types";

/**
 * Builds a blind human review packet, and proves it is blind before it ships.
 *
 * The packet and the key are separate returns. That is the mechanism, not a
 * convention: a packet carrying its own answer key is blind until the first
 * person scrolls.
 *
 * The audit is the part that earns its keep. A blind test fails silently — the
 * responses still arrive, still average, still look like a result — so the
 * failure has to be caught before a reviewer spends an hour on an invalid test.
 */

/** Deterministic PRNG so a packet is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_INSTRUCTIONS = [
  "You are reviewing two creative responses to the same brief. They came from two different systems.",
  "Score each submission 0 to 10 on every criterion, using the anchors given. Score both submissions on one criterion before moving to the next.",
  "Judge against the brief's creative challenge and its must-address list, not against a general quality bar.",
  "An empty field is a result, not an oversight. Score it as the absence it is.",
  "Submission order is randomised per case. A and B are not the same system throughout, and there is no pattern to find.",
  "Finish with an overall preference: which one would you take into a client meeting?",
  "If you form a theory about which system is which, write it in the comment box rather than letting it steer the scores.",
];

export interface HumanPacketOptions {
  seed?: number;
  packetId?: string;
  minReviewers?: number;
  /** Limit the packet to a subset of cases, for a shorter first pass. */
  caseIds?: string[];
}

export class HumanBenchmarkPreparer {
  public static prepare(
    results: BenchmarkCaseResult[],
    cases: BenchmarkCase[],
    options: HumanPacketOptions = {}
  ): { packet: HumanBenchmarkPacket; key: HumanBenchmarkKey; audit: BlindnessAudit } {
    const seed = options.seed ?? 20260908;
    const packetId = options.packetId || `human_${seed}`;
    const rand = mulberry32(seed);
    const caseById = new Map(cases.map((c) => [c.case_id, c]));

    const selected = options.caseIds
      ? results.filter((r) => options.caseIds!.includes(r.case_id))
      : results;

    const assignment: Record<string, BenchmarkPipeline> = {};
    const reviewCases: HumanReviewCase[] = [];

    for (const result of selected) {
      const source = caseById.get(result.case_id);
      if (!source) continue;

      const ciosFirst = rand() < 0.5;
      assignment[result.case_id] = ciosFirst ? "CIOS" : "LEGACY";

      const first = ciosFirst ? result.cios : result.legacy;
      const second = ciosFirst ? result.legacy : result.cios;

      reviewCases.push({
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
        submissions: [this.project(first, "A"), this.project(second, "B")],
      });
    }

    const packet: HumanBenchmarkPacket = {
      packet_id: packetId,
      seed,
      created_at: new Date().toISOString(),
      criteria: HUMAN_CRITERIA,
      cases: reviewCases,
      instructions: DEFAULT_INSTRUCTIONS,
      // Three is the floor at which pairwise agreement means anything at all.
      // With one reviewer there is no agreement to measure and no way to tell a
      // preference from a temperament.
      min_reviewers: options.minReviewers ?? 3,
    };

    return { packet, key: { packet_id: packetId, seed, assignment }, audit: this.audit(packet, assignment) };
  }

  /**
   * Copies exactly the fields a reviewer should see.
   *
   * Explicit projection rather than a spread: `BenchmarkOutput` carries
   * `pipeline`, `source`, `knowledge_used` and `legacy_backend`, and every one of
   * them identifies its side instantly. A spread would carry a future field in
   * by accident, which is how blinding erodes.
   */
  private static project(o: BenchmarkOutput, label: "A" | "B"): HumanSubmission {
    return {
      label,
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
    };
  }

  /**
   * Proves the packet is blind, or says exactly how it is not.
   *
   * Four checks, each of which has a real failure behind it. The first two are
   * obvious; the last two are the ones that actually fired when this was first
   * run against V2.5 data, and neither would have been caught by redaction.
   */
  public static audit(packet: HumanBenchmarkPacket, assignment: Record<string, BenchmarkPipeline>): BlindnessAudit {
    const findings: BlindnessFinding[] = [];

    // ── 1. Attribution in the payload ──────────────────────────────────
    const serialised = JSON.stringify(packet).toLowerCase();
    const tells = ["cios", "marketingbrain", "creativeknowledgeservice", "shadowservice", "legacycreativeprovider"];
    const leaked = tells.filter((t) => new RegExp(`\\b${t}\\b`).test(serialised));
    // "legacy" is checked separately: it is a real English word a brief could
    // legitimately use ("a legacy brand"), so it is matched only in the shapes
    // that would be attribution.
    if (/\blegacy (pipeline|backend|provider|output|side)\b/.test(serialised)) leaked.push("legacy");
    if (/knowledge_id|knowledge_used|typography\.[a-z_]+\./.test(serialised)) leaked.push("knowledge ids");
    if (leaked.length) {
      findings.push({
        kind: "ATTRIBUTION_LEAK",
        severity: "BLOCKING",
        summary: `The payload names its own sources: ${leaked.join(", ")}.`,
        evidence: leaked,
        affected_cases: [],
      });
    }

    // ── 2. Coverage tell ───────────────────────────────────────────────
    const coverageCases: string[] = [];
    for (const c of packet.cases) {
      const filled = (s: HumanSubmission) =>
        Object.values(s.concept).filter((v) => String(v).trim()).length +
        Object.values(s.direction).filter((v) => String(v).trim()).length;
      const a = filled(c.submissions[0]);
      const b = filled(c.submissions[1]);
      if (a === 0 || b === 0 || Math.abs(a - b) >= 6) coverageCases.push(c.case_id);
    }
    if (coverageCases.length >= Math.max(2, packet.cases.length * 0.3)) {
      findings.push({
        kind: "COVERAGE_TELL",
        severity: "BLOCKING",
        summary:
          `One submission is systematically emptier than the other on ${coverageCases.length} of ${packet.cases.length} cases. ` +
          "A reviewer learns which side is which by counting blanks.",
        evidence: [],
        affected_cases: coverageCases.slice(0, 8),
      });
    }

    // ── 2b. Per-field absence tell ─────────────────────────────────────
    //
    // The coarse coverage check above compares how many fields each side filled
    // in total. That misses the sharpest tell there is: one side leaving the
    // SAME field blank case after case. A reviewer does not count fields, they
    // notice that "big idea" reads "(not provided)" on submission B every time.
    const fieldNames = [
      ...Object.keys(packet.cases[0]?.submissions[0].concept ?? {}).map((k) => `concept.${k}`),
      ...Object.keys(packet.cases[0]?.submissions[0].direction ?? {}).map((k) => `direction.${k}`),
    ];
    for (const field of fieldNames) {
      const [group, key] = field.split(".") as ["concept" | "direction", string];
      let asymmetric = 0;
      const affected: string[] = [];
      for (const c of packet.cases) {
        const aIs = assignment[c.case_id];
        if (!aIs) continue;
        const a = String((c.submissions[0][group] as Record<string, string>)[key] ?? "").trim();
        const b = String((c.submissions[1][group] as Record<string, string>)[key] ?? "").trim();
        if (Boolean(a) !== Boolean(b)) {
          asymmetric++;
          affected.push(c.case_id);
        }
      }
      const share = packet.cases.length ? asymmetric / packet.cases.length : 0;
      if (share >= 0.6) {
        findings.push({
          kind: "FIELD_ABSENCE_TELL",
          severity: "BLOCKING",
          summary:
            `"${field}" is present on one side and absent on the other in ${asymmetric} of ${packet.cases.length} cases ` +
            `(${Math.round(share * 100)}%). The same box reads empty on the same side case after case, which identifies it.`,
          evidence: [],
          affected_cases: affected.slice(0, 8),
        });
      }
    }

    // ── 3. Register tell ───────────────────────────────────────────────
    //
    // The one that matters most here. If one side writes its big idea as a
    // production instruction ("the subject within the upper 65 percent") and the
    // other writes prose ("the step you skip that costs the most"), redaction is
    // irrelevant — a creative reviewer separates them in two cases. Measured with
    // `concreteness`, which was built to detect exactly this property in art
    // direction and detects it just as well where it does not belong.
    const registerBySide = { A: [] as number[], B: [] as number[] };
    for (const c of packet.cases) {
      for (const s of c.submissions) {
        registerBySide[s.label].push(concreteness(s.concept.big_idea));
      }
    }
    const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    // Compared per pipeline, not per label — labels alternate, so a per-label
    // mean would average the tell away and report a clean packet.
    const byPipeline: Record<string, number[]> = { CIOS: [], LEGACY: [] };
    for (const c of packet.cases) {
      const aIs = assignment[c.case_id];
      if (!aIs) continue;
      const other: BenchmarkPipeline = aIs === "CIOS" ? "LEGACY" : "CIOS";
      byPipeline[aIs].push(concreteness(c.submissions[0].concept.big_idea));
      byPipeline[other].push(concreteness(c.submissions[1].concept.big_idea));
    }
    const ciosRegister = meanOf(byPipeline.CIOS);
    const legacyRegister = meanOf(byPipeline.LEGACY);
    if (Math.abs(ciosRegister - legacyRegister) >= 3) {
      const technical = ciosRegister > legacyRegister ? "the first" : "the second";
      findings.push({
        kind: "REGISTER_TELL",
        severity: "BLOCKING",
        summary:
          `The two sides write their big idea in different registers: mean concreteness ` +
          `${ciosRegister.toFixed(1)} against ${legacyRegister.toFixed(1)} out of 10. ` +
          `${technical} system states production instructions where the other states ideas, so a reviewer can separate them without any label.`,
        evidence: [
          `higher-concreteness side sample: "${(byPipeline.CIOS.length && ciosRegister > legacyRegister
            ? packet.cases.find((c) => assignment[c.case_id] === "CIOS")?.submissions[0].concept.big_idea
            : packet.cases.find((c) => assignment[c.case_id] === "LEGACY")?.submissions[0].concept.big_idea) || ""}"`,
        ],
        affected_cases: packet.cases.map((c) => c.case_id).slice(0, 5),
      });
    }

    // ── 4. Repetition tell ─────────────────────────────────────────────
    for (const pipeline of ["CIOS", "LEGACY"] as BenchmarkPipeline[]) {
      const ideas: string[] = [];
      for (const c of packet.cases) {
        const aIs = assignment[c.case_id];
        if (!aIs) continue;
        const sub = aIs === pipeline ? c.submissions[0] : c.submissions[1];
        if (sub.concept.big_idea.trim()) ideas.push(sub.concept.big_idea.trim());
      }
      if (ideas.length < 3) continue;
      const distinct = new Set(ideas).size;
      const repetition = 1 - distinct / ideas.length;
      if (repetition >= 0.4) {
        findings.push({
          kind: "REPETITION_TELL",
          severity: "WARNING",
          summary:
            `One system reuses its big idea across unrelated briefs: ${distinct} distinct ideas across ${ideas.length} cases. ` +
            "Sameness is itself recognisable, and it is a finding about the work as well as about the packet.",
          evidence: [...new Set(ideas)].slice(0, 3),
          affected_cases: [],
        });
      }
    }

    return { blind: !findings.some((f) => f.severity === "BLOCKING"), findings };
  }

  /** One-screen summary of an audit. */
  public static formatAudit(audit: BlindnessAudit): string {
    if (audit.blind && !audit.findings.length) return "Blindness audit: clean — the packet can be sent.";
    const lines = [audit.blind ? "Blindness audit: usable, with warnings" : "Blindness audit: NOT BLIND — do not send"];
    for (const f of audit.findings) {
      lines.push(`  [${f.severity}] ${f.kind}`);
      lines.push(`      ${f.summary}`);
      for (const e of f.evidence.slice(0, 2)) if (e) lines.push(`      e.g. ${e.slice(0, 110)}`);
    }
    return lines.join("\n");
  }
}
