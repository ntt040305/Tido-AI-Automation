import type {
  Phase0ArmScore,
  Phase0DimensionId,
  Phase0DimensionScore,
  Phase0Record,
  Phase0Scenario,
} from "./phase0-benchmark.types";
import { PHASE0_DIMENSIONS } from "./phase0-benchmark.types";

/**
 * Phase 0.4 stage 1 — scoring what a prompt can honestly be said to carry.
 *
 * Every score in this file is built by adding up named boolean signals, and each
 * signal is reported as evidence. That is deliberate and it is the whole design:
 * a reviewer who disagrees with a number can see which signal produced it and
 * argue with that instead of with the number. A scorer that returned 7.4 with no
 * decomposition would be asking to be trusted, and nothing in this project's
 * history has earned that.
 *
 * What these numbers are NOT
 * --------------------------
 * They are transmission scores. A 10 on `creative_concept_strength` means the
 * prompt carries a named direction with both halves of its picture and a reason.
 * It does not mean the idea is good, and it does not mean the render will show
 * it. Those are stage 2, and `ai_artifact_level` is left `null` here precisely so
 * that no reader can add these up and believe they have a picture quality score.
 */

const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());

/** Signals are equal-weighted. Unequal weights would need a justification nobody has. */
function fromSignals(
  signals: { label: string; ok: boolean }[]
): { score: number; evidence: string[] } {
  const hits = signals.filter((s) => s.ok).length;
  // 1-10, floor 1. A prompt that carries nothing still scores 1, not 0, because
  // the scale the report promises is 1-10 and a 0 would imply a measurement the
  // scale does not define.
  const score = signals.length === 0 ? 1 : Math.max(1, Math.round((hits / signals.length) * 9) + 1);
  return {
    score,
    evidence: signals.map((s) => `${s.ok ? "[x]" : "[ ]"} ${s.label}`),
  };
}

// ── the seven ─────────────────────────────────────────────────────────────

function productIdentity(p: string, s: Phase0Scenario): Omit<Phase0DimensionScore, "dimension" | "prompt_method"> {
  const anchorsNamed = s.products.identityAnchors.filter((a) => has(p, a.split(" ")[0])).length;
  const signals = [
    { label: "an explicit do-not-restyle instruction is present", ok: /do not restyle|do not recolour|do not redesign|renders unchanged/i.test(p) },
    { label: "inventing an unattached product is forbidden", ok: /do not invent a product|not attached/i.test(p) },
    { label: `at least one identity anchor is named (${anchorsNamed}/${s.products.identityAnchors.length})`, ok: anchorsNamed > 0 },
    { label: "the expected product count is stated somewhere in the prompt", ok: new RegExp(`\\b(${s.products.count}|${numberWord(s.products.count)})\\b`, "i").test(p) },
    { label: "no transmitted creative line licenses altering the product", ok: !/restyle the (product|bottle)|reimagine the label|redesign the pack/i.test(p) },
  ];
  if (s.products.count > 1) {
    signals.push({ label: "cloning or averaging the products is forbidden", ok: /do not clone|do not average/i.test(p) });
  }
  const { score, evidence } = fromSignals(signals);
  return {
    score,
    finding: "Counts identity-lock instructions in the prompt. Presence of the lock is not preservation of the identity — only the render shows that.",
    evidence,
  };
}

/**
 * Scored across BOTH carriers, because the two modes use different ones.
 *
 * Uncontrolled mode appends a `## CREATIVE DIRECTION` block. Control mode
 * rewrites the brief, so the same information arrives as `SCENE:` / `CAMERA:` /
 * `Render it as:` lines inside CREATIVE INTENT and USER HARD REQUIREMENTS. A
 * scorer that knew only the first would report every controlled render as a
 * total transmission failure — which is exactly what the first run of this
 * benchmark did before this function was written to accept either.
 *
 * Each signal is a QUESTION about the decision, answered by whichever carrier
 * the mode uses. That is what makes the two modes comparable at all.
 */
