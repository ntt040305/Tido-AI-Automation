/**
 * The Idea Layer — the one sentence that says why this is one picture.
 *
 * WHY THIS EXISTS
 * ---------------
 * `creative_concept` is the weakest dimension the judge scores: 4.6 of 10 across
 * twelve cases, below every other dimension including typography. Reading the
 * prompts explains it. The section called `CREATIVE CONCEPT` contained a materials
 * list -- "material language: translucent amber glass; turned dark wood cap; fine-
 * grained beige stone" -- and the brief's own concept sentence was repeated three
 * times verbatim and restated four more as the scene, the atmosphere, the
 * foreground and the background. Nowhere did any prompt say what the picture was
 * ABOUT in a way a viewer could repeat afterwards.
 *
 * A renderer given a mood and a materials list produces a well-made picture of
 * nothing. That is the 4.6.
 *
 * WHAT THIS LAYER MAY AND MAY NOT DO
 * ----------------------------------
 * It may not invent an idea. Nothing deterministic can, and a module that bolted
 * on a borrowed metaphor would be writing advertising the client never approved.
 *
 * What it does instead is three things that are honest and that nothing currently
 * does at all:
 *
 *   1. STATES the idea once, under a label, so the renderer can tell the idea from
 *      the description of the set.
 *   2. NAMES what it beat, from the director's own rejected directions. An idea
 *      with nothing behind it is a preference; an idea that beat two others is a
 *      decision, and saying so stops the renderer averaging all three.
 *   3. REPORTS when there is no idea -- when the material is a mood or a list of
 *      materials with no mechanism in it. `mood_only` is a measurement of the
 *      brief, surfaced rather than hidden, because a system that cannot tell the
 *      difference will keep scoring 4.6 and keep calling it art direction.
 *
 * WHAT A MECHANISM IS
 * -------------------
 * A mood says how the picture feels. A mechanism says what the picture DOES: the
 * bottle stands in for the hour, the absence is the proof, the object is met
 * rather than observed. `MECHANISM` below is the vocabulary of that difference --
 * comparison, substitution, transformation, refusal -- and it is the only test
 * this file applies to creative material.
 *
 * Pure. No model call, no I/O, no clock.
 */

/** Verbs and connectives that turn a description into a mechanism. */
const MECHANISM =
  /\b(as if|as though|rather than|instead of|in place of|stands? in for|turns? into|becomes?|reads? as|the way a|without ever|before anything|not .* but|is what makes)\b/i;

/** Material that is a mood, a palette or a list of surfaces. */
const MOOD_ONLY = /\b(material language|palette|colour story|color story|mood board|feels?|feeling|atmosphere of|tones?)\b/i;

export interface Idea {
  /** The statement as the prompt carries it. Empty when there was nothing to state. */
  statement: string;
  /** The sentence the idea rests on, exactly as the director wrote it. */
  source: string;
  /** Which blueprint field it came from. */
  source_field: string | null;
  /** The mechanism clause found in that sentence, or null. */
  mechanism: string | null;
  /** Directions this one beat, by name. */
  beats: string[];
  /** The tension it resolves, where one was stated. */
  tension: string | null;
  /**
   * True when no mechanism was found anywhere in the creative material.
   *
   * Not a failure of this layer: a report about the brief. The statement is still
   * emitted -- a mood stated once is better than a mood stated four times -- and
   * the telemetry says the idea was never actually formed.
   */
  mood_only: boolean;
  because: Record<string, string>;
}

/** A blueprint decision: a value and what forced it. */
interface DecisionLike {
  value?: string | null;
  because?: string | null;
}

