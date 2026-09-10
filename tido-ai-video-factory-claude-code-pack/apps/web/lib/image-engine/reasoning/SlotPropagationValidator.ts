import { CreativeDirection } from "../service/CreativeKnowledgeService";
import { CreativeDecision, CreativeDecisionSet } from "./creative-decision.types";
import { DIRECTION_SLOTS, DirectionSlot } from "./reasoning-knowledge.types";

/**
 * CIOS Phase 3.1.6.5 — slot propagation validation.
 *
 * Phase 3.1.6 moved routing from dimensions to CreativeDirection slots and the
 * benchmark numbers moved with it. Numbers moving is not proof that data arrived:
 * a score can improve because a decision was produced, while the decision still
 * stops one hop short of the prompt. That is exactly what had been happening with
 * `materials` — routed, mapped, scored, and never pushed to the resolver.
 *
 * So this validator follows one decision through every hop and reports where it
 * stopped:
 *
 *   knowledge_id → domain → decision → direction_slot
 *     → CreativeDirection field   (did the adapter write it?)
 *     → compiled prompt           (did the compiler print it?)
 *
 * It asserts nothing about quality. A decision that arrives intact and is bad is
 * a different phase's problem; a decision that is good and never arrives is this
 * one's.
 */

/** How far a decision travelled. */
export type PropagationStatus =
  /** Reached the CreativeDirection field and the compiled prompt. */
  | "RECEIVED"
  /** Reached CreativeDirection; no prompt was supplied to check against. */
  | "NOT_CHECKED"
  /** Reached CreativeDirection but is absent from the compiled prompt. */
  | "NOT_IN_PROMPT"
  /** Won its slot in the decision set but the adapter did not write the field. */
  | "LOST_IN_ADAPTER"
  /** Has no destination slot at all. */
  | "NO_SLOT";

export interface DecisionPropagationRecord {
  knowledge_id: string;
  domain: string;
  decision: string;
  direction_slot?: DirectionSlot;
  /** The CreativeDirection field name this decision should occupy. */
  destination?: DirectionSlot;
  /** What that field actually holds. Empty when the adapter dropped it. */
  destination_value: string;
  /** Whether the field holds this decision rather than a different one. */
  reached_direction: boolean;
  compiler_received: PropagationStatus;
  /** Present when the record is anything other than RECEIVED or NOT_CHECKED. */
  note?: string;
}

export interface SlotCoverageRecord {
  slot: DirectionSlot;
  filled: boolean;
  value: string;
  /** knowledge_id of the decision occupying the slot, when one does. */
  source?: string;
  in_prompt?: boolean;
}

export interface SlotPropagationReport {
  records: DecisionPropagationRecord[];
  slots: SlotCoverageRecord[];
  summary: {
    decisions: number;
    reached_direction: number;
    received_by_compiler: number;
    lost_in_adapter: number;
    not_in_prompt: number;
    no_slot: number;
    slots_filled: number;
    slots_total: number;
  };
  /** Slots that hold a value the prompt does not contain. */
  broken_hops: string[];
}

/**
 * Domain from a knowledge_id.
 *
 * Ids are `domain.sub_domain.topic.NNN` by schema, so the prefix is authoritative
 * and needs no repository lookup — which keeps this validator usable in a test
 * that has no corpus on disk.
 */
function domainOf(knowledgeId: string): string {
  return (knowledgeId || "").split(".")[0] || "unknown";
}

/**
 * Reads a slot off a CreativeDirection.
 *
 * Every DirectionSlot is a real field on the interface, so this is total — but
 * the interface has no index signature and asserting one would let a typo in the
 * slot list read `undefined` forever without a compile error.
 */
function readSlot(direction: CreativeDirection, slot: DirectionSlot): string {
  return String(direction[slot] ?? "");
}

/**
 * Whether a decision's text is present in a prompt.
 *
 * Compared on a normalised leading fragment rather than the whole string. The
 * compiler wraps, truncates and re-cases what it prints, so a whole-string match
 * would report every propagated decision as lost. Forty characters is long enough
 * that a coincidental match does not happen and short enough to survive the
 * compiler's own trimming.
 */
function appearsIn(prompt: string, text: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const needle = norm(text).slice(0, 40);
  if (needle.length < 12) return false;
  return norm(prompt).includes(needle);
}