function conceptStrength(p: string): Omit<Phase0DimensionScore, "dimension" | "prompt_method"> {
  const appearanceLines = (p.match(/HOW IT SHOULD APPEAR:/g) || []).length;
  const signals = [
    {
      // Three carriers, because the three paths name the decision differently:
      // the appended block (uncontrolled), the route line (control + strategy)
      // and the direction line (control + exploration). A detector that knew
      // only two of the three reported a named exploration run as unnamed.
      label: "the chosen direction or route is named in the prompt",
      ok:
        /CHOSEN DIRECTION: \S/.test(p) ||
        /This image answers the brief as: \S/.test(p) ||
        /The creative direction chosen for this image: \S/.test(p),
    },
    {
      label: "what happens in the frame is stated",
      ok: appearanceLines >= 1 || /\nSCENE: \S/.test(p),
    },
    {
      label: "HOW IT IS RENDERED is stated (the Phase 0.2 half)",
      ok: appearanceLines >= 2 || /Render it as: \S/.test(p),
    },
    {
      label: "a reason for the choice travelled with it",
      ok:
        /WHY THIS DIRECTION: \S/.test(p) ||
        /Why that route here: \S/.test(p) ||
        /Why this direction here: \S/.test(p),
    },
    {
      label: "the camera and lighting decisions reached the prompt",
      ok: (/\nCAMERA: \S/.test(p) || /CAMERA:/.test(p)) && /LIGHTING:/.test(p),
    },
    {
      label: "the tradeoff or the rejected alternative is available to the renderer",
      ok:
        /WHY OTHER DIRECTIONS WERE NOT USED: \S/.test(p) ||
        has(p, "## WHY THIS IS NOT THE CATEGORY DEFAULT"),
    },
  ];
  const { score, evidence } = fromSignals(signals);
  return {
    score,
    finding:
      "Checks the decision reached the prompt by whichever carrier the mode uses, carrying both halves of the picture. This is exactly what Phases 0.1 and 0.2 repaired, so it is the strongest proxy in the set — and it still measures transmission, not quality.",
    evidence,
  };
}

function composition(p: string): Omit<Phase0DimensionScore, "dimension" | "prompt_method"> {
  const signals = [
    { label: "a COMMERCIAL LAYOUT section is present", ok: has(p, "## COMMERCIAL LAYOUT") },
    { label: "a focal element or reading order is named", ok: /focal|reading order|leads|eye/i.test(p) },
    { label: "a concrete placement is stated (a third, left, right, below, above)", ok: /(one[- ]third|left of centre|right half|below the midline|bottom \d+%|top \d+%)/i.test(p) },
    { label: "a transmitted composition decision is present", ok: /## VISUAL DECISIONS|composition/i.test(p) },
    { label: "the placement language is not self-contradictory", ok: !(/centred/i.test(p) && /left of centre/i.test(p)) },
  ];
  const { score, evidence } = fromSignals(signals);
  return {
    score,
    finding: "Checks a concrete, executable composition instruction is present and not self-contradictory. A prompt can carry a good instruction and still render badly.",
    evidence,
  };
}

function commercialUsability(p: string, s: Phase0Scenario): Omit<Phase0DimensionScore, "dimension" | "prompt_method"> {
  const declared = s.constraints.reservedZones.filter((z) => {
    const pct = z.match(/(\d+)\s*%/);
    return pct ? p.includes(`${pct[1]}%`) : true;
  }).length;
  const signals = [
    { label: `reserved zones are declared in the prompt (${declared}/${s.constraints.reservedZones.length})`, ok: declared >= s.constraints.reservedZones.length },
    { label: "the reserved area is told to stay clean or clear", ok: /keep it clean|keep it clear|stay clean|must stay clean|uncluttered|quiet enough/i.test(p) },
    { label: "composited copy is distinguished from drawn copy", ok: /composited later|composited/i.test(p) },
    { label: "no transmitted line asks to fill the reserved area", ok: !/fill the frame|edge to edge|every corner/i.test(p) },
  ];
  const { score, evidence } = fromSignals(signals);
  return {
    score,
    finding: "Checks reserved zones and compositing areas are declared and not contradicted by the transmitted direction.",
    evidence,
  };
}

function typographyReadiness(p: string, s: Phase0Scenario): Omit<Phase0DimensionScore, "dimension" | "prompt_method"> {
  // The one AUTOMATED dimension: both halves are literal properties of the text.
  const needsArea = s.constraints.copyItems.length > 0;
  const signals = [
    { label: "model-drawn text, wordmarks, prices and badges are forbidden", ok: /do not draw any text|not draw.*text|no drawn type/i.test(p) },
    { label: "a TYPOGRAPHY section is present", ok: has(p, "## TYPOGRAPHY") },
    {
      label: needsArea
        ? "a text-safe area is declared for the composited copy"
        : "no copy is composited, so no area is required (vacuously satisfied)",
      ok: needsArea ? /reserved for|text-safe|quiet enough|clean for/i.test(p) : true,
    },
    { label: "the drawn-text prohibition survived into the final prompt", ok: !/render the headline|draw the price|add the logo/i.test(p) },
  ];
  const { score, evidence } = fromSignals(signals);
  return {
    score,
    finding: "A literal property of the prompt: a text-safe area is declared AND model-drawn text is forbidden. Checkable without judgement.",
    evidence,
  };
}

function brandConsistency(p: string, s: Phase0Scenario): Omit<Phase0DimensionScore, "dimension" | "prompt_method"> {
  const toneWords = s.brief.brandTone
    .split(/[,;]/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3);
  const toneHits = toneWords.filter((w) => has(p, w)).length;
  const signals = [
    { label: "a BRAND POSITIONING block reached the prompt", ok: has(p, "## BRAND POSITIONING") },
    { label: `brand tone vocabulary survived (${toneHits}/${toneWords.length} tokens)`, ok: toneHits > 0 },
    { label: "the brand's emotional territory is stated", ok: /emotional territory|quán quen|territory/i.test(p) },
    { label: "an anti-generic justification is present", ok: has(p, "## WHY THIS IS NOT THE CATEGORY DEFAULT") },
    { label: "audience reasoning reached the prompt", ok: has(p, "## AUDIENCE") },
  ];
  const { score, evidence } = fromSignals(signals);
  return {
    score,
    finding: "Checks brand tone and positioning vocabulary survived into the transmitted direction. Detects absence; cannot confirm fit.",
    evidence,
  };
}

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six"][n] || String(n);
}

