/**
 * The tag parser — four tags, and a model that will not always behave.
 *
 * WHY TAGS AND NOT JSON
 * ---------------------
 * The thing being returned is mostly prose: a 300-word brief, a few lines of copy, a
 * list of warnings. JSON makes a model escape every newline and every quotation mark
 * inside that prose, and one missed escape invalidates the whole reply. Tags cost
 * nothing to produce and a broken tag loses one field instead of all four.
 *
 * WHAT TOLERANT MEANS HERE
 * ------------------------
 * Observed model habits, each handled rather than refused:
 *   - prose before or after the tags ("Here you go:", "Hope that helps")
 *   - a fenced code block wrapped around everything
 *   - a tag the model closed with the wrong name, or did not close at all
 *   - tags in a different order
 *   - `<copy_final>` or `<warnings>` left empty, which is legitimate
 *   - XML-ish attributes on the opening tag
 *
 * What it will NOT do is invent a missing `<image_prompt>`: that is the one field
 * with no sensible default, and a parse that fabricates it would turn a failed call
 * into a confident bad render.
 *
 * Pure. No model call, no I/O.
 */

export const TAGS = ["plan", "copy_final", "warnings", "image_prompt"] as const;
export type TagName = (typeof TAGS)[number];

export interface TaggedReply {
  plan: string;
  /** One string per line, blank lines dropped. */
  copy_final: string[];
  warnings: string[];
  image_prompt: string;
  /** Tags that were not found at all. */
  missing: TagName[];
  /** Text that sat outside every tag, trimmed. Reported, not used. */
  stray: string;
}

const nfc = (s: string) => String(s ?? "").normalize("NFC");

/**
 * The content of one tag.
 *
 * Closing tag first; if there is no closing tag, everything up to the next opening
 * tag or the end of the reply. A model that forgets `</image_prompt>` at the end of
 * its longest field is the most common single failure, and losing the brief to a
 * missing five characters would be absurd.
 */
function extract(raw: string, tag: TagName): { value: string; found: boolean; span: [number, number] | null } {
  const open = new RegExp(`<\\s*${tag}\\b[^>]*>`, "i").exec(raw);
  if (!open) return { value: "", found: false, span: null };
  const start = open.index + open[0].length;

  const close = new RegExp(`<\\s*/\\s*${tag}\\s*>`, "i").exec(raw.slice(start));
  if (close) {
    return { value: raw.slice(start, start + close.index), found: true, span: [open.index, start + close.index + close[0].length] };
  }

  // No closing tag: stop at the next opening tag of any known name, or the end.
  const nextOpen = TAGS.map((t) => {
    const m = new RegExp(`<\\s*${t}\\b[^>]*>`, "i").exec(raw.slice(start));
    return m ? start + m.index : -1;
  })
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const end = nextOpen === undefined ? raw.length : nextOpen;
  return { value: raw.slice(start, end), found: true, span: [open.index, end] };
}

const lines = (s: string): string[] =>
  nfc(s)
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

/** Parses a reply. Never throws: a model's output is input. */
export function parseTaggedReply(raw: string): TaggedReply {
  // A fence around the whole reply is wrapping, not content.
  const text = nfc(raw).replace(/^\s*```[a-z]*\s*/i, "").replace(/```\s*$/, "");

  const got = Object.fromEntries(TAGS.map((t) => [t, extract(text, t)])) as Record<
    TagName,
    ReturnType<typeof extract>
  >;

  // Whatever sat outside every tag. Useful for diagnosis, never used as content.
  const spans = TAGS.map((t) => got[t].span).filter(Boolean) as Array<[number, number]>;
  spans.sort((a, b) => a[0] - b[0]);
  let stray = "";
  let cursor = 0;
  for (const [from, to] of spans) {
    if (from > cursor) stray += text.slice(cursor, from);
    cursor = Math.max(cursor, to);
  }
  stray += text.slice(cursor);

  return {
    plan: got.plan.value.trim(),
    copy_final: lines(got.copy_final.value),
    warnings: lines(got.warnings.value),
    image_prompt: got.image_prompt.value.trim(),
    missing: TAGS.filter((t) => !got[t].found),
    stray: stray.replace(/\s+/g, " ").trim(),
  };
}

/** Counts only. Never the prompt, never the copy. */
export function tagTelemetry(r: TaggedReply | null | undefined) {
  if (!r) return { tags: false };
  return {
    tags: true,
    missing: r.missing,
    copy_lines: r.copy_final.length,
    warnings: r.warnings.length,
    prompt_chars: r.image_prompt.length,
    stray_chars: r.stray.length,
  };
}
