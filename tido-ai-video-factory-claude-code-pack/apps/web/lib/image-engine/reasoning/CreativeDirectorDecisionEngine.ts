import { CreativeInterpretationDistance, InterpretationDistance } from "./CreativeInterpretationDistance";
import { CreativeTerritory, RankedIdea } from "./creative-taste.types";

/**
 * CIOS Phase 4.0.4.1 — the decision, not another score.
 *
 * Why this exists
 * --------------
 * Every layer in 4.0.4 produced a number, and a director does not produce
 * numbers. They say make it, fix this one thing, or no. The whole apparatus
 * behind that — territory, ownership, originality, memorability, scalability —
 * exists to support one of three sentences, and until this file nothing in the
 * system ever said one.
 *
 * The three
 * --------
 *   PURSUE  Nothing is blocking it and the ground under it is sound.
 *   MODIFY  One thing is wrong and it is the kind of thing a rewrite fixes.
 *   REJECT  Either several things are wrong, or one thing that a rewrite cannot
 *           fix — an idea the brand has no standing to say, or one that is not
 *           about the truth it came from.
 *
 * The distinction between MODIFY and REJECT is the useful one, and it is not
 * about how many points an idea scored. It is about *what kind* of failure it
 * has. An echo of the human truth is a writing problem: the thinking is right and
 * the sentence is lazy, so it is a MODIFY with a specific instruction. An idea
 * disconnected from its truth is a thinking problem, and no rewrite reaches it.
 *
 * On the reasoning
 * ---------------
 * Every decision carries the chain that produced it, in the order the pipeline
 * ran. That is the point of the phase: a director who disagrees can see which
 * stage they disagree with, and a decision nobody can argue with is a decision
 * nobody can use.
 */

export type Decision = "PURSUE" | "MODIFY" | "REJECT";

export interface DecisionStage {
  stage: string;
  /** What that stage found, in a sentence. */
  finding: string;
  /** Whether it blocks, worries, or supports. */
  verdict: "BLOCKS" | "WEAKENS" | "SUPPORTS";
}

export interface DirectorDecision {
  case_id: string;
  idea: string;
  territory: string;
  decision: Decision;
  /** The chain, in pipeline order. */
  chain: DecisionStage[];
  /** What a director would say. One sentence. */
  verdict_line: string;
  /** For MODIFY: the single change that would move it to PURSUE. */
  instruction?: string;
  /** For REJECT: why a rewrite cannot reach it. */
  unfixable?: string;
  interpretation: InterpretationDistance;
}

