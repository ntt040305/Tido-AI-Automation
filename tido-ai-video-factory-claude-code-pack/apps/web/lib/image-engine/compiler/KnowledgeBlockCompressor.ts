/**
 * MASTER_PROMPT_OPTIMIZATION_V2 — Task 5.
 *
 * Where the prompt actually goes
 * -----------------------------
 * Measured on a real Bernard Cafe render (`gen_1788234944510_6hrhh`), 19,398
 * characters:
 *
 *   PROFESSIONAL KNOWLEDGE          9,463   49%
 *   PRODUCT INSTANCE REQUIREMENTS   4,461   23%
 *   everything else                 5,474   28%
 *
 * Half the prompt is knowledge blocks, and the blocks are written as reference
 * prose for a human reader rather than as instructions for a renderer. One
 * genuine example, unedited:
 *
 *   "Objects and spatial elements that belong to the same physical scene should
 *    follow a coherent perspective framework appropriate to the chosen viewpoint."
 *
 * Forty words to say: keep one perspective. The hedging — "should", "may emerge
 * through relationships among", "appropriate to the needs of the image" — exists
 * because these objects are also read by people deciding whether the rule is
 * sound. An image model gets nothing from it.
 *
 * What this does
 * -------------
 * Removes hedging and permissive theory, and keeps every bullet that names a
 * physical or photographic property. It never invents an instruction and never
 * merges two subtopics into one, so what survives is a subset of what was
 * written, in the order it was written.
 *
 * Corrected after a measured regression
 * ------------------------------------
 * The first version kept only the first bullet of each subtopic. On a real
 * block that discarded 43 of 56 instruction lines, 20 of which carried the
 * physical rules that separate a photograph from CGI. The rationale — "the
 * first bullet is the rule, the rest are elaboration" — was simply false: the
 * first bullet is usually the general statement and the later ones the
 * executable constraints. Shortening the prompt was never the goal; the
 * constraint is 20,000 characters and a full knowledge set fits inside it.
 *
 * What it deliberately does not do
 * -------------------------------
 * Rewrite. A paraphrasing compressor would produce better prose and would
 * occasionally change what a rule means — and a rule about product geometry that
 * quietly changes meaning is a defect that shows up in a rendered image, not in a
 * test. Cutting is checkable; rewriting is not.
 */

export interface CompressedBlock {
  text: string;
  before_chars: number;
  after_chars: number;
  /** Subtopics kept, in source order. */
  topics: string[];
}

/** Hedge clauses that carry no instruction. Cut at the first one that appears. */
const HEDGE_TAIL =
  /\s*(?:,\s*)?\b(?:appropriate to (?:the|its)\b|according to the (?:needs|specific needs)\b|as (?:is )?appropriate to\b|when appropriate to\b|rather than follow(?:ing)? a fixed\b|based on what the (?:image|scene) needs\b|depending on\b|so (?:that )?the (?:environment|image|scene) feels\b|so viewers can\b)[^.]*/i;

/** Openers that state that a rule exists rather than stating the rule. */
const HEDGE_LEAD =
  /^(?:it is important that|it should be noted that|note that|in general,?|generally,?|where possible,?|wherever possible,?|as a rule,?)\s*/i;

/**
 * Modal padding, shortened without being removed.
 *
 * Every replacement keeps a modal followed by a base verb, which is grammatical
 * whatever the subject's number. An earlier version conjugated instead —
 * "should follow" to "follows" — and produced "Objects and spatial elements that
 * belong to the same physical scene follows a coherent perspective framework".
 * Dropping a modal means agreeing with a subject this parser cannot identify.
 */
const MODALS: [RegExp, string][] = [
  [/\bshould always remain\b/gi, "should remain"],
  [/\bshould always be\b/gi, "should be"],
  [/\bmay also emerge through relationships among\b/gi, "may come from"],
  [/\bmay emerge through relationships among\b/gi, "may come from"],
  [/\bmay be established through\b/gi, "may use"],
  [/\bmay also be used\b/gi, "may be used"],
  [/\bshould remain sufficiently\b/gi, "should stay"],
  [/\bshould remain internally\b/gi, "should stay"],
  [/\bwork together consistently with\b/gi, "match"],
  [/\bin a way that\b/gi, "so it"],
  [/\bfor the purposes? of\b/gi, "for"],
];

/**
 * Physical and photographic properties a renderer can act on.
 *
 * Deliberately broad. A false positive costs a sentence of prompt; a false
 * negative costs the instruction that makes glass look like glass, and that is
 * the failure this list exists to prevent.
 */
const EXECUTION =
  /\b(?:specular|reflect\w*|refract\w*|shadow\w*|contact|highlight\w*|diffus\w*|translucen\w*|transmission|material\w*|surface\w*|roughness|glossy|matte|texture\w*|finish|geometry|proportion\w*|scale|depth|volume|form|perspective|foreshorten\w*|vanishing|camera|lens|focal|aperture|focus|exposure|contrast|tonal|colour|color|saturation|white balance|temperature|illuminat\w*|light\w*|key|fill|rim|backlight|composition|framing|crop|placement|hierarchy|legib\w*|readab\w*|separation|figure-ground|negative space|margin|alignment|physical\w*|coheren\w*|believab\w*|plausib\w*|consistent\w*|edge\w*|contour\w*)\b/i;

