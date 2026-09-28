/**
 * What a compiled prompt's sections are worth when the prompt is too long.
 *
 * The defect this exists for
 * --------------------------
 * Two reducers run over the same prompt, one after the other, and they
 * disagreed about the same sections:
 *
 *                      ProviderPromptOptimizer   PromptBudgetManagerService
 *   ART DIRECTION      P0, never dropped         priority 4, droppable
 *   COMMERCIAL LAYOUT  P0, never dropped         priority 6, FIRST casualty
 *
 * The budget manager runs second, so its opinion is the one that reaches the
 * renderer. Measured on five production prompts: art direction reduced to 16
 * characters on four of five, commercial layout gone entirely on five of five —
 * the optimizer protected the creative signal and then handed the prompt to a
 * service that deleted it.
 *
 * What this file is, and is not
 * -----------------------------
 * It is a table. There is no class, no service, no engine and no behaviour here:
 * the reducers keep their own loops, their own thresholds and their own parsing.
 * They only stop inventing their own answer to "what is this section worth".
 *
 * Why creative signal is tier 1 and not tier 0
 * --------------------------------------------
 * Tier 0 is never dropped, so everything placed there is content the prompt is
 * required to carry no matter what. Putting the creative sections there sounds
 * protective and is not: the protected set would then exceed the budget on its
 * own, the reduction loop would run out of things it is allowed to drop, and the
 * prompt would fall through to hard truncation — a cut in the middle of a
 * sentence, which loses more than dropping one section whole.
 *
 * So creative signal is droppable, and is the LAST thing dropped. That is a
 * guarantee the system did not have before, and it is the strongest one
 * available without raising a ceiling, which is out of scope here.
 *
 * Ordering, not importance
 * ------------------------
 * A lower tier is kept longer. The numbers say what leaves first when a prompt
 * is over budget; they do NOT say which instruction wins when two instructions
 * contradict each other. That second question is answered by the prompt's own
 * `## CONFLICT PRIORITY` section, which is a different ranking with different
 * contents, and the two must not be merged.
 */

/** Never dropped. Control scaffolding, product truth, and the client's own words. */
export const TIER_PROTECTED = 0;
/** The reasoning that says why this picture should exist. Dropped last. */
export const TIER_CREATIVE = 1;
/** Anything nobody has classified. Ordinary content, dropped after the tiers below. */
export const TIER_ORDINARY = 2;
/** Useful craft knowledge and output metadata. */
export const TIER_SUPPORTING = 3;
/** Background the image still reads without. */
export const TIER_BACKGROUND = 4;
/** Prose that explains the prompt to a human rather than instructing the model. */
export const TIER_EXPLANATORY = 5;

export interface SectionPolicyRule {
  match: RegExp;
  tier: number;
  /** Why this section sits where it does. Read by people, not by code. */
  note: string;
}

/**
 * Evaluated in order; the first match wins.
 *
 * Names are the `## HEADING` text and the bracketed block titles this engine
 * emits. A bracketed block that sits inside a heading does not need an entry —
 * `PromptBudgetManagerService.parseSections` gives it the tier of the heading
 * that owns it.
 */
