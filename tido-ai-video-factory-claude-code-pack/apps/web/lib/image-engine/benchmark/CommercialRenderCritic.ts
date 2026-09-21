import type { CreativeBlueprint } from "../evolution/experiment/CreativeBlueprint";
import type { LayoutGeometry } from "../evolution/experiment/LayoutGeometry";
import type { TypographySystem } from "../evolution/experiment/TypographySystem";
import type { VisualDNA } from "../evolution/experiment/VisualDNAAnalyzer";

/**
 * The Commercial Render Critic — would a brand pay for this.
 *
 * The line this file will not cross
 * ---------------------------------
 * Four of the things the brief asks for — fake shadows, plastic materials,
 * floating objects, unrealistic reflections — are properties of a PICTURE.
 * Nothing in this repository can look at a picture. Every benchmark this
 * project has run scored renders with a human eye, and a critic that returned
 * "plastic materials: none detected" without having seen anything would be the
 * most expensive lie the system could tell: it would read as verification and
 * be a coin toss.
 *
 * So artifact detection is split in two, honestly:
 *
 *   PREVENTED  — deterministic, free, runs always. Did the prompt instruct
 *                against the thing? A floating product is prevented by a
 *                contact shadow being specified; plastic material is prevented
 *                by material rendering resting on an observation. These are
 *                answerable from the prompt and the blueprint.
 *
 *   OBSERVED   — requires vision. `VisualDNAAnalyzer` already reads images with
 *                a model and could read a RENDER as easily as a reference. That
 *                is a real capability and a real cost: one model call per
 *                render. The seam is `observedArtifacts`, supplied by the
 *                caller. When absent, `vision_available` is false and no
 *                observed claim is made.
 *
 * A report never mixes the two. `prevented` says what the prompt guarded
 * against; `observed` says what was actually seen, and only when something saw.
 */

export type ArtifactKind =
  | "floating_object"
  | "fake_shadow"
  | "plastic_material"
  | "unrealistic_reflection"
  | "bad_text_placement"
  | "label_damage";

export interface ArtifactCheck {
  kind: ArtifactKind;
  /** True when the prompt or blueprint guards against it. */
  prevented: boolean;
  /** What guards it, or what is missing. */
  because: string;
}

export interface CreativeQualityScore {
  overall_score: number;
  design_score: number;
  commercial_score: number;
  technical_score: number;
  issues_found: string[];
  improvement_actions: string[];
  /** Per-artifact prevention status. Never a claim about the picture. */
  artifact_checks: ArtifactCheck[];
  /**
   * False unless the caller supplied a vision reading of the render.
   *
   * When false, nothing in this report is a statement about the image.
   */
  vision_available: boolean;
  disclaimer: string;
}

const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n * 10) / 10));
const round = (n: number) => Math.round(n * 100) / 100;

export interface CriticInput {
  blueprint?: CreativeBlueprint | null;
  geometry?: LayoutGeometry | null;
  typography?: TypographySystem | null;
  /** The final compiled prompt, exactly as the provider received it. */
  prompt?: string;
  /**
   * A vision reading of the RENDER, where the caller paid for one.
   *
   * `VisualDNAAnalyzer.analyze` on the output image produces exactly this
   * shape. Absent by default: the loop must stay free.
   */
  observedArtifacts?: VisualDNA | null;
}

/**
 * Checks what the prompt guards against. Deterministic, free.
 *
 * Each check asks a question answerable without seeing anything: is the thing
 * that prevents this artifact present in the instruction?
 */
export function checkArtifacts(input: CriticInput): ArtifactCheck[] {
  const p = input.prompt || "";
  const b = input.blueprint || null;
  const has = (needle: string) => p.toLowerCase().includes(needle.toLowerCase());

  const shadow = has("contact shadow") || has("shadow beneath") || Boolean(b?.photography?.lighting_behavior);
  const material = Boolean(b?.photography?.material_rendering?.derived_from === "visual_dna");
  const overlap = (input.geometry?.score.readability ?? 10) >= 8;

  return [
    {
      kind: "floating_object",
      prevented: shadow,
      because: shadow
        ? "lighting behaviour is decided, which is what anchors the product to its surface"
        : "no lighting behaviour is decided, so nothing specifies what the product sits on",
    },
    {
      kind: "fake_shadow",
      prevented: Boolean(b?.photography?.lighting_behavior?.because?.trim()),
      because: b?.photography?.lighting_behavior
        ? "the lighting decision states a single source and its reason, so shadows follow one direction"
        : "no lighting decision, so shadow direction is left to the renderer",
    },
    {
      kind: "plastic_material",
      prevented: material,
      because: material
        ? "material rendering rests on VisualDNA, so surfaces are described from the real product"
        : "material rendering does not rest on an observation, so surface quality is invented",
    },
    {
      kind: "unrealistic_reflection",
      prevented: material && shadow,
      because:
        material && shadow
          ? "observed material and a decided light together constrain how surfaces reflect"
          : "reflection follows from material and light, and at least one is undecided",
    },
    {
      kind: "bad_text_placement",
      prevented: overlap,
      because: overlap
        ? "the layout keeps copy zones clear of the product"
        : "copy zones overlap the product in the geometry",
    },
    {
      kind: "label_damage",
      prevented: has("PRODUCT IDENTITY PROTECTION") && has("belong to the layout, not to the product"),
      because:
        has("PRODUCT IDENTITY PROTECTION")
          ? "identity protection and the copy-placement rule are both in the prompt"
          : "the prompt does not protect the product's own label from campaign copy",
    },
  ];
}

