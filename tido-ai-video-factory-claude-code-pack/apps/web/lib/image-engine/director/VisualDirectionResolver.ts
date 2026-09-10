import {
  AUTO,
  CONTROL_KEYS,
  ControlKey,
  ControlSource,
  ResolvedControl,
  ResolvedVisualControls,
  SOURCE_PRECEDENCE,
  VisualDirectionControls,
  optionFor,
  specFor,
} from "./visual-controls.types";

/**
 * CIOS Phase 4.1.5 — one answer per control, and a reason for it.
 *
 * Precedence is the whole design
 * -----------------------------
 * user_selected > concept_detected > reference_image > ai_suggested >
 * ai_decision > default.
 *
 * Reading it aloud: what the user clicked beats what the user wrote, what the
 * user wrote beats what their reference image happens to show, and all three
 * beat the director's own judgement. The director is the *last* resort before a
 * format default, not the first authority — which is the opposite of how the
 * pipeline behaved before Phase 4.1, and the opposite again of how it would
 * behave if controls were treated as hints.
 *
 * Why a click beats a sentence
 * ---------------------------
 * Both are the user speaking, so the ordering needs a justification. A click is
 * unambiguous and a sentence is parsed: if someone selects Low Angle and also
 * writes something the detector reads as top-down, the click is the one we can
 * be certain about. Where they agree, nothing is lost. Where they disagree, the
 * disagreement is recorded in `reason` rather than resolved silently.
 */

export interface ResolverInput {
  /** What the user clicked. `auto` or absent means unset. */
  selected?: VisualDirectionControls;
  /** The concept text, scanned for the same options in words. */
  concept?: string;
  /** Options evidenced by an uploaded reference image, where any were read. */
  fromReference?: Partial<Record<ControlKey, string>>;
  /**
   * The Visual Direction Plan the panel displayed before Generate.
   *
   * Binding, because the user saw it and pressed Generate anyway. Without this
   * the panel would show one recommendation and the renderer would receive the
   * director's own unrelated decision — the plan would be decoration.
   */
  plan?: Partial<Record<ControlKey, string>>;
  /** What the Visual Director decided, as free prose per control. */
  aiDecision?: Partial<Record<ControlKey, string>>;
}

export class VisualDirectionResolver {
  public static resolve(input: ResolverInput): ResolvedVisualControls {
    const controls = {} as Record<ControlKey, ResolvedControl>;
    const explicit: ResolvedControl[] = [];

    for (const key of CONTROL_KEYS) {
      const resolved = this.resolveOne(key, input);
      controls[key] = resolved;
      // "Explicit" is now anything the user has seen: their own choice, their
      // own words, or the plan the panel displayed. All three bind; only the
      // director's unseen decision and the bare default do not.
      if (
        resolved.source === "user_selected" ||
        resolved.source === "concept_detected" ||
        resolved.source === "ai_suggested"
      ) {
        explicit.push(resolved);
      }
    }

    return {
      controls,
      explicit,
      fully_auto: explicit.every((c) => c.source === "ai_suggested"),
    };
  }

  private static resolveOne(key: ControlKey, input: ResolverInput): ResolvedControl {
    const spec = specFor(key);
    const picked = input.selected?.[key];

    // "Tự chọn", chosen deliberately, means "do not pin this one — the engine
    // decides". So it has to suppress the displayed plan as well as the user
    // tier; otherwise the suggestion the control was showing binds anyway and
    // the option does nothing, which is what it did on first implementation.
    //
    // It does not suppress the concept or a reference read. Those are the user's
    // own words and their own image; picking Tự chọn is a statement about the
    // control, not a retraction of what they wrote.
    const unpinned = picked === AUTO;

    // ── 1. user_selected ───────────────────────────────────────────────
    if (picked && picked !== AUTO) {
      const option = optionFor(key, picked);
      if (option) {
        // A conflicting concept reading is recorded rather than acted on. The
        // user is not told they are wrong and the prompt is not given two
        // camera angles; the disagreement simply goes into the trace.
        const detected = this.detectIn(key, input.concept);
        const conflict =
          detected && detected !== option.id
            ? ` The concept also reads as "${optionFor(key, detected)?.label}"; the selection wins.`
            : "";
        return {
          key,
          option: option.id,
          label: option.label,
          instruction: option.instruction,
          source: "user_selected",
          reason: `User selected "${option.label}".${conflict}`,
        };
      }
    }

    // ── 2. concept_detected ────────────────────────────────────────────
    const detected = this.detectIn(key, input.concept);
    if (detected) {
      const option = optionFor(key, detected)!;
      return {
        key,
        option: option.id,
        label: option.label,
        instruction: option.instruction,
        source: "concept_detected",
        reason: `Read from the concept as "${option.label}".`,
      };
    }

    // ── 3. reference_image ─────────────────────────────────────────────
    const fromRef = input.fromReference?.[key];
    const refOption = optionFor(key, fromRef);
    if (refOption) {
      return {
        key,
        option: refOption.id,
        label: refOption.label,
        instruction: refOption.instruction,
        source: "reference_image",
        reason: `Read from the uploaded reference as "${refOption.label}".`,
      };
    }

    // ── 4. ai_suggested ────────────────────────────────────────────────
    // What the panel showed. The user was given a chance to change it and did
    // not, so it binds.
    const planned = unpinned ? undefined : optionFor(key, input.plan?.[key]);
    if (planned) {
      return {
        key,
        option: planned.id,
        label: planned.label,
        instruction: planned.instruction,
        source: "ai_suggested",
        reason: `Suggested as "${planned.label}" and left unchanged.`,
      };
    }

    // ── 5. ai_decision ─────────────────────────────────────────────────
    // The director's own prose, not one of the menu options. It is carried as
    // the instruction because it is already specific enough to execute, and
    // forcing it into the nearest menu label would lose detail the director
    // decided deliberately.
    const ai = String(input.aiDecision?.[key] || "").trim();
    if (ai) {
      return {
        key,
        option: null,
        label: "Tự chọn",
        instruction: ai,
        source: "ai_decision",
        reason: "Left on Tự chọn; the Visual Director decided this.",
      };
    }

    // ── 6. default ─────────────────────────────────────────────────────
    return {
      key,
      option: null,
      label: "Tự chọn",
      instruction: "",
      source: "default",
      reason: `Left on Tự chọn and nothing decided it; the ${spec.label.toLowerCase()} falls back to the format default.`,
    };
  }

  /** The first option whose detector matches the concept. */
  private static detectIn(key: ControlKey, concept?: string): string | null {
    const text = String(concept || "");
    if (!text.trim()) return null;
    for (const option of specFor(key).options) {
      if (option.detect && option.detect.test(text)) return option.id;
    }
    return null;
  }

  /**
   * The binding controls, as prompt lines.
   *
   * Everything the user has seen is emitted: their selection, their words, and
   * the plan the panel displayed. The director's own unseen decision is not —
   * it is already stated in the camera, lighting and composition sections, and
   * repeating it would add length while saying nothing new.
   */
  public static promptLines(resolved: ResolvedVisualControls): string[] {
    return resolved.explicit
      .filter((c) => c.instruction)
      .map((c) => `- ${specFor(c.key).label}: ${c.instruction}`);
  }

  /** Precedence rank, lower wins. Exposed for tests and diagnostics. */
  public static rank(source: ControlSource): number {
    return SOURCE_PRECEDENCE.indexOf(source);
  }
}
