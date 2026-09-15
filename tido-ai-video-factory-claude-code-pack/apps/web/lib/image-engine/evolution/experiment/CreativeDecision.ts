import { CreativeJudgment } from "./CreativeDirectorV1";
import { SimpleInputRequestV1 } from "../../types";

/**
 * The Creative Decision Contract, and the one place it takes control.
 *
 * The problem this solves
 * ----------------------
 * Measured across twelve experiment prompts: the scene the Creative Director
 * chose and the scene the Marketing Brain invented had a similarity of 0.04, the
 * two CAMERA instructions in the same prompt agreed at 0.29, and on 3 of 12 one
 * scene had people in it while the other had none. The prompt described two
 * different pictures and gave the renderer no rule for choosing.
 *
 * The cause was structural rather than a bug: the director ran before the
 * orchestrator and handed it nothing, so the brain received the same vague brief
 * and reasoned independently. Two calls, one prompt, no contact.
 *
 * Why this is a request rewrite and not a new layer
 * ------------------------------------------------
 * `request.concept` is the single input that reaches all three places a visual
 * decision needs to land:
 *
 *   - `MarketingBrainService` reads it directly and builds its scene from it
 *   - `CreativeInterpretationService` parses it into camera, lighting and
 *     composition requirements, which enter `ArtDirectionResolverService` at the
 *     USER tier and therefore outrank strategy and knowledge
 *   - the compiler prints it as CREATIVE CONCEPT
 *
 * So rewriting the concept is not a trick: it is handing the brain a brief that
 * has already been art-directed, which is what a director does to a brief. The
 * brain still reasons, still writes the scene, still produces its six visual
 * fields — it simply elaborates a decided direction instead of inventing a
 * competing one. Nothing in the stable pipeline changes, because nothing in the
 * stable pipeline needs to know this happened.
 *
 * What this deliberately does not do
 * ----------------------------------
 * It does not touch product identity, references, copy, or the aspect ratio. The
 * decision governs what the picture SHOWS; it has no authority over what the
 * product IS, which is why `avoid_elements` is filtered before it is applied.
 */

export interface CreativeDecision {
  selected_direction: string;
  creative_goal: string;
  visual_story: string;
  scene_definition: string;
  camera_decision: string;
  lighting_decision: string;
  composition_decision: string;
  /**
   * What the words should behave like, given what this format is for.
   *
   * Routed through the concept rather than hardRequirements because
   * `CreativeInterpretationService` has no typography channel — it parses camera,
   * composition, lighting and material only. Typography reaches art direction by
   * a longer path: the concept is read by `MarketingBrainService`, which emits
   * `visual_translation.typography_intent`, which enters the resolver at the
   * STRATEGY tier with full confidence and beats the knowledge default.
   *
   * That path is why this belongs in the concept and not beside the avoid-list.
   */
  typography_decision: string;
  environment_decision: string;
  important_visual_elements: string[];
  avoid_elements: string[];

  // ── The bridge ─────────────────────────────────────────
  //
  // Reasoning the director already produced and that used to die here. None of
  // these describes what the picture shows — they say what it has to honour —
  // which is why they can travel without recreating the two-scene defect.
  /** How the brand behaves, with inference marked as inference. */
  brand_context: string;
  /** Who is looking, what earns their trust, and the order they read in. */
  audience_context: string;
  /** What individual elements mean, rather than that they are fashionable. */
  element_meanings: string[];
  /** The direction that was considered and turned down, and why. */
  deliberately_avoided: string;

  /**
   * What each authorized string is for, as the director judged it.
   *
   * Unvalidated here on purpose: this object does not know which strings the
   * compiler authorized, and guessing would be the invention it is meant to
   * prevent. `reconcileCopyRoles` does the matching where the authorized list
   * actually exists, which is on the compiled prompt.
   */
  copy_roles: Array<{ text: string; role: string; reason: string }>;

  /**
   * The route this brief was answered by, and why that one.
   *
   * Only these two travel. The candidates that were considered, the six
   * assessments behind each, and the routes that were offered all stop at the
   * director: a renderer handed a list of strategies is handed a menu, and a
   * menu is the template this replaced wearing a different word.
   */
  strategy_route: string;
  strategy_reason: string;

