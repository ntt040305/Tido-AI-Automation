import { CreativeJudgment } from "./CreativeDirectorV1";
import { resolveSelectedDirection } from "./CreativeDirectionResolver";
import { reconcileCopyRoles } from "./CreativeDecision";
import { specFor } from "../../director/visual-controls.types";

/**
 * Feature 4 — the experiment's prompt shape for Nano Banana 2.
 *
 * Where this runs, and why there
 * ------------------------------
 * On the prompt the stable compiler already produced, immediately before the
 * provider call, inside a wrapper the experiment installs through the
 * orchestrator's existing `generationProvider` option. That placement is the
 * whole reason no stable file changed: the compiler, the optimizer, the
 * knowledge system and the art-direction resolver all run exactly as they do on
 * stable, and this reorders and extends what they produced.
 *
 * It also puts the experiment downstream of `ProviderPromptOptimizer`, which
 * enforces a 20,000-character ceiling. Nano Banana 2 has no such limit, and this
 * phase is explicitly told not to optimise by shortening — so the judgment
 * sections are appended after that ceiling has already been applied. Stable
 * prompts stay inside 20,000; experiment prompts are allowed to be longer
 * because length was never the goal, signal was.
 *
 * What it reorders
 * ----------------
 * The brief asks for creative intent first and execution detail last. The stable
 * prompt already carries most of those sections; it orders them by authority
 * (what overrides what) rather than by reading order. This lifts the sections
 * that carry intent to the front and leaves the rest in their existing relative
 * order, because reordering sections whose content assumes a neighbour is how a
 * prompt acquires contradictions.
 */

/**
 * Section headings in the order Feature 4 asks for.
 *
 * Matched against the `## HEADING` lines the stable template emits. Anything not
 * listed keeps its original position after the listed ones — an unknown section
 * is more likely to be a requirement than a rationale, and guessing where it
 * belongs is worse than leaving it where the compiler put it.
 */
const PRIORITY_ORDER = [
  "ROLE",
  "CREATIVE INTENT",
  "CAMPAIGN STRATEGY",
  "PRODUCT IDENTITY",
  "PRODUCT INSTANCE REQUIREMENTS",
  "REFERENCE SEMANTICS",
  "BRAND KNOWLEDGE",
  "USER HARD REQUIREMENTS",
  "ART DIRECTION",
  "COMMERCIAL LAYOUT",
  "TYPOGRAPHY & READABLE COPY",
  "PROFESSIONAL KNOWLEDGE",
  "CREATIVE EXECUTION",
  "OUTPUT CONTEXT",
  "CONFLICT PRIORITY",
  "FINAL OUTPUT",
];