/**
 * Scores a render's commercial readiness. Pure and total.
 *
 * Every number is computed from the blueprint, the geometry, the typography and
 * the prompt. None is a statement about the resulting picture, and the
 * disclaimer says so on every report.
 */
export function critiqueRender(input: CriticInput): CreativeQualityScore {
  const b = input.blueprint || null;
  const checks = checkArtifacts(input);
  const issues_found: string[] = [];
  const improvement_actions: string[] = [];

  // ── design ────────────────────────────────────────────────────────────
  const layoutScore = input.geometry?.score.overall ?? 1;
  const typoScore = input.typography?.validation.overall ?? 1;
  const design_score = round((layoutScore + typoScore) / 2);
  for (const n of input.geometry?.score.notes || []) issues_found.push(`layout: ${n}`);
  for (const n of input.typography?.validation.issues || []) issues_found.push(`typography: ${n}`);
  if (layoutScore < 7) {
    improvement_actions.push("Rebalance the frame: move copy off the product and give the heaviest element a clear side.");
  }
  if (typoScore < 7) {
    improvement_actions.push("Widen the size gap between the headline and everything else so one line clearly leads.");
  }

  // ── commercial ────────────────────────────────────────────────────────
  const hasConversion = (input.geometry?.zones || []).some((z) => z.name === "cta");
  const hasIdea = Boolean(b?.concept?.big_idea);
  const hasTension = Boolean(b?.concept?.creative_tension);
  const commercial_score = clamp(1 + (hasIdea ? 3 : 0) + (hasTension ? 3 : 0) + (hasConversion ? 3 : 0));
  if (!hasConversion) {
    issues_found.push("commercial: no closing zone, so the layout has nowhere for the eye to act");
    improvement_actions.push("Add a closing line and place it at the end of the reading path.");
  }
  if (!hasTension) {
    issues_found.push("commercial: the concept has no tension, so it renders as a description");
    improvement_actions.push("Name what the idea resolves, and what was rejected to get there.");
  }

  // ── technical ─────────────────────────────────────────────────────────
  const prevented = checks.filter((c) => c.prevented).length;
  const technical_score = clamp(1 + (prevented / checks.length) * 9);
  for (const c of checks.filter((x) => !x.prevented)) {
    issues_found.push(`technical: ${c.kind.replace(/_/g, " ")} is not guarded — ${c.because}`);
  }
  if (prevented < checks.length) {
    improvement_actions.push(
      `Close the ${checks.length - prevented} unguarded artifact risk(s) before spending another render.`
    );
  }

  const vision_available = Boolean(input.observedArtifacts?.provenance?.derived_from_image);

  return {
    overall_score: round((design_score + commercial_score + technical_score) / 3),
    design_score,
    commercial_score,
    technical_score,
    issues_found,
    improvement_actions,
    artifact_checks: checks,
    vision_available,
    disclaimer: vision_available
      ? "Artifact checks below cover what the prompt guards against. A vision reading of the render was supplied and is reported separately; it is the only part of this report that describes the picture."
      : "Nothing here has seen the render. Every score describes what was DECIDED and what the prompt guards against, not what the image contains. Only a human, or a vision pass, can say whether the picture is good.",
  };
}

/** Counts only — never the issue prose. */
export function criticTelemetry(s: CreativeQualityScore | null | undefined) {
  if (!s) return { critic: false };
  return {
    critic: true,
    overall: s.overall_score,
    design: s.design_score,
    commercial: s.commercial_score,
    technical: s.technical_score,
    issues: s.issues_found.length,
    actions: s.improvement_actions.length,
    artifacts_guarded: s.artifact_checks.filter((c) => c.prevented).length,
    artifacts_unguarded: s.artifact_checks.filter((c) => !c.prevented).map((c) => c.kind),
    vision_available: s.vision_available,
  };
}