export class CreativeDirectorDecisionEngine {
  /**
   * Runs the chain and decides.
   *
   * Nothing is recomputed here. Every finding is read off a stage that already
   * ran, which is what makes the chain auditable — a stage that disagreed with
   * the decision would be visible in it.
   */
  public static decide(
    ranked: RankedIdea,
    context: {
      case_id: string;
      human_truth?: string;
      territory?: CreativeTerritory | null;
    }
  ): DirectorDecision {
    const chain: DecisionStage[] = [];
    const idea = ranked.idea;
    const interpretation = CreativeInterpretationDistance.measure(idea, context.human_truth || "");

    // ── Truth → territory ──────────────────────────────────────────────
    chain.push(
      context.territory
        ? {
            stage: "territory",
            finding: `Ground: ${context.territory.name}. ${context.territory.central_tension}`,
            verdict: "SUPPORTS",
          }
        : { stage: "territory", finding: "No territory was built; there is no ground under this.", verdict: "BLOCKS" }
    );

    // ── Interpretation distance ────────────────────────────────────────
    chain.push({
      stage: "interpretation",
      finding: `${interpretation.band}: ${interpretation.reasoning}`,
      verdict:
        interpretation.band === "TRANSFORMED"
          ? "SUPPORTS"
          : interpretation.band === "DISCONNECTED"
            ? "BLOCKS"
            : "WEAKENS",
    });

    // ── Brand ownership ────────────────────────────────────────────────
    const ownership = ranked.ownership;
    chain.push({
      stage: "ownership",
      finding: ownership
        ? ownership.breaches_permission
          ? `Breaches category permission: ${ownership.breach}.`
          : ownership.confidence < 0.5
            ? `Unestablished — ${ownership.reasoning[0] || "no DNA to judge against"}. Confidence ${ownership.confidence.toFixed(2)}.`
            : ownership.reasoning[0] || "No ownership evidence."
        : "Not evaluated.",
      verdict: ownership?.breaches_permission
        ? "BLOCKS"
        : (ownership?.ownership ?? 0) >= 0.45
          ? "SUPPORTS"
          : "WEAKENS",
    });

    // ── Originality ────────────────────────────────────────────────────
    const originality = ranked.originality;
    chain.push({
      stage: "originality",
      finding: originality ? `${originality.originality_type}: ${originality.reasoning}` : "Not evaluated.",
      verdict:
        originality?.originality_type === "BREAKTHROUGH"
          ? "SUPPORTS"
          : originality?.originality_type === "MISFIT"
            ? "BLOCKS"
            : originality?.originality_type === "CONVENTIONAL"
              ? "SUPPORTS"
              : "WEAKENS",
    });

    // ── Memorability ───────────────────────────────────────────────────
    const memory = ranked.memory;
    chain.push({
      stage: "memorability",
      finding: memory
        ? `${memory.total.toFixed(0)}/100. Weakest route: ${memory.weakest} — ${memory.evidence[memory.weakest]}.`
        : "Not evaluated.",
      verdict: (memory?.total ?? 0) >= 45 ? "SUPPORTS" : "WEAKENS",
    });

    // ── Scalability ────────────────────────────────────────────────────
    const scalability = ranked.scalability;
    chain.push({
      stage: "scalability",
      finding: scalability
        ? `${scalability.channels} of 6 channels. ${scalability.scalable ? "Scalable." : "A single execution."}`
        : "Not evaluated.",
      verdict: scalability?.scalable ? "SUPPORTS" : "WEAKENS",
    });

    // ── The decision ───────────────────────────────────────────────────
    const blocks = chain.filter((c) => c.verdict === "BLOCKS");
    const weakens = chain.filter((c) => c.verdict === "WEAKENS");

    // A block is unfixable by rewriting. Two or more weaknesses means the idea
    // is being asked to change in more ways than a rewrite is.
    let decision: Decision;
    let instruction: string | undefined;
    let unfixable: string | undefined;

    if (blocks.length) {
      decision = "REJECT";
      unfixable = this.unfixableReason(blocks[0], interpretation, ownership?.breach);
    } else if (weakens.length >= 3) {
      decision = "REJECT";
      unfixable = `Weak on ${weakens.map((w) => w.stage).join(", ")}. That is not one rewrite, it is a different idea.`;
    } else if (weakens.length) {
      decision = "MODIFY";
      instruction = this.instructionFor(weakens[0], interpretation, memory?.weakest, scalability);
    } else {
      decision = "PURSUE";
    }

    return {
      case_id: context.case_id,
      idea,
      territory: ranked.territory,
      decision,
      chain,
      verdict_line: this.verdictLine(decision, weakens, blocks, interpretation),
      instruction,
      unfixable,
      interpretation,
    };
  }

  /**
   * The instruction, and why it is one sentence.
   *
   * A MODIFY with a list is a REJECT wearing a kinder word. The single change
   * named here is the one that would move the idea to PURSUE, drawn from the
   * stage that weakened it rather than from a general sense that it could be
   * better.
   */
  private static instructionFor(
    weak: DecisionStage,
    interpretation: InterpretationDistance,
    memoryWeakest?: string,
    scalability?: RankedIdea["scalability"]
  ): string {
    switch (weak.stage) {
      case "interpretation":
        return interpretation.band === "ECHO"
          ? "Stop restating the truth. Find the object or the act that carries it and write that instead."
          : "Bring it closer to the truth it came from; the link is currently something you would have to argue for.";
      case "ownership":
        return "Rest it on something this brand has actually done. As written, a competitor inherits it.";
      case "originality":
        return "It is right and it is not yours. Find the version of it the category has not already said.";
      case "memorability":
        return memoryWeakest === "mental_image"
          ? "Give it something to see. There is nothing in it a person could picture."
          : memoryWeakest === "emotional_hook"
            ? "Name the feeling. As written it describes a situation and attaches to nothing."
            : "It will not survive being repeated. Shorten it to the one line someone would say.";
      case "scalability": {
        const missing = scalability?.verdicts.filter((v) => !v.works).map((v) => v.channel) || [];
        return missing.length
          ? `It does not reach ${missing.slice(0, 2).join(" or ")}. Give it ${
              missing.includes("film") ? "a before and an after" : "something a person can do"
            }.`
          : "Make it work in more than one place.";
      }
      default:
        return "One thing is not right yet.";
    }
  }