function headingOf(section: string): string {
  const first = section.split("\n")[0] || "";
  return first.replace(/^#+\s*/, "").trim().toUpperCase();
}

/** Splits a compiled prompt into its preamble and `## `-delimited sections. */
function split(prompt: string): { preamble: string; sections: string[] } {
  const parts = prompt.split(/\n(?=## )/);
  if (!parts.length) return { preamble: prompt, sections: [] };
  const first = parts[0].startsWith("## ") ? "" : parts.shift() || "";
  return { preamble: first, sections: parts };
}


/**
 * Typography Foundation Cleanup V1.
 *
 * Both repairs happen here rather than where the defects are, and that is a
 * constraint of the phase rather than a preference: both defects live in stable
 * files this phase may not touch. What this position buys is worth stating
 * anyway — the composer runs inside the provider wrapper, downstream of
 * `ProviderPromptOptimizer`, `PromptBudgetManagerService` and
 * `PromptBudgetValidator`. Three times in this system a change that added
 * prompt content passed its tests while silently pushing a different section
 * out of the budget. Nothing written here can do that, because every budget
 * stage has already run. Both repairs are also rewrites rather than additions,
 * so the prompt gains no second opinion on a question it already answers.
 */
export interface TypographyFixes {
  /** Role assignments from the director, unvalidated. */
  copyRoles?: Array<{ text?: string; role?: string; reason?: string }> | null;
  /** The typography direction the director decided, and why. */
  typographyDirection?: { choice: string; reason: string } | null;
  /**
   * True when the user pinned a typography control themselves.
   *
   * The loop is only broken where the machine created it. A control the user
   * clicked is the client speaking, and a creative decision does not outrank the
   * client — `VisualDirectionResolver` already ranks `user_selected` above
   * everything, and this must not quietly invert that.
   */
  typographyUserPinned?: boolean;
}

/**
 * A copy line as the stable compiler emits it, in both of its forms:
 *   "Ra mắt"  — supplied as: headline
 *   "Ra mắt"
 */
const COPY_LINE = /^"([^"]+)"(?:\s+\u2014 supplied as: .+)?\s*$/;

/** The sentence the compiler prints under the copy list when any role was set. */
const ROLE_DISCLAIMER =
  "The roles above are what the client called each string, not an instruction about size or position.";

const norm = (v: string): string => v.replace(/\s+/g, " ").trim().toLowerCase();

export class NanoBananaPromptComposer {
  /**
   * Reorders the compiled prompt and appends the creative judgment.
   *
   * Returns the input unchanged when there is no judgment to add, so a failed
   * director call produces the stable prompt rather than a reshuffled one — a
   * reorder with nothing new to say is a change with no upside.
   */
  public static compose(
    compiledPrompt: string,
    judgment: CreativeJudgment | null,
    /**
     * Control mode. The direction already governs the prompt from inside, so
     * appending it again would recreate the duplication this mode exists to
     * remove — the same scene stated twice reads as two scenes to a renderer
     * that has no way to know they are the same one.
     *
     * The reasoning is not lost by being unstated. Its job was to produce the
     * decision, and the decision is what travels; an explanation of a choice,
     * placed after the instruction to render, is the ambiguity the audit found.
     */
    controlled = false,
    /**
     * Typography Foundation Cleanup V1. Absent when both flags are off, which
     * makes this whole path a no-op rather than a behaviour that has to be
     * unwound.
     */
    fixes?: TypographyFixes,
    /**
     * Layout Context Bridge V1. A pre-rendered block, or nothing.
     *
     * Passed in already built rather than derived here: it needs the product
     * count, which lives in the pipeline, and the composer has never had a
     * reason to know one. Appended, never substituted — the layout section it
     * sits beside is not touched.
     */
    layoutContext?: string,
    /**
     * Layout Priority Alignment V1. Only meaningful alongside a context block:
     * rewriting the clause to name LAYOUT CONTEXT while no such section exists
     * would point the renderer at nothing, so this is gated on both.
     */
    alignLayoutPriority = false,
    /**
     * Creative Constraint Calibration V1.
     *
     * Independent of the bridge. The over-decoration it corrects comes from any
     * creative intent reaching the renderer — the judgment block carries plenty
     * on its own — so tying this to the bridge would leave the commonest path
     * uncalibrated. `productCount` is supplied because the block's closing claim
     * is about this render's attachments.
     */
    creativeConstraint?: { productCount: number },
    /**
     * Creative Bridge Calibration V1 (`creative_bridge_v1`), in control mode.
     *
     * Only meaningful alongside `controlled`. In an uncontrolled run the whole
     * judgment is appended already, so there is nothing for this to restore —
     * which is precisely why the flag read as inert for its whole life.
     */
    carryNonSceneReasoning = false
  ): string {
    if (!judgment) return compiledPrompt;

    let out = this.reorder(compiledPrompt);

    // Before the judgment block, so the reasoning that follows is read against
    // the context rather than the other way round. In control mode it still
    // applies: the direction governs the scene from inside the prompt, but
    // nothing in that path tells the layout section how many products there are.
    if (layoutContext) {
      out = [out, layoutContext].join("\n\n");
      // Only with a context present. The replacement clause names LAYOUT
      // CONTEXT, and naming a section the prompt does not contain would be
      // worse than the sentence it replaced.
      if (alignLayoutPriority) {
        const aligned = this.applyLayoutPriority(out);
        console.log("[EXPERIMENT][LAYOUT_PRIORITY]", {
          mode: aligned.mode,
          delta: aligned.prompt.length - out.length,
        });
        out = aligned.prompt;
      }
    }

    // Phase 0.3. Control mode used to emit nothing here; it now emits the half
    // of the judgment its rewritten brief does not already contain, when the
    // bridge flag asks for it. Without the flag the old behaviour stands, so
    // enabling control mode alone changes nothing that was not already true.
    if (!controlled || carryNonSceneReasoning) {
      const judgmentBlock = this.renderJudgment(judgment, controlled);
      // Appended rather than inserted near the top. The compiled prompt states
      // its own precedence rules in CONFLICT PRIORITY, and dropping a new
      // authority ahead of them would contradict a section the renderer has
      // already read. This block says what the decisions were and why, which
      // supports those sections rather than competing with them.
      if (judgmentBlock) out = `${out}\n\n${judgmentBlock}`;
    }

    // Last, deliberately. It is a constraint on everything above it — the layout
    // context, the route, the staging, the reasoning — and a constraint that
    // arrives before the thing it constrains has to be remembered rather than
    // applied. Placed here it is the final word the renderer reads about how far
    // the creative direction reaches.
    if (creativeConstraint) {
      const calibrated = this.applyCreativeConstraint(out, creativeConstraint);
      console.log("[EXPERIMENT][CREATIVE_CONSTRAINT]", {
        product_count: creativeConstraint.productCount,
        added_chars: calibrated.added,
      });
      out = calibrated.prompt;
    }

    return this.applyTypographyFixes(out, fixes);
  }

  /** Runs whichever repairs were enabled, each independently of the other. */
  /**
   * The sentence that decided every composition argument before it started.
   *
   * The compiled prompt ends its strategy section by naming a winner: "where
   * those conflict with this section, they win". Measured across Phases 1 to 5,
   * that single clause is why none of the composition reasoning the Creative
   * Decision Layer produces has ever influenced a frame — `composition_decision`
   * lands in the section the sentence declares subordinate, and so does the
   * layout context the bridge now carries. Both arrive already outranked.
   *
   * What replaces it is not "LAYOUT CONTEXT wins". Swapping which layer is
   * supreme would break the thing the old sentence was protecting: the reserved
   * zones are a contract with the compositor that will place real type over this
   * render later, and a renderer that felt free to move them would produce
   * images the typography stage cannot finish. So geometry stays binding, intent
   * becomes the thing the composition is built FROM inside that geometry, and
   * the client directive still beats both.
   *
   * Matched exactly and replaced once. If the compiler ever rewords the clause
   * this finds nothing, changes nothing and says so — a silent miss here would
   * look exactly like the flag working.
   */
  private static readonly LAYOUT_PRECEDENCE_CLAUSE =
    "The exact camera, lighting and layout are resolved in the ART DIRECTION and COMMERCIAL LAYOUT sections; " +
    "where those conflict with this section, they win, and an explicit client directive beats both.";

  private static readonly LAYOUT_PRECEDENCE_REPLACEMENT =
    "The exact camera and lighting are resolved in ART DIRECTION. COMMERCIAL LAYOUT gives the binding geometry — " +
    "reserved zones, safe margins, the space that stays clear — and those measurements are not negotiable. " +
    "LAYOUT CONTEXT gives the creative intent: why this image exists, what the products are to each other, and " +
    "where the emphasis belongs. Build the composition from the intent, inside the geometry; satisfy both rather " +
    "than choosing between them. An explicit client directive beats all of them.";

  /**
   * The short form, for prompts the clause never reached.
   *
   * Measured against the hundred renders this system has logged: 99 of them are
   * longer than the optimizer's soft threshold, and above that threshold
   * `compressSignalSections` strips precedence prose out of CAMPAIGN STRATEGY by
   * design — its META pattern matches "the exact camera, lighting and layout"
   * and "where those conflict" explicitly. So the sentence this phase was
   * written to rewrite is already gone from almost every prompt that ships.
   *
   * That makes the real production state neither "COMMERCIAL LAYOUT wins" nor
   * "satisfy both", but nothing at all — two sections describing composition
   * with no stated relationship, and a renderer left to guess. Stating it is the
   * point of the phase; replacing a sentence was only the means.
   *
   * Kept to two sentences because it is added after the optimizer has finished
   * and is therefore budget nobody upstream accounted for.
   */
  private static readonly LAYOUT_PRECEDENCE_SHORT =
    "HOW TO READ THESE TWO SECTIONS: COMMERCIAL LAYOUT gives the binding geometry — reserved zones, safe " +
    "margins, the space that stays clear — and those measurements are not negotiable. LAYOUT CONTEXT gives " +
    "the creative intent, and the composition inside that geometry is built from it. Satisfy both rather " +
    "than choosing between them.";

  /**
   * Rewrites the precedence clause so layout context is read as intent rather
   * than as a footnote — or states the relationship outright when the clause
   * never survived the optimizer.
   *
   * Returns `{ prompt, mode }` so the caller can log which of the two happened.
   * A silent no-op and a working rewrite look identical from outside, and that
   * is precisely the failure this phase would otherwise ship.
   */
  public static applyLayoutPriority(prompt: string): { prompt: string; mode: "replaced" | "stated" } {
    if (prompt.includes(this.LAYOUT_PRECEDENCE_CLAUSE)) {
      return {
        prompt: prompt.replace(this.LAYOUT_PRECEDENCE_CLAUSE, this.LAYOUT_PRECEDENCE_REPLACEMENT),
        mode: "replaced",
      };
    }
    return { prompt: [prompt, this.LAYOUT_PRECEDENCE_SHORT].join("\n\n"), mode: "stated" };
  }

  /**
   * What creative intent is allowed to do, and what it is not.
   *
   * Render validation found the previous phase working too well. Once layout
   * context stopped arriving pre-outranked, the renderer began treating creative
   * intent as a build list: a Tết coffee promotion came back with the atmosphere
   * fully realised as objects, the product placed into a scene rather than being
   * the reason for one, and a background competing with the thing being sold.
   *
   * The correction is not less intent. Intent decides how the product is
   * photographed — the framing, the light, the distance, what the eye reaches
   * first — and all of that was the point of Phases 5.1 and 5.1.5. What it never
   * meant was that a direction expressed in words is a list of props to build.
   *
   * Why there is no table in here
   * ----------------------------
   * The obvious implementation is a lookup: perfume gets an empty frame, food
   * gets ingredients, seasonal campaigns get a capped ornament budget. That is
   * the hardcoded creative rule this project has banned since its first phase,
   * and it would be wrong at exactly the moments it mattered — a perfume brand
   * whose whole story is the harvest, a food brand whose story is restraint.
   *
   * So the block states an ordering and one test: an object that is not the
   * product must be traceable to a line in this prompt and must do something for
   * the sale. That is the same grounding discipline the strategy and visual-DNA
   * layers already use, and it adapts because the prompt it points at adapts.
   * The luxury/food/seasonal cases come out differently because their briefs
   * differ, not because this file knows what a perfume is.
   */
  private static readonly CREATIVE_CONSTRAINT_BLOCK = [
    "## CREATIVE CONSTRAINT",
    "",
    "WHEN THESE PULL AGAINST EACH OTHER, THIS IS THE ORDER:",
    "1. Product identity. The uploaded product's shape, label, colour, material and proportions are facts, not starting points.",
    "2. What this image has to achieve commercially.",
    "3. The creative intent stated above.",
    "4. Atmosphere and environment.",
    "Fourth means it yields to the three above it.",
    "",
    "WHAT THE CREATIVE INTENT DECIDES",
    "Composition, hierarchy, camera position and distance, lighting, colour, mood, and which element the eye " +
      "reaches first. Intent decides how the product is photographed.",
    "",
    "WHAT IT DOES NOT AUTHORISE",
    "It does not ask for objects to be added. A direction written in words is not a list of props to build. " +
      "Reach atmosphere first through light, colour, depth of field, surface and framing — the ways a " +
      "photographer builds mood without adding anything to the frame.",
    "",
    "BEFORE PUTTING ANYTHING IN THE FRAME THAT IS NOT THE PRODUCT",
    "Point to the line in this prompt that asks for it, and say what it does for the sale. An element that makes " +
      "the product more wanted, more understood or more trusted has earned its place. One that only signals the " +
      "theme has not, and belongs in the lighting and the colour instead. If two things compete for the eye, " +
      "one of them is decoration.",
    "",
    "THIS IS NOT AN INSTRUCTION TO EMPTY THE FRAME",
    "A full frame and a bare one are both correct answers. What is not correct is fullness that is not working.",
  ].join("\n");

  /**
   * The line that only makes sense when real product photographs were attached.
   *
   * Kept separate because it is a claim about this render's inputs, and a prompt
   * with no uploaded product would be asserting something untrue.
   */
  private static productSubjectLine(productCount: number): string {
    if (productCount < 1) return "";
    return (
      `\n\nTHE ${productCount === 1 ? "PRODUCT IN THIS FRAME IS" : `${productCount} PRODUCTS IN THIS FRAME ARE`} ` +
      `SUPPLIED AS ${productCount === 1 ? "A PHOTOGRAPH" : "PHOTOGRAPHS"}. ` +
      `${productCount === 1 ? "It is" : "They are"} the subject. Nothing added to the frame may overlap ` +
      `${productCount === 1 ? "it" : "them"}, obscure ${productCount === 1 ? "its" : "their"} outline, or hold ` +
      `more contrast than ${productCount === 1 ? "it does" : "they do"}.`
    );
  }

  /**
   * Appends the constraint block. Pure string work; returns the added length so
   * the caller can log what it cost.
   */
  public static applyCreativeConstraint(
    prompt: string,
    opts: { productCount: number }
  ): { prompt: string; added: number } {
    const block = this.CREATIVE_CONSTRAINT_BLOCK + this.productSubjectLine(opts.productCount);
    return { prompt: [prompt, block].join("\n\n"), added: block.length + 2 };
  }

  private static applyTypographyFixes(prompt: string, fixes?: TypographyFixes): string {
    if (!fixes) return prompt;
    let out = prompt;
    if (fixes.copyRoles && fixes.copyRoles.length) {
      out = this.applyCopyRoles(out, fixes.copyRoles);
    }
    if (fixes.typographyDirection && fixes.typographyDirection.choice) {
      out = this.applyTypographyPriority(
        out,
        fixes.typographyDirection,
        Boolean(fixes.typographyUserPinned)
      );
    }
    return out;
  }

  /**
   * Replaces the role claims on the copy lines with roles that were reasoned.
   *
   * The list of authorized strings is taken from the prompt itself rather than
   * from the request, so a role can only ever attach to a string the compiler
   * already decided to render. A director that translated or tidied a line
   * produces no match and therefore changes nothing.
   *
   * A line the director did not rule on loses its stable role rather than
   * keeping it. That is a deletion and it is deliberate: the stable inference is
   * the defect this repair exists for, and a list where some roles are decided
   * and others are the old guess — with nothing marking which is which — is
   * harder to act on than a list that simply leaves the question open. The
   * compiler already tells the renderer to decide treatment from the brand and
   * the format when no role is given.
   */
  private static applyCopyRoles(
    prompt: string,
    raw: Array<{ text?: string; role?: string; reason?: string }>
  ): string {
    const { preamble, sections } = split(prompt);
    const idx = sections.findIndex((sec) => headingOf(sec).includes("TYPOGRAPHY & READABLE COPY"));
    if (idx < 0) {
      console.warn("[EXPERIMENT][TYPOGRAPHY_ROLES] no copy section in the prompt \u2014 nothing rewritten");
      return prompt;
    }

    const lines = sections[idx].split("\n");
    const authorized = lines
      .map((l) => l.match(COPY_LINE))
      .filter(Boolean)
      .map((m) => (m as RegExpMatchArray)[1]);
    if (!authorized.length) {
      // No copy was authorized for this render, so there is no hierarchy to fix.
      return prompt;
    }

    const r = reconcileCopyRoles(raw, authorized);
    if (!r.applied.size) {
      console.warn("[EXPERIMENT][TYPOGRAPHY_ROLES] no assignment matched an authorized string", {
        authorized,
        unmatched: r.unmatched,
        invalid_roles: r.invalid_roles,
      });
      return prompt;
    }

    let rewritten = 0;
    let stableRolesRemoved = 0;
    const next = lines.map((line) => {
      const m = line.match(COPY_LINE);
      if (!m) return line === ROLE_DISCLAIMER ? "" : line;
      const a = r.applied.get(norm(m[1]));
      if (!a) {
        if (/supplied as:/.test(line)) stableRolesRemoved++;
        return `"${m[1]}"`;
      }
      rewritten++;
      const role = a.role.replace(/_/g, " ");
      return a.reason ? `"${m[1]}"  \u2014 ${role}. ${a.reason}` : `"${m[1]}"  \u2014 ${role}`;
    });

    // The replacement sentence. The old one said the roles came from the client,
    // which is no longer true of the lines above it, and leaving it there would
    // tell the renderer to discount the only reasoning on the page.
    const kept = next.filter((l, i) => !(l === "" && next[i - 1] === ""));
    kept.push(
      "",
      "Each role above was decided for this asset, and the sentence after it is the reason. A role says what the string is FOR, which is what should set its size, weight and position \u2014 it is not itself a size. Exactly one line is the headline. A line with no role is one nobody ruled on: decide its treatment from the picture and the format."
    );

    sections[idx] = kept.join("\n").replace(/\n{3,}/g, "\n\n");

    console.log("[EXPERIMENT][TYPOGRAPHY_ROLES]", {
      authorized: authorized.length,
      roles_applied: rewritten,
      assigned: [...r.applied.values()].map((a) => `${a.text}=${a.role}`),
      stable_roles_removed: stableRolesRemoved,
      refused_as_not_authorized: r.unmatched,
      refused_as_second_headline: r.extra_headlines,
      refused_as_unknown_role: r.invalid_roles,
    });

    return [preamble, ...sections].filter((p) => p !== "").join("\n");
  }

  /**
   * Substitutes the decided typography direction for the control string that the
   * decision itself triggered.
   *
   * The loop, measured on four of five asset types: the director names a
   * typeface, `applyCreativeDecision` writes that into the concept,
   * `VisualDirectionResolver.detectIn` reads the literal word "serif" or "sans"
   * back out of it, and the resolved option's fixed instruction is appended to
   * the user's hard requirements — the one section CONFLICT PRIORITY ranks
   * above art direction. The system's own sentence came back wearing the
   * client's authority, with the reasoning that produced it stripped off.
   *
   * This replaces that line in place. Not deletes: the numbering is stable
   * compiler output, and a typography statement at that tier is wanted — what
   * is not wanted is a preset standing in for a decision.
   */
  private static applyTypographyPriority(
    prompt: string,
    direction: { choice: string; reason: string },
    userPinned: boolean
  ): string {
    const presets = (specFor("typography")?.options || [])
      .map((o) => o.instruction)
      .filter((i): i is string => Boolean(i));
    if (!presets.length) return prompt;

    const { preamble, sections } = split(prompt);
    const idx = sections.findIndex((sec) => headingOf(sec).includes("USER HARD REQUIREMENTS"));
    if (idx < 0) return prompt;

    const lines = sections[idx].split("\n");
    let hit = -1;
    let matched = "";
    for (let k = 0; k < lines.length; k++) {
      const m = lines[k].match(/^(\d+)\.\s+(.*)$/);
      if (!m) continue;
      const preset = presets.find((p) => m[2].includes(p));
      if (preset) {
        hit = k;
        matched = preset;
        break;
      }
    }

    if (hit < 0) {
      // The loop did not fire on this render. Nothing to break.
      return prompt;
    }

    if (userPinned) {
      console.log("[EXPERIMENT][TYPOGRAPHY_LOOP] user pinned a typography control \u2014 preset kept", {
        preset: matched,
      });
      return prompt;
    }

    const n = (lines[hit].match(/^(\d+)\./) as RegExpMatchArray)[1];
    lines[hit] =
      `${n}. TYPOGRAPHY \u2014 decided for this brief: ${direction.choice}` +
      (direction.reason ? ` Why: ${direction.reason}` : "");

    sections[idx] = lines.join("\n");

    console.log("[EXPERIMENT][TYPOGRAPHY_LOOP]", {
      preset_removed: matched,
      replaced_with: direction.choice,
      reason_preserved: Boolean(direction.reason),
    });

    return [preamble, ...sections].filter((p) => p !== "").join("\n");
  }

  private static reorder(prompt: string): string {
    const { preamble, sections } = split(prompt);
    if (sections.length < 2) return prompt;

    const rank = (s: string) => {
      const h = headingOf(s);
      const i = PRIORITY_ORDER.findIndex((name) => h.includes(name));
      return i < 0 ? PRIORITY_ORDER.length : i;
    };

    // Stable sort: sections that rank equally, and every unranked section, keep
    // the order the compiler chose.
    const ordered = sections
      .map((s, i) => ({ s, i, r: rank(s) }))
      .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
      .map((x) => x.s);

    return [preamble, ...ordered].filter((p) => p !== "").join("\n");
  }

  /**
   * Phase 0.3 — which half of the judgment a control-mode run still needs.
   *
   * Control mode writes the DECISION into the brief before the pipeline runs:
   * SCENE, CAMERA, LIGHTING, COMPOSITION and TYPOGRAPHY go into the concept, and
   * staging plus the strategy route go into hardRequirements. Appending those
   * again would state one scene twice, which reads as two scenes — the defect
   * this mode exists to remove.
   *
   * But that argument only covers the four blocks that repeat those fields. It
   * was applied to all eight. Brand positioning, audience psychology, element
   * semantics and the anti-generic justification are written nowhere in the
   * rewritten brief, so suppressing them deleted reasoning the renderer never
   * received by any route — and `creative_bridge_v1` existed to push four terse
   * one-line summaries back in through hardRequirements to partly cover the loss.
   *
   * Measured on one judgment: uncontrolled carries 1,404 characters of judgment,
   * controlled carries 71, and the bridge restores four lines of it.
   *
   * `nonSceneOnly` emits the four that do not repeat the brief. Nothing else
   * about this method changes, so an uncontrolled run is byte-identical.
   */
  private static renderJudgment(j: CreativeJudgment, nonSceneOnly = false): string {
    const lines: string[] = [];

    // One reader for a decision that had four.
    //
    // This block used to access `j.selected` directly, which is the field the
    // exploration branch fills. Strategy selection is the other arm of the same
    // `if/else` in the director, so on those runs `selected` was "" and the whole
    // section was skipped while a direction had in fact been chosen and logged.
    // Three other call sites resolved the same question with their own
    // precedence, two of them the reverse of this one. `resolveSelectedDirection`
    // is now the only place that decides.
    const direction = nonSceneOnly ? null : resolveSelectedDirection(j);
    if (direction) {
      lines.push("## CREATIVE DIRECTION", "```", `CHOSEN DIRECTION: ${direction.name}`);
      // Every line below is omitted when the director left the field empty.
      // A placeholder here would be the renderer's instruction for the frame.
      if (direction.reasoning) lines.push(`WHY THIS DIRECTION: ${direction.reasoning}`);
      for (const line of direction.appearance) lines.push(`HOW IT SHOULD APPEAR: ${line}`);
      // Included on purpose. A renderer that knows an image is deliberately quiet
      // will not drift it back toward the safe version it was chosen over.
      for (const line of direction.rejectedReasons) {
        lines.push(`WHY OTHER DIRECTIONS WERE NOT USED: ${line}`);
      }
      lines.push("```");
    }

    // The chosen route, where strategy selection replaced the fixed triad.
    //
    // Only the winner travels. The candidates that were considered, the six
    // assessments behind each and the routes that were offered stop at the
    // director: a renderer handed a list of strategies is handed a menu, and a
    // menu is the template this replaced wearing a different word. That is the
    // same rule `applyCreativeDecision` follows on the control path, so both
    // modes put the same thing in front of the renderer.
    if (!nonSceneOnly && j.strategy?.selected) {
      const st = j.strategy;
      lines.push(
        "",
        "## THE ROUTE THIS BRIEF IS ANSWERED BY",
        "```",
        `CHOSEN ROUTE: ${st.selected}`
      );
      if (st.selection_reason) lines.push(`WHY THAT ROUTE HERE: ${st.selection_reason}`);
      if (st.why_not_runner_up) lines.push(`DELIBERATELY NOT: ${st.why_not_runner_up}`);
      lines.push("```");
    }

    // Order follows Part 8: concept, then who the brand is and who is looking,
    // then the visual decisions, then what the elements mean.
    //
    // Brand and audience precede the elements because they are the reason the
    // elements were chosen. A renderer that has read "restrained, precise, and
    // distrusted for being expensive" interprets a stone surface differently from
    // one that meets the same instruction cold.
    if (j.brand) {
      const b = j.brand;
      const rows = [
        b.personality ? `PERSONALITY: ${b.personality}` : "",
        b.positioning ? `POSITIONING: ${b.positioning}` : "",
        b.emotional_territory ? `EMOTIONAL TERRITORY: ${b.emotional_territory}` : "",
        b.audience_perception ? `CURRENTLY PERCEIVED AS: ${b.audience_perception}` : "",
      ].filter(Boolean);
      if (rows.length) {
        lines.push("", "## BRAND POSITIONING \u2014 WHAT THIS BRAND IS", "```", ...rows);
        // Inference is labelled rather than presented as fact. A renderer cannot
        // tell the difference, but a person reviewing the prompt can, and a brand
        // heritage nobody claimed is the kind of thing that has to be visible.
        if (b.inferred) lines.push(`INFERRED RATHER THAN GIVEN: ${b.inferred}`);
        lines.push("```");
      }
    }

    if (j.consumer) {
      const c = j.consumer;
      const rows = [
        c.viewer ? `WHO IS LOOKING: ${c.viewer}` : "",
        c.first_feeling ? `FIRST FEELING: ${c.first_feeling}` : "",
        c.trust_driver ? `WHAT MAKES IT CREDIBLE: ${c.trust_driver}` : "",
        c.desire_driver ? `WHAT CREATES WANTING: ${c.desire_driver}` : "",
        c.intended_action ? `WHAT THEY SHOULD DO: ${c.intended_action}` : "",
      ].filter(Boolean);
      const a = c.attention;
      if (a && (a.first_second || a.then || a.finally)) {
        rows.push(
          "",
          "READING ORDER \u2014 three beats, and they are not the same element:",
          a.first_second ? `  FIRST SECOND: ${a.first_second}` : "",
          a.then ? `  THEN: ${a.then}` : "",
          a.finally ? `  FINALLY: ${a.finally}` : ""
        );
      }
      const kept = rows.filter((r) => r !== "");
      if (kept.length) {
        lines.push("", "## AUDIENCE \u2014 WHAT HAPPENS IN THE VIEWER'S HEAD", "```", ...kept, "```");
      }
    }

    if (!nonSceneOnly && j.reasoning) {
      const r = j.reasoning;
      const row = (label: string, d?: { choice: string; reason: string }) =>
        d && d.choice ? `${label}: ${d.choice}\n  WHY: ${d.reason || "—"}` : "";
      const rows = [
        row("CAMERA", r.camera),
        row("LIGHTING", r.lighting),
        row("COMPOSITION", r.composition),
        row("TYPOGRAPHY", r.typography),
        row("COLOUR", r.colour),
      ].filter(Boolean);
      if (rows.length) {
        lines.push(
          "",
          "## VISUAL DECISIONS — EACH WITH ITS REASON",
          "```",
          "Every line below is a decision taken for this brief, not a default. Where",
          "the reason and the parameter disagree, the reason is what to serve.",
          "",
          ...rows,
          "```"
        );
      }
    }

    // Several products, one photograph.
    //
    // The counterweight to the isolation instructions the compiled prompt
    // already carries. Measured on a three-product render: every line that
    // mentioned the products told the renderer to keep them apart — separate
    // identities, do not clone, do not average — and nothing said they shared a
    // scene. The result was three objects in a row with no contact shadow under
    // any of them, which is the prompt working as written.
    //
    // Isolation is not weakened here. What is added is the sentence that was
    // never written beside it: that distinct identities are standing on one
    // floor, under one light, at different depths.
    if (!nonSceneOnly && j.staging) {
      const st = j.staging;
      const rel = st.relationship;
      const facts = [
        st.hierarchy ? `HIERARCHY: ${st.hierarchy}` : "",
        st.grouping ? `THEY READ AS ONE GROUP BECAUSE: ${st.grouping}` : "",
        st.shared_ground ? `ALL OF THEM STAND ON: ${st.shared_ground}` : "",
        st.light_direction ? `ONE KEY LIGHT FOR THE WHOLE GROUP: ${st.light_direction}` : "",
        st.depth_order ? `DEPTH: ${st.depth_order}` : "",
        st.interaction ? `CONTACT: ${st.interaction}` : "",
      ].filter(Boolean);
      if (facts.length) {
        lines.push(
          "",
          "## THESE PRODUCTS SHARE ONE PHOTOGRAPH",
          "```",
          "They are not separate cut-outs placed on a background. Keeping each",
          "product's identity distinct does not mean keeping them visually separate."
        );
        if (rel?.relationship_type) {
          lines.push(
            `THEY BELONG TOGETHER AS: ${rel.relationship_type}` +
              (rel.strategic_reason ? ` — ${rel.strategic_reason}` : "")
          );
        }
        if (rel?.visual_implication) lines.push(`WHICH MEANS THE PICTURE MUST SHOW: ${rel.visual_implication}`);
        lines.push("", ...facts, "```");
      }
    }

    if (j.semantics?.length) {
      lines.push(
        "",
        "## WHY THESE ELEMENTS \u2014 WHAT EACH ONE COMMUNICATES",
        "```",
        "Each element below was chosen for what it says, not for how often it appears",
        "in this category. Render the meaning, not the motif.",
        ""
      );
      for (const sem of j.semantics) {
        if (!sem?.element) continue;
        lines.push(
          `${sem.element.toUpperCase()}`,
          sem.communicates ? `  SAYS: ${sem.communicates}` : "",
          sem.why_this_brand ? `  RIGHT HERE BECAUSE: ${sem.why_this_brand}` : ""
        );
      }
      lines.push("```");
    }

    if (j.generic_check && (j.generic_check.justification || j.generic_check.flagged?.length)) {
      lines.push("", "## WHY THIS IS NOT THE CATEGORY DEFAULT", "```");
      if (j.generic_check.flagged?.length) {
        lines.push(`CATEGORY-DEFAULT ELEMENTS CONSIDERED: ${j.generic_check.flagged.join("; ")}`);
      }
      if (j.generic_check.justification) {
        lines.push(`EACH EARNS ITS PLACE BECAUSE: ${j.generic_check.justification}`);
      }
      lines.push(
        j.generic_check.revised
          ? "The direction was revised after this check; what remains is what survived it."
          : "The direction survived this check unchanged."
      );
      lines.push("```");
    }

    // The review is deliberately NOT emitted into the prompt.
    //
    // Its five answers and five scores are a judgement about the work, not an
    // instruction for making it, and a renderer told "originality 7/10" has been
    // handed a number it cannot act on. Its job is to trigger a revision BEFORE
    // this point — which it does inside the director, where a weak score sends
    // the model back to change the direction. What reaches the prompt is the
    // revised direction; the scores reach the log.
    //
    // Emitting it would also invite the renderer to aim at the score rather than
    // at the picture, which is the failure mode of every metric that leaks into
    // the thing it measures.

    return lines.join("\n").trim();
  }
}