export const PROMPT_SECTION_POLICY: SectionPolicyRule[] = [
  // ── 0 — never dropped ──────────────────────────────────────────────────
  { match: /^ROLE$/i, tier: TIER_PROTECTED, note: "Without it the model does not know what to emit." },
  { match: /^CONFLICT PRIORITY$/i, tier: TIER_PROTECTED, note: "The rule for resolving every other instruction." },
  { match: /^FINAL OUTPUT$/i, tier: TIER_PROTECTED, note: "The closing render instruction." },

  { match: /^USER BRIEF$/i, tier: TIER_PROTECTED, note: "What the client actually asked for." },
  { match: /^USER HARD REQUIREMENTS$/i, tier: TIER_PROTECTED, note: "Client constraints. Was droppable at priority 2, which meant an oversized prompt could discard the client's own requirements." },
  { match: /^TYPOGRAPHY & READABLE COPY$/i, tier: TIER_PROTECTED, note: "Carries the customer's exact words, which are immutable. Losing it produces an image with wrong or invented text." },
  { match: /^TYPOGRAPHY ART DIRECTION$/i, tier: TIER_PROTECTED, note: "Protected production-critical typography art direction. Master Prompt single source of typography truth." },
  { match: /^TYPOGRAPHY$/i, tier: TIER_PROTECTED, note: "Protected typography direction." },
  { match: /^TEXT IN THE IMAGE.*$/i, tier: TIER_PROTECTED, note: "Immutable text directive." },
  { match: /^EXACT COPY.*$/i, tier: TIER_PROTECTED, note: "Exact copy mandate." },

  { match: /^PRODUCT IDENTITY$/i, tier: TIER_PROTECTED, note: "What the product IS. An image with the wrong product cannot be repaired." },
  { match: /^PRODUCT INSTANCE REQUIREMENTS$/i, tier: TIER_PROTECTED, note: "Identity lock from reference evidence." },
  { match: /^MULTI-PRODUCT IDENTITY ISOLATION$/i, tier: TIER_PROTECTED, note: "Keeps two products from blending into one." },
  { match: /^REFERENCE SEMANTICS$/i, tier: TIER_PROTECTED, note: "What the reference image may and may not contribute." },
  { match: /^REFERENCE INTERPRETATION$/i, tier: TIER_PROTECTED, note: "Same lock, stated for the interpretation path." },
  { match: /^SINGLE REFERENCE POLICY$/i, tier: TIER_PROTECTED, note: "Reference identity lock." },
  { match: /^INSPIRATION REFERENCE — SUBJECT LOCK$/i, tier: TIER_PROTECTED, note: "Subject lock. Previously unclassified here and therefore droppable." },
  { match: /^VIEWPOINT DECOUPLING$/i, tier: TIER_PROTECTED, note: "Stops the reference's camera angle being copied as the product's shape." },
  { match: /^SCENE-NATIVE PRODUCT INTEGRATION$/i, tier: TIER_PROTECTED, note: "Keeps the product physically in the scene rather than pasted onto it." },

  // ── 1 — the creative signal, dropped last ──────────────────────────────
  //
  // These five are what the Creative Director reasoned out. They do not make the
  // image correct — tier 0 does that — they make it a considered picture rather
  // than a generic one. An image that loses them still renders; it renders
  // without a reason to exist.
  { match: /^CREATIVE INTENT$/i, tier: TIER_CREATIVE, note: "Creative Intent — the communication goal this image is answering." },
  { match: /^CAMPAIGN STRATEGY$/i, tier: TIER_CREATIVE, note: "Creative Strategy — the campaign DNA that makes separate renders read as one campaign." },
  { match: /^ART DIRECTION$/i, tier: TIER_CREATIVE, note: "Art Direction — the single resolved decision from eight dimensions and five tiers of arbitration. Was priority 4." },
  { match: /^COMMERCIAL LAYOUT$/i, tier: TIER_CREATIVE, note: "Layout reasoning — attention budget, reading order and reserved space. Was priority 6, the first casualty of every oversized prompt." },
  { match: /^CREATIVE & RENDER CONSTRAINTS$/i, tier: TIER_CREATIVE, note: "The execution constraints that come with the creative decision. Was priority 6." },

  // ── 3 — useful, not load-bearing ───────────────────────────────────────
  { match: /^PROFESSIONAL KNOWLEDGE$/i, tier: TIER_SUPPORTING, note: "Retrieved craft knowledge. Divisible: the compiler already trims it block by block before this table is consulted." },
  { match: /^OUTPUT CONTEXT$/i, tier: TIER_SUPPORTING, note: "Use case and aspect ratio, both stated elsewhere too." },
  { match: /^CREATIVE EXECUTION$/i, tier: TIER_SUPPORTING, note: "Execution notes downstream of the decision." },

  // ── 4 — background ─────────────────────────────────────────────────────
  { match: /^BRAND KNOWLEDGE$/i, tier: TIER_BACKGROUND, note: "Brand background. The image still reads without it." },

  // ── 5 — written for a human reader, not for the model ──────────────────
  { match: /^KNOWLEDGE IS NON-EXHAUSTIVE$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^OPEN-WORLD PRODUCT REASONING$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^FULL CREATIVE AUTHORITY$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^INTERNAL FINAL CHECK$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^RETRIEVAL EXPLANATION$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^REASONING EXPLANATION$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^KNOWLEDGE METADATA$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^STRATEGY EXPLANATION$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
  { match: /^AUDIENCE ANALYSIS$/i, tier: TIER_EXPLANATORY, note: "Explanation." },
];

/**
 * The tier for a section name, or `TIER_ORDINARY` when nothing matches.
 *
 * An unrecognised section is ordinary content rather than the first thing to
 * throw away: a block emitted by a layer nobody updated this table for is far
 * more likely to be a requirement than a rationale.
 */
export function tierFor(name: string): number {
  const clean = String(name || "").replace(/^\[|\]$/g, "").trim();
  for (const rule of PROMPT_SECTION_POLICY) {
    if (rule.match.test(clean)) return rule.tier;
  }
  return TIER_ORDINARY;
}

/** True when a section carries creative reasoning rather than fact or scaffolding. */
export function isCreativeSignal(name: string): boolean {
  return tierFor(name) === TIER_CREATIVE;
}

/** True when the reduction loops may never drop this section. */
export function isProtected(name: string): boolean {
  return tierFor(name) === TIER_PROTECTED;
}