export class SlotPropagationValidator {
  /**
   * Follows every art-direction decision to its destination.
   *
   * `promptText` is optional: without it every arrived decision is NOT_CHECKED
   * rather than assumed received. An unverified hop reported as success is the
   * failure mode this whole validator exists to prevent.
   */
  public static validate(
    set: CreativeDecisionSet,
    direction: CreativeDirection,
    promptText?: string
  ): SlotPropagationReport {
    const records: DecisionPropagationRecord[] = set.art_direction.map((d) =>
      this.record(d, direction, promptText)
    );

    const slots: SlotCoverageRecord[] = DIRECTION_SLOTS.map((slot) => {
      const value = readSlot(direction, slot);
      const owner = set.art_direction.find((d) => d.direction_slot === slot);
      return {
        slot,
        filled: Boolean(value.trim()),
        value,
        source: owner?.derived_from[0],
        in_prompt: promptText && value.trim() ? appearsIn(promptText, value) : undefined,
      };
    });

    const count = (s: PropagationStatus) => records.filter((r) => r.compiler_received === s).length;

    return {
      records,
      slots,
      summary: {
        decisions: records.length,
        reached_direction: records.filter((r) => r.reached_direction).length,
        received_by_compiler: count("RECEIVED"),
        lost_in_adapter: count("LOST_IN_ADAPTER"),
        not_in_prompt: count("NOT_IN_PROMPT"),
        no_slot: count("NO_SLOT"),
        slots_filled: slots.filter((s) => s.filled).length,
        slots_total: slots.length,
      },
      broken_hops: slots
        .filter((s) => s.filled && s.in_prompt === false)
        .map((s) => `${s.slot} holds a value that never reached the prompt`),
    };
  }

  private static record(
    d: CreativeDecision,
    direction: CreativeDirection,
    promptText?: string
  ): DecisionPropagationRecord {
    const knowledge_id = d.derived_from[0] || "unknown";
    const slot = d.direction_slot;
    const base = {
      knowledge_id,
      domain: domainOf(knowledge_id),
      decision: d.decision,
      direction_slot: slot,
      destination: slot,
    };

    if (!slot) {
      return {
        ...base,
        destination_value: "",
        reached_direction: false,
        compiler_received: "NO_SLOT",
        note: "Routed to ART_DIRECTION with no destination slot; it can reach no CreativeDirection field.",
      };
    }

    const destination_value = readSlot(direction, slot);
    const reached = destination_value.trim() === d.decision.trim();

    if (!reached) {
      return {
        ...base,
        destination_value,
        reached_direction: false,
        compiler_received: "LOST_IN_ADAPTER",
        note: destination_value
          ? `Slot "${slot}" holds a different decision; this one won its slot in the set but not in the direction.`
          : `Slot "${slot}" is empty; toCreativeDirection did not write this decision.`,
      };
    }

    if (!promptText) {
      return { ...base, destination_value, reached_direction: true, compiler_received: "NOT_CHECKED" };
    }

    const inPrompt = appearsIn(promptText, d.decision);
    return {
      ...base,
      destination_value,
      reached_direction: true,
      compiler_received: inPrompt ? "RECEIVED" : "NOT_IN_PROMPT",
      note: inPrompt
        ? undefined
        : `Reached CreativeDirection.${slot} but the compiled prompt does not contain it — the hop from that field into the prompt is not wired.`,
    };
  }

  /** Terminal-readable trace. */
  public static format(report: SlotPropagationReport): string {
    const L: string[] = [];
    L.push(
      `slots ${report.summary.slots_filled}/${report.summary.slots_total} filled · ` +
        `${report.summary.decisions} decisions · ${report.summary.received_by_compiler} received · ` +
        `${report.summary.lost_in_adapter} lost in adapter · ${report.summary.not_in_prompt} not in prompt`
    );
    for (const s of report.slots) {
      const mark = !s.filled ? "·" : s.in_prompt === false ? "✗" : s.in_prompt ? "✓" : "?";
      L.push(
        `  ${mark} ${s.slot.padEnd(22)} ${s.filled ? (s.source || "").padEnd(46) : "(empty)".padEnd(46)} ${s.value.slice(0, 46)}`
      );
    }
    for (const b of report.broken_hops) L.push(`  ! ${b}`);
    return L.join("\n");
  }
}