// ── public API ────────────────────────────────────────────────────────────

export class Phase0TransmissionScorer {
  /**
   * Scores one arm of one scenario from its generated prompt.
   *
   * `ai_artifact_level` comes back `null` and is excluded from the mean rather
   * than counted as zero. Whether a render has six fingers is not a property of
   * the prompt, and a scorer that guessed at it from vocabulary would be grading
   * its own word list.
   */
  public static score(record: Phase0Record, scenario: Phase0Scenario): Phase0ArmScore {
    const p = record.final.generated_prompt;

    const parts: Record<Phase0DimensionId, Omit<Phase0DimensionScore, "dimension" | "prompt_method"> | null> = {
      product_identity_preservation: productIdentity(p, scenario),
      creative_concept_strength: conceptStrength(p),
      composition_quality: composition(p),
      commercial_usability: commercialUsability(p, scenario),
      typography_readiness: typographyReadiness(p, scenario),
      brand_consistency: brandConsistency(p, scenario),
      ai_artifact_level: null,
    };

    const dimensions: Phase0DimensionScore[] = PHASE0_DIMENSIONS.map((def) => {
      const part = parts[def.id];
      if (!part) {
        return {
          dimension: def.id,
          prompt_method: def.prompt_method,
          score: null,
          finding:
            "Not measurable from a prompt. This dimension is a property of the rendered image and is scored by a human at stage 2.",
          evidence: [],
        };
      }
      return { dimension: def.id, prompt_method: def.prompt_method, ...part };
    });

    const scored = dimensions.filter((d) => d.score !== null);
    const overall = scored.length
      ? Number((scored.reduce((a, d) => a + (d.score as number), 0) / scored.length).toFixed(2))
      : 0;

    return {
      scenario_id: record.scenario_id,
      arm: record.arm,
      dimensions,
      transmission_overall: overall,
      scored_count: scored.length,
      unscored: dimensions.filter((d) => d.score === null).map((d) => d.dimension),
    };
  }
}