  /**
   * Why several products share this frame, and what that makes physically true.
   *
   * Travels as a counterweight, not a replacement. The isolation instructions
   * stay exactly as they are — they are the reason two products do not become a
   * hybrid — and these lines say the thing that was never said beside them:
   * that the separate identities are standing in one photograph, on one floor,
   * under one light.
   */
  product_relationship: string;
  staging_requirements: string[];
}


/**
 * The six jobs a visible string can have.
 *
 * Stable's own `CopyItemInput["type"]` has five and a different five: it carries
 * `price` and `other`, and has no way to say OFFER or SUPPORTING_TEXT. That
 * union is a stable type and is not touched here, which is why these roles
 * travel as prose on the prompt line rather than as a `type` value — the
 * compiler prints whatever role string it is handed, so the vocabulary can be
 * corrected without widening a type the stable pipeline depends on.
 */
export const COPY_ROLES = [
  "HEADLINE",
  "SUBHEADLINE",
  "CTA",
  "OFFER",
  "PRODUCT_NAME",
  "SUPPORTING_TEXT",
] as const;
export type CopyRole = (typeof COPY_ROLES)[number];

export interface CopyRoleAssignment {
  text: string;
  role: CopyRole;
  /** Why this string has this job here. Travels to the prompt with the role. */
  reason: string;
}

const normText = (s: unknown): string =>
  String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Matches the director's role assignments against the strings that are actually
 * authorized, and reports everything it refused.
 *
 * Two rules, both of which exist because of something measured rather than
 * something imagined:
 *
 *   1. A role is applied only to a string that already appears in the compiled
 *      prompt. The director is handed the copy and asked to label it, but a
 *      model asked to copy text back will occasionally translate or tidy it, and
 *      a tidied string is new copy. New copy is exactly what the identity lock
 *      exists to prevent, so an unmatched assignment is dropped, not matched
 *      loosely.
 *
 *   2. At most one HEADLINE. The defect this phase fixes is two strings sharing
 *      the top role, and a fix that permits the same thing is not a fix. Later
 *      HEADLINEs lose their role entirely rather than being demoted to a role
 *      nobody chose — the compiler then asks the renderer to decide, which is
 *      where the question belongs when the director declined to answer it.
 */