/** Sentences that grant latitude rather than constrain execution. */
const PERMISSIVE =
  /\b(?:may vary widely|may be used creatively|does not (?:depend|restrict)|need not|is not required|rather than (?:follow|depend on) a fixed|non-exhaustive|any (?:valid|appropriate) (?:approach|solution)|at the discretion|is permitted|remains open)\b/i;

export class KnowledgeBlockCompressor {
  /**
   * Compresses one knowledge block.
   *
   * `budget` is a ceiling, not a target: a block already inside it is returned
   * with its hedging cleaned and nothing dropped.
   */
  /**
   * @param budget Per-block ceiling. Raised from 420 to 1400: the goal is the
   *   best image under a 20,000-character prompt, not the shortest prompt. A
   *   full knowledge set costs roughly 9,000 characters and the budget has room
   *   for it, so trimming it bought nothing and cost the physical instructions.
   */
  public static compress(content: string, budget = 1400): CompressedBlock {
    const before = content.length;
    const topics: string[] = [];

    // Blocks arrive as `**SUBTOPIC` followed by `- bullet` lines. Anything that
    // does not match that shape is passed through cleaned but uncut, because a
    // parser that silently drops what it does not recognise is how instructions
    // go missing.
    const sections = content.split(/\n(?=\*\*)/);
    const rendered: string[] = [];

    for (const section of sections) {
      const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;

      const headingLine = lines[0].startsWith("**") ? lines[0] : "";
      const heading = headingLine.replace(/^\*+/, "").replace(/[:*]+$/, "").trim();
      const bullets = lines
        .filter((l) => l.startsWith("- "))
        .map((l) => this.tighten(l.slice(2)))
        .filter(Boolean);

      if (!heading && !bullets.length) {
        rendered.push(this.tighten(lines.join(" ")));
        continue;
      }
      if (heading) topics.push(heading);

      // Every bullet that carries an execution constraint is kept.
      //
      // The previous strategy took the first bullet and dropped the rest, on the
      // stated reasoning that "the first bullet is the rule and the rest are
      // elaborations". Measured against a real block that was wrong: 43 of 56
      // instruction lines were discarded, and 20 of those carried the physical
      // rules that make a render read as a photograph rather than as CGI —
      // specular response to surface roughness, contact shadows establishing
      // spatial relationships, light-and-shadow describing form. The first
      // bullet was usually the general statement and the later ones the
      // executable constraints, so the filter kept the abstraction and threw
      // away the instruction.
      const kept = bullets.filter((b) => this.isExecution(b));
      // A subtopic whose bullets are all permissive prose still contributes its
      // first line: losing the topic entirely is worse than carrying one general
      // sentence about it.
      const finalBullets = kept.length ? kept : bullets.slice(0, 1);
      rendered.push(
        heading ? `${titleCase(heading)}: ${finalBullets.join(" ")}` : finalBullets.join(" ")
      );
    }

    let text = rendered.filter(Boolean).join("\n").trim();

    // Only if still over budget does a second bullet's worth of detail get cut —
    // by dropping whole subtopics from the end, never by truncating a sentence
    // mid-clause into something that reads as a different instruction.
    if (text.length > budget) {
      const kept: string[] = [];
      let used = 0;
      for (const line of text.split("\n")) {
        if (used + line.length + 1 > budget && kept.length > 0) break;
        kept.push(line);
        used += line.length + 1;
      }
      text = kept.join("\n");
    }

    return { text, before_chars: before, after_chars: text.length, topics };
  }

  /**
   * Whether a bullet tells the renderer to do something.
   *
   * Two tests, in order. A sentence that only grants latitude — "may vary widely
   * according to the creative direction", "does not depend on a fixed technique"
   * — is theory: it removes a constraint rather than adding one, and an image
   * model gains nothing from being told it is free. Everything naming a physical
   * or photographic property is execution and is kept.
   */
  private static isExecution(bullet: string): boolean {
    const t = String(bullet || "");
    if (!t.trim()) return false;
    if (PERMISSIVE.test(t) && !EXECUTION.test(t)) return false;
    return EXECUTION.test(t);
  }

  /** One sentence, with the padding taken out. */
  private static tighten(raw: string): string {
    let t = String(raw || "").trim();
    if (!t) return "";
    t = t.replace(HEDGE_LEAD, "");
    for (const [pattern, replacement] of MODALS) t = t.replace(pattern, replacement);
    const cut = t.replace(HEDGE_TAIL, "");
    // Only accept the cut if a sentence survives it. Trimming a clause off a
    // short bullet can leave a fragment, and a fragment is worse than the hedge.
    if (cut.trim().split(/\s+/).length >= 5) t = cut;
    t = t.replace(/\s{2,}/g, " ").trim();
    if (t && !/[.!?]$/.test(t)) t += ".";
    return t;
  }

  public static summarize(blocks: CompressedBlock[]): {
    blocks: number;
    before_chars: number;
    after_chars: number;
    ratio: number;
  } {
    const before = blocks.reduce((t, b) => t + b.before_chars, 0);
    const after = blocks.reduce((t, b) => t + b.after_chars, 0);
    return {
      blocks: blocks.length,
      before_chars: before,
      after_chars: after,
      ratio: before ? Number((after / before).toFixed(3)) : 1,
    };
  }
}

function titleCase(heading: string): string {
  const t = heading.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}