export interface IdeaInput {
  /** `CreativeBlueprint.concept`, where one was built. */
  concept?: {
    big_idea?: DecisionLike | null;
    campaign_concept?: DecisionLike | null;
    visual_story?: DecisionLike | null;
    creative_tension?: DecisionLike | null;
    emotional_hook?: DecisionLike | null;
    message_strategy?: DecisionLike | null;
  } | null;
  /** The director's explored directions and which one was chosen. */
  judgment?: {
    directions?: Array<{ name?: string; core_idea?: string }> | null;
    selected?: string | null;
    selection_reason?: string | null;
  } | null;
  /** The client's own concept text, as a last resort. */
  brief?: string | null;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** First sentence of a passage, up to `max` characters. */
function firstSentence(text: string, max = 200): string {
  const s = clean(text);
  if (!s) return "";
  const cut = s.split(/(?<=[.;!?])\s+/)[0] || s;
  return cut.length <= max ? cut : `${cut.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The order the idea is looked for in.
 *
 * `big_idea` first because that is the field whose whole job this is, then the
 * campaign's own framing, then the story. `creative_tension` sits last of the
 * candidates and first among tensions: a tension is not an idea, but a tension
 * stated plainly is closer to one than a palette is.
 */
const CANDIDATES: Array<keyof NonNullable<IdeaInput["concept"]>> = [
  "big_idea",
  "campaign_concept",
  "visual_story",
  "message_strategy",
  "creative_tension",
];

/**
 * Resolves the idea statement.
 *
 * Preference order within the candidates is not "the longest" or "the first": it
 * is "the one that contains a mechanism". A later field that says what the picture
 * DOES beats an earlier one that says how it feels, because the mechanism is the
 * part a renderer can act on and a viewer can repeat.
 */
export function resolveIdea(input: IdeaInput): Idea {
  const concept = input.concept || {};
  const fields = CANDIDATES.map((key) => ({ key: String(key), value: clean(concept[key]?.value), because: clean(concept[key]?.because) })).filter(
    (f) => f.value,
  );
  const because: Record<string, string> = {};

  const withMechanism = fields.find((f) => MECHANISM.test(f.value));
  const fallback = fields.find((f) => !MOOD_ONLY.test(f.value)) || fields[0] || null;
  const chosen = withMechanism || fallback;
  const briefText = clean(input.brief);

  const source = chosen?.value || firstSentence(briefText);
  const source_field = chosen?.key || (source ? "brief.concept" : null);
  const mechanism = source ? (MECHANISM.exec(source)?.[0] ?? null) : null;

  because.source = chosen
    ? withMechanism
      ? `${chosen.key} is the idea because it is the only field that says what the picture DOES ("${mechanism}")`
      : `${chosen.key} was the closest thing to an idea; no field in the concept contained a mechanism`
    : source
      ? "no blueprint concept existed, so the client's own first sentence is the idea"
      : "nothing stated an idea";

  // What it beat. The director's own rejected directions, by name -- never an
  // invented alternative, and never the selected one.
  const selected = clean(input.judgment?.selected);
  const beats = (input.judgment?.directions || [])
    .map((d) => clean(d?.name))
    .filter((name) => name && name.toLowerCase() !== selected.toLowerCase())
    .slice(0, 3);
  if (beats.length) because.beats = `the director explored ${beats.length + 1} directions and chose ${selected || "one"}`;

  const tension = clean(concept.creative_tension?.value) || null;
  const mood_only = !mechanism;
  if (mood_only) {
    because.mood_only =
      "no field in the creative material contains a mechanism -- a comparison, a substitution or a refusal -- so the brief supplied a mood and the picture has no idea to carry";
  }

  const statement = buildStatement({ source, mechanism, beats, tension, reason: clean(input.judgment?.selection_reason) });
  return { statement, source, source_field, mechanism, beats, tension, mood_only, because };
}

function buildStatement(parts: {
  source: string;
  mechanism: string | null;
  beats: string[];
  tension: string | null;
  reason: string;
}): string {
  if (!parts.source) return "";
  const lines = [`THE IDEA — ${firstSentence(parts.source, 220)}`];

  // The tension is stated only when it is not already the idea: a brief whose
  // idea IS its tension would otherwise say the same thing twice, which is the
  // defect this layer was built to stop.
  if (parts.tension && parts.tension !== parts.source) {
    lines.push(`What it resolves: ${firstSentence(parts.tension, 160)}`);
  }
  if (parts.beats.length) {
    const reason = parts.reason ? ` — ${firstSentence(parts.reason, 140)}` : "";
    lines.push(`It beat ${parts.beats.join(" and ")}${reason}. Those directions are not in this frame; do not average them in.`);
  }
  lines.push(
    "Everything below serves this one line. Where a later block offers a way to make the frame more interesting that this line does not need, leave it out.",
  );
  return lines.join("\n");
}

/** The statement, for BLOCK 3. Empty when there was no idea to state. */
export function renderIdeaForPrompt(idea: Idea | null | undefined): string {
  return idea?.statement || "";
}

/** Counts and flags only. Never the client's copy. */
export function ideaTelemetry(idea: Idea | null | undefined) {
  if (!idea) return { idea: false };
  return {
    idea: true,
    source_field: idea.source_field,
    mechanism: idea.mechanism,
    mood_only: idea.mood_only,
    beats: idea.beats.length,
    has_tension: Boolean(idea.tension),
    chars: idea.statement.length,
  };
}