export function reconcileCopyRoles(
  raw: Array<{ text?: string; role?: string; reason?: string }> | undefined,
  authorized: string[]
): {
  applied: Map<string, CopyRoleAssignment>;
  unmatched: string[];
  extra_headlines: string[];
  invalid_roles: string[];
} {
  const applied = new Map<string, CopyRoleAssignment>();
  const unmatched: string[] = [];
  const extra_headlines: string[] = [];
  const invalid_roles: string[] = [];
  if (!Array.isArray(raw)) return { applied, unmatched, extra_headlines, invalid_roles };

  const index = new Map<string, string>();
  for (const a of authorized) index.set(normText(a), a);

  let headlineTaken = false;
  for (const item of raw) {
    const role = String(item?.role ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_") as CopyRole;
    const key = normText(item?.text);
    if (!key) continue;
    if (!COPY_ROLES.includes(role)) {
      invalid_roles.push(`${clean(item?.text)} -> ${clean(item?.role)}`);
      continue;
    }
    const exact = index.get(key);
    if (!exact) {
      unmatched.push(clean(item?.text));
      continue;
    }
    if (role === "HEADLINE") {
      if (headlineTaken) {
        extra_headlines.push(exact);
        continue;
      }
      headlineTaken = true;
    }
    applied.set(key, { text: exact, role, reason: clean(item?.reason) });
  }
  return { applied, unmatched, extra_headlines, invalid_roles };
}

/** Words that name product identity rather than a creative choice. */
const IDENTITY_TERMS =
  /\b(?:logo|packaging|label|brand mark|silhouette|bottle shape|product shape|trademark)\b/i;

const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/**
 * Derives the decision from a judgment the director already produced.
 *
 * Nothing is re-asked. Every field below comes from a judgment that has been
 * generated anyway, so control mode costs no additional LLM call over the
 * judgment features it depends on.
 */
export function toCreativeDecision(j: CreativeJudgment): CreativeDecision | null {
  // Strategy selection replaces the fixed directions, so the scene comes from the
  // candidate that won. Falling back to `directions` keeps every run that does
  // not use selection working exactly as it did.
  const winner = j.strategy
    ? j.strategy.candidates?.find((c) => c?.route === j.strategy!.selected) || j.strategy.candidates?.[0]
    : null;
  const chosen = j.directions?.find((d) => d.name === j.selected) || j.directions?.[0];
  const scene = clean(winner?.core_idea) || clean(chosen?.core_idea);

  // Without a scene there is nothing to take control WITH, and a decision object
  // carrying only a camera angle would override the brain's scene with nothing.
  //
  // Staging is the exception, and it is one because it does not take control of
  // anything: it adds physical facts about a shared scene to the hard
  // requirements and leaves the brain's scene alone. A judgment that says how
  // three products stand together is worth carrying even when it did not choose
  // what the picture shows.
  if (!scene && !j.staging) return null;

  const r = j.reasoning;
  return {
    selected_direction: clean(j.strategy?.selected) || clean(j.selected) || clean(chosen?.name),
    creative_goal:
      clean(j.strategy?.selection_reason) ||
      clean(j.selection_reason) ||
      clean(j.consumer?.intended_action),
    visual_story: clean(winner?.why_this_route) || clean(chosen?.why_it_fits),
    scene_definition: scene,
    camera_decision: clean(r?.camera?.choice),
    lighting_decision: clean(r?.lighting?.choice),
    composition_decision: clean(r?.composition?.choice),
    typography_decision: clean(r?.typography?.choice),
    environment_decision: clean(chosen?.visual_language),
    product_relationship: j.staging
      ? [
          clean(j.staging.relationship?.relationship_type),
          clean(j.staging.relationship?.strategic_reason),
        ].filter(Boolean).join(" — ")
      : "",
    // One line per physical fact. Separate entries rather than a paragraph so a
    // reducer that ever has to shorten this drops a fact, not half a sentence.
    staging_requirements: j.staging
      ? [
          j.staging.hierarchy ? `Hierarchy: ${clean(j.staging.hierarchy)}` : "",
          j.staging.grouping ? `They read as one group because: ${clean(j.staging.grouping)}` : "",
          j.staging.shared_ground ? `All of them stand on: ${clean(j.staging.shared_ground)}` : "",
          j.staging.light_direction ? `One key light for the whole group: ${clean(j.staging.light_direction)}` : "",
          j.staging.depth_order ? `Depth: ${clean(j.staging.depth_order)}` : "",
          j.staging.interaction ? `Contact: ${clean(j.staging.interaction)}` : "",
        ].filter(Boolean)
      : [],
    strategy_route: clean(j.strategy?.selected),
    strategy_reason: clean(j.strategy?.selection_reason),
    important_visual_elements: (j.semantics || [])
      .map((s) => clean(s?.element))
      .filter(Boolean)
      .slice(0, 6),
    // Only elements the generic check actually replaced. A flagged element that
    // survived scrutiny was judged right for this brief, and adding it to an
    // avoid-list would contradict the judgment that kept it.
    avoid_elements: j.generic_check?.revised
      ? (j.generic_check.flagged || []).map(clean).filter(Boolean).slice(0, 6)
      : [],

    brand_context: j.brand
      ? [
          j.brand.personality ? `behaves like ${clean(j.brand.personality)}` : "",
          j.brand.positioning ? `sits ${clean(j.brand.positioning)}` : "",
          j.brand.emotional_territory ? `can credibly make people feel ${clean(j.brand.emotional_territory)}` : "",
          // The inference marker travels with the claim rather than separately.
          // A renderer cannot tell a stated fact from a guess, but a person
          // reviewing the prompt can, and a brand history nobody claimed is
          // exactly the thing that has to stay visible.
          j.brand.inferred ? `(inferred, not stated by the client: ${clean(j.brand.inferred)})` : "",
        ].filter(Boolean).join("; ")
      : "",

    audience_context: j.consumer
      ? [
          j.consumer.viewer ? `The viewer: ${clean(j.consumer.viewer)}` : "",
          j.consumer.trust_driver ? `Credibility comes from ${clean(j.consumer.trust_driver)}` : "",
          j.consumer.desire_driver ? `Wanting comes from ${clean(j.consumer.desire_driver)}` : "",
          j.consumer.attention?.first_second
            ? `Reading order: ${clean(j.consumer.attention.first_second)}, then ${clean(j.consumer.attention.then)}, finally ${clean(j.consumer.attention.finally)}`
            : "",
        ].filter(Boolean).join(". ")
      : "",

    element_meanings: (j.semantics || [])
      .filter((s) => s?.element && s?.communicates)
      .map((s) => `${clean(s.element)} — ${clean(s.communicates)}`)
      .slice(0, 6),

    deliberately_avoided:
      clean(j.strategy?.why_not_runner_up) || clean(j.rejected_reason),

    copy_roles: (j.copy_roles || [])
      .filter((c) => c?.text && c?.role)
      .map((c) => ({ text: clean(c.text), role: clean(c.role), reason: clean(c.reason) }))
      .slice(0, 12),
  };
}

/**
 * Concept budget, enforced by the stable validator.
 *
 * `CONCEPT_LENGTH_POLICY.HARD_MAXIMUM_LIMIT` is 1,000 characters and a longer
 * concept fails validation before generation starts — measured the hard way: the
 * first version of this function produced 1,476 characters and every controlled
 * render died at stage 01 with VALIDATION_FAILED.
 *
 * So the concept carries only what has to be there, and the rest moves to
 * `hardRequirements`, which has no length limit. What "has to be there" is
 * decided by which downstream reader needs which field:
 *
 *   - the SCENE, because `MarketingBrainService` builds its scene from the
 *     concept and this is the whole point of control mode;
 *   - camera, lighting and composition, because
 *     `CreativeInterpretationService` parses THE CONCEPT into camera/lighting/
 *     composition requirements, which enter the art-direction resolver at the
 *     USER tier. Moved to hardRequirements they would still be read, but they
 *     would stop outranking the knowledge defaults, which is the behaviour this
 *     mode exists to produce.
 *
 * Everything else — the environment prose, the rationale, the include and avoid
 * lists — reads the same from `hardRequirements`, so that is where it goes.
 */
const CONCEPT_BUDGET = 960;
const SCENE_BUDGET = 330;
const DECISION_BUDGET = 110;

/** Trims at a word boundary. A sentence cut mid-word reads as corruption. */
function fit(text: string, max: number): string {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trim();
}

export function applyCreativeDecision(
  request: SimpleInputRequestV1,
  decision: CreativeDecision,
  /**
   * Carry the reasoning that does not describe the frame.
   *
   * Off by default so the bridge is a separate decision from control: control
   * changed WHICH scene is rendered, this changes how much of the thinking
   * behind it the renderer gets to see, and they can fail independently.
   */
  bridge = false
): SimpleInputRequestV1 {
  const original = clean(request.concept);

  // The scene block is emitted only when there is a scene. A decision that
  // carries staging alone must not announce that art direction has been decided
  // and then name no picture — that sentence would take authority away from the
  // brain without putting anything in its place.
  const conceptLines: string[] = decision.scene_definition
    ? [
        original,
        "",
        "ART DIRECTION HAS BEEN DECIDED FOR THIS BRIEF. Execute it rather than reinterpreting it.",
        `SCENE: ${fit(decision.scene_definition, SCENE_BUDGET)}`,
      ]
    : [original];
  if (decision.camera_decision) conceptLines.push(`CAMERA: ${fit(decision.camera_decision, DECISION_BUDGET)}`);
  if (decision.lighting_decision) conceptLines.push(`LIGHTING: ${fit(decision.lighting_decision, DECISION_BUDGET)}`);
  if (decision.composition_decision) conceptLines.push(`COMPOSITION: ${fit(decision.composition_decision, DECISION_BUDGET)}`);
  if (decision.typography_decision) conceptLines.push(`TYPOGRAPHY: ${fit(decision.typography_decision, DECISION_BUDGET)}`);

  let concept = conceptLines.join("\n");
  // A last-resort trim. It should never fire given the per-field budgets above,
  // but an unusually long original concept plus four full fields could still
  // cross the line, and failing validation is worse than losing a clause.
  if (concept.length > CONCEPT_BUDGET) concept = fit(concept, CONCEPT_BUDGET);

  // `avoid_elements` is filtered before it is applied.
  //
  // The director may name something to avoid that is also part of the product's
  // identity — "packaging", "logo", "the bottle silhouette". A creative decision
  // has no authority to remove those, and a hard requirement saying "avoid logo"
  // would fight the identity lock the whole engine exists to protect.
  const safeAvoid = decision.avoid_elements.filter((a) => !IDENTITY_TERMS.test(a));

  const hardRequirements = [...(request.hardRequirements || [])];
  // The chosen route and the reason for it, and nothing else from the strategy
  // layer. What was considered and rejected is reasoning; what was decided is an
  // instruction, and only the second belongs in front of a renderer.
  // Placed before the strategy line and the include-list so the physical facts
  // about the scene are stated before anything that decorates it.
  if (decision.staging_requirements.length) {
    hardRequirements.push(
      "These products appear in ONE photograph together, not as separate cut-outs placed on a background. " +
        (decision.product_relationship
          ? `They belong together as: ${decision.product_relationship}. `
          : "") +
        "Keeping each product's identity distinct does not mean keeping them visually separate — they share a scene:"
    );
    for (const line of decision.staging_requirements) hardRequirements.push(`  ${line}`);
  }
  if (decision.strategy_route) {
    hardRequirements.push(
      `This image answers the brief as: ${decision.strategy_route}.` +
        (decision.strategy_reason ? ` Why that route here: ${decision.strategy_reason}` : "")
    );
  }
  if (decision.environment_decision) {
    hardRequirements.push(`Render it as: ${decision.environment_decision}`);
  }
  if (decision.important_visual_elements.length) {
    hardRequirements.push(`The image must include: ${decision.important_visual_elements.join("; ")}.`);
  }
  for (const a of safeAvoid) {
    hardRequirements.push(`Do not include ${a} in the image.`);
  }

  if (bridge) {
    // Into hardRequirements rather than the concept, for two reasons. The
    // concept has a 1,000-character ceiling the validator enforces and is
    // already full; and `VisualDirectionResolver` concept-detects styling
    // vocabulary, so brand and audience prose placed there would silently
    // trigger visual-control options nobody chose. hardRequirements is read, not
    // pattern-matched.
    if (decision.brand_context) {
      hardRequirements.push(`The image must read as a brand that ${decision.brand_context}.`);
    }
    if (decision.audience_context) {
      hardRequirements.push(`Who this has to work on — ${decision.audience_context}.`);
    }
    if (decision.element_meanings.length) {
      hardRequirements.push(
        `These elements are present for what they mean, not for how they look: ${decision.element_meanings.join("; ")}.`
      );
    }
    if (decision.deliberately_avoided) {
      // A renderer that knows an image is deliberately quiet will not drift it
      // back toward the safer version it was chosen over.
      hardRequirements.push(`Deliberately not doing: ${decision.deliberately_avoided}`);
    }
  }

  return { ...request, concept, hardRequirements };
}

/** What was dropped and why, for the log. Never guesses; reports. */
export function decisionTelemetry(decision: CreativeDecision, concept?: string) {
  const dropped = decision.avoid_elements.filter((a) => IDENTITY_TERMS.test(a));
  return {
    direction: decision.selected_direction,
    strategy_route: decision.strategy_route || null,
    product_relationship: decision.product_relationship || null,
    staging_lines: decision.staging_requirements.length,
    scene_chars: decision.scene_definition.length,
    // The validator rejects a concept over 1,000 characters, so this number is
    // load-bearing rather than informational.
    concept_chars: concept ? concept.length : null,
    decisions: ["camera", "lighting", "composition", "typography"].filter(
      (k) => (decision as any)[`${k}_decision`]
    ),
    must_include: decision.important_visual_elements.length,
    avoid_applied: decision.avoid_elements.length - dropped.length,
    bridged: [
      decision.brand_context ? "brand" : "",
      decision.audience_context ? "audience" : "",
      decision.element_meanings.length ? "semantics" : "",
      decision.deliberately_avoided ? "rejected_direction" : "",
    ].filter(Boolean),
    avoid_refused_as_identity: dropped,
    copy_roles: decision.copy_roles.map((c) => `${c.text}=${c.role}`),
  };
}