  private static unfixableReason(
    block: DecisionStage,
    interpretation: InterpretationDistance,
    breach?: string
  ): string {
    switch (block.stage) {
      case "territory":
        return "There is no territory under this. The insight did not hold a contradiction, so there is nothing to build on.";
      case "interpretation":
        return "It is not about the truth it came from. That is a thinking problem and no rewrite reaches it.";
      case "ownership":
        return breach
          ? `The category does not permit this claim: "${breach}". It cannot run, however well it is written.`
          : "This brand has no standing to say it.";
      case "originality":
        return "Whatever else it is, this brand cannot credibly be the one saying it.";
      default:
        return "Blocked at a stage a rewrite does not reach.";
    }
  }

  private static verdictLine(
    decision: Decision,
    weakens: DecisionStage[],
    blocks: DecisionStage[],
    interpretation: InterpretationDistance
  ): string {
    if (decision === "PURSUE") {
      return interpretation.band === "TRANSFORMED"
        ? "This carries the truth instead of repeating it. Make it."
        : "Nothing is blocking this. Make it.";
    }
    if (decision === "MODIFY") return `Close. One thing: the ${weakens[0].stage}.`;
    if (blocks.length) return `No — ${blocks[0].stage}.`;
    return "No. This needs to be a different idea, not a better sentence.";
  }

  public static aggregate(decisions: DirectorDecision[]): {
    cases: number;
    pursue: number;
    modify: number;
    reject: number;
    /** Where decisions were blocked or weakened, most common first. */
    by_stage: { stage: string; blocks: number; weakens: number }[];
    /** Ideas that merely restate their own truth. */
    echoes: number;
  } {
    const stages = new Map<string, { blocks: number; weakens: number }>();
    for (const d of decisions) {
      for (const c of d.chain) {
        if (c.verdict === "SUPPORTS") continue;
        const s = stages.get(c.stage) || { blocks: 0, weakens: 0 };
        if (c.verdict === "BLOCKS") s.blocks++;
        else s.weakens++;
        stages.set(c.stage, s);
      }
    }
    return {
      cases: decisions.length,
      pursue: decisions.filter((d) => d.decision === "PURSUE").length,
      modify: decisions.filter((d) => d.decision === "MODIFY").length,
      reject: decisions.filter((d) => d.decision === "REJECT").length,
      by_stage: [...stages.entries()]
        .map(([stage, v]) => ({ stage, ...v }))
        .sort((a, b) => b.blocks + b.weakens - (a.blocks + a.weakens)),
      echoes: decisions.filter((d) => d.interpretation.band === "ECHO").length,
    };
  }

  public static format(agg: ReturnType<typeof CreativeDirectorDecisionEngine.aggregate>): string {
    const L = [
      `DIRECTOR'S DECISION — ${agg.cases} ideas`,
      `  pursue : ${agg.pursue}`,
      `  modify : ${agg.modify}`,
      `  reject : ${agg.reject}`,
      "  where they fall down:",
    ];
    for (const s of agg.by_stage) {
      L.push(`    ${s.stage.padEnd(16)} blocks ${String(s.blocks).padStart(3)} · weakens ${String(s.weakens).padStart(3)}`);
    }
    L.push("");
    L.push("  note: MODIFY and REJECT differ by the *kind* of failure, not the score. An echo of");
    L.push("        the truth is a writing problem and gets an instruction; an idea disconnected");
    L.push("        from its truth is a thinking problem and no rewrite reaches it.");
    return L.join("\n");
  }
}
