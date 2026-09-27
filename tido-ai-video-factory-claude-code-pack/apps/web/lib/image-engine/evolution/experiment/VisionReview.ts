import type { CreativeBlueprint } from "./CreativeBlueprint";
import type { CompositionPlan } from "./CompositionPlan";
import type { TypographyDNA, TypographyTreatment } from "./TypographyDNA";
import { TREATMENT_AXES } from "./TypographyDNA";
import { normalizeHex } from "./BrandKit";
import type { CompositionMap } from "./CompositionMap";
import type { EditableDesign, TextLayer } from "./EditableDesign";
import type { VisionAnalysisResult } from "./VisionAnalysisResult";

/**
 * Phase 7 — the render, judged against the decisions that produced it.
 *
 * WHAT WAS ALREADY HERE, AND WHAT WAS NOT
 * ---------------------------------------
 * `VisionAnalyzerService` already shows the rendered bytes to a model and
 * returns what it saw. `TypographyCritique` already measures duplicate text,
 * collisions and contrast. `VisionCorrectionBridge` already turns findings into
 * corrections. All of that answers "what is wrong with this picture".
 *
 * None of it answers the question this layer exists for: **did the picture do
 * what was decided?** The observation layer predates `CompositionPlan`,
 * `TypographyDNA` and the blueprint's `intent` section, so it has never had the
 * decisions to compare against. A render can be free of defects and still be
 * the wrong advertisement.
 *
 * NOT A BEAUTY SCORE
 * ------------------
 * There is no number here for how good the picture looks. A technically
 * excellent image that expresses a different idea has failed, and a score would
 * hide that behind an average. Every dimension answers one question -- was the
 * decision honoured -- with `aligned`, `partial`, `missed` or `unknown`, and
 * `unknown` is used whenever nobody actually looked.
 *
 * ROOT CAUSE, NOT JUST A COMPLAINT
 * --------------------------------
 * Every issue names the layer that owns it, decided by one rule:
 *
 *     THE OWNER IS THE LAYER WHOSE OUTPUT DOES NOT MATCH ITS OWN INPUT.
 *
 * If the plan asked for a macro and the frame is wide, the plan was fine and
 * the PROMPT failed to carry it. If the frame matches the plan but the plan does
 * not serve the idea, the COMPOSITION is at fault. If plan and frame agree and
 * the idea itself is not in the picture, the BLUEPRINT decided the wrong thing.
 * Reporting "wrong camera" without that cascade sends the fix to the wrong
 * place, and the next render fails the same way.
 *
 * Deterministic. No model call of its own: it consumes an observation someone
 * else already paid for, and everything it can measure it measures.
 */

export type DecisionOwner =
  | "CreativeBlueprint"
  | "CompositionPlan"
  | "TypographyDNA"
  | "PromptCompiler"
  | "Renderer"
  | "Unattributed";

/** Whether a decision survived into the picture. Never a quality score. */
export type Alignment = "aligned" | "partial" | "missed" | "unknown";

export type Severity = "blocking" | "major" | "minor";

export interface AlignmentFinding {
  alignment: Alignment;
  /** What was decided, in the deciding layer's own words. */
  intended: string;
  /** What the picture shows. Measured where possible, observed where not. */
  observed: string;
  /** How the comparison was made, including when it could not be. */
  because: string;
  /** True when this rests on a model's words rather than on a measurement. */
  from_observation: boolean;
}

export interface VisionIssue {
  /** What is wrong, in one sentence. */
  what: string;
  severity: Severity;
  owner: DecisionOwner;
  /** Why that owner: which layer's output failed to match its own input. */
  because: string;
  /** What that owner should decide differently. Never a prompt string. */
  improvement_direction: string;
}

export interface VisionReview {
  /** What happened, about the IDEA rather than about the craft. */
  overall_assessment: string;
  /** The question the phase exists to answer. */
  achieved_creative_goal: "yes" | "partly" | "no" | "unknown";
  creative_alignment: AlignmentFinding;
  composition_alignment: AlignmentFinding;
  typography_alignment: AlignmentFinding;
  product_visibility: AlignmentFinding;
  visual_hierarchy: AlignmentFinding;
  brand_consistency: AlignmentFinding;
  detected_issues: VisionIssue[];
  /** The worst severity present, or "none". */
  severity: Severity | "none";
  /** What to change, one line per owner with something to change. */
  improvement_direction: string[];
  /** Dimensions nobody could judge, and why. Never silently omitted. */
  not_judged: string[];
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const shorten = (s: string, n = 110) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** Nothing was judged. The only shape allowed to exist without an observation. */
function unknownFinding(why: string): AlignmentFinding {
  return { alignment: "unknown", intended: "", observed: "", because: why, from_observation: false };
}

export interface VisionReviewInput {
  /** What a model saw. Absent, every observed dimension is `unknown`. */
  analysis?: VisionAnalysisResult | null;
  /** What the composition decided. */
  plan?: CompositionPlan | null;
  /** What the typography decided. */
  dna?: TypographyDNA | null;
  /** What the creative layer decided. */
  blueprint?: CreativeBlueprint | null;
  /** The frame as measured from the returned pixels. */
  map?: CompositionMap | null;
  /** What was actually composited, when hybrid typography ran. */
  design?: EditableDesign | null;
}

/**
 * Reviews the render against its decisions. Pure and total.
 *
 * Measurement first, observation second. Where the returned pixels can answer
 * the question -- is the product where the plan put it, did the type get the
 * treatment the DNA chose -- the answer is measured and the model's opinion is
 * not consulted. The model is only asked about things a measurement cannot
 * reach, and every finding says which it was.
 */
export function buildVisionReview(input: VisionReviewInput): VisionReview {
  const analysis = input.analysis ?? null;
  const looked = Boolean(analysis?.analyzed_image);
  const plan = input.plan ?? null;
  const dna = input.dna ?? null;
  const map = input.map ?? null;
  const design = input.design ?? null;

  const issues: VisionIssue[] = [];
  const not_judged: string[] = [];

  const composition_alignment = judgeComposition(plan, map, issues);
  const typography_alignment = judgeTypography(dna, design, issues, analysis);
  const product_visibility = judgeProduct(plan, map, analysis, issues);
  const visual_hierarchy = judgeHierarchy(plan, map, issues);
  const creative_alignment = judgeCreative(input.blueprint, plan, analysis, looked, composition_alignment, issues);
  const brand_consistency = judgeBrand(analysis, looked, issues);

  const all: Array<[string, AlignmentFinding]> = [
    ["creative alignment", creative_alignment],
    ["composition alignment", composition_alignment],
    ["typography alignment", typography_alignment],
    ["product visibility", product_visibility],
    ["visual hierarchy", visual_hierarchy],
    ["brand consistency", brand_consistency],
  ];
  for (const [name, f] of all) if (f.alignment === "unknown") not_judged.push(`${name}: ${f.because}`);

  // Issues the model raised that this layer cannot attribute. Carried rather
  // than dropped: an unattributed problem is still a problem, and pretending
  // it has an owner would send the fix somewhere arbitrary.
  for (const note of analysis?.issues ?? []) {
    const what = clean(note.what);
    if (!what) continue;
    if (issues.some((i) => i.what.toLowerCase().includes(what.toLowerCase().slice(0, 24)))) continue;
    issues.push({
      what,
      severity: note.confidence === "high" ? "major" : "minor",
      owner: "Unattributed",
      because: "the model reported this and no decision it contradicts could be identified",
      improvement_direction: "needs a person to decide which layer this belongs to",
    });
  }

  const severity: VisionReview["severity"] = issues.some((i) => i.severity === "blocking")
    ? "blocking"
    : issues.some((i) => i.severity === "major")
      ? "major"
      : issues.length
        ? "minor"
        : "none";

  const decided = all.filter(([, f]) => f.alignment !== "unknown");
  const missed = decided.filter(([, f]) => f.alignment === "missed").length;
  const partial = decided.filter(([, f]) => f.alignment === "partial").length;
  const achieved_creative_goal: VisionReview["achieved_creative_goal"] =
    creative_alignment.alignment === "unknown" && !decided.length
      ? "unknown"
      : missed > 0
        ? "no"
        : partial > 0
          ? "partly"
          : "yes";

  return {
    overall_assessment: assess(achieved_creative_goal, decided.length, missed, partial, issues, input.blueprint),
    achieved_creative_goal,
    creative_alignment,
    composition_alignment,
    typography_alignment,
    product_visibility,
    visual_hierarchy,
    brand_consistency,
    detected_issues: issues,
    severity,
    improvement_direction: directionsFor(issues),
    not_judged,
  };
}

/**
 * What happened, stated about the idea.
 *
 * Deliberately not a score. "7.4/10" cannot distinguish a beautiful picture of
 * the wrong idea from an ordinary picture of the right one, and those two need
 * opposite fixes.
 */
function assess(
  achieved: VisionReview["achieved_creative_goal"],
  judged: number,
  missed: number,
  partial: number,
  issues: VisionIssue[],
  bp: CreativeBlueprint | null | undefined,
): string {
  if (!judged) return "Nothing could be compared: no decisions and no observation reached this review.";
  const idea = clean(bp?.concept?.big_idea?.value);
  const head =
    achieved === "yes"
      ? `The render carries the decisions it was made from${idea ? `, and the idea behind it — ${shorten(idea, 70)} — survives into the frame` : ""}.`
      : achieved === "partly"
        ? `The render carries most of its decisions, with ${partial} honoured only in part.`
        : `The render does not carry ${missed} of the ${judged} decisions it was made from${idea ? `, so the idea — ${shorten(idea, 60)} — is not what the frame shows` : ""}.`;
  const owners = [...new Set(issues.filter((i) => i.owner !== "Unattributed").map((i) => i.owner))];
  return owners.length ? `${head} The layers to change are: ${owners.join(", ")}.` : head;
}

function directionsFor(issues: VisionIssue[]): string[] {
  const byOwner = new Map<DecisionOwner, string[]>();
  for (const i of issues) {
    if (i.owner === "Unattributed") continue;
    byOwner.set(i.owner, [...(byOwner.get(i.owner) ?? []), i.improvement_direction]);
  }
  return [...byOwner.entries()].map(([owner, lines]) => `${owner}: ${[...new Set(lines)].join("; ")}`);
}

// ── composition: measured against the plan ────────────────────────────────

/**
 * Did the frame come back composed the way the plan asked?
 *
 * Measured, not asked. The composition map is arithmetic over the returned
 * pixels, and a model asked whether a product is where it was asked to be will
 * sometimes agree about a frame it just described differently.
 *
 * The owner here is always the PROMPT layer: the plan is the input and the
 * render is the output, so a disagreement between them is a transmission
 * failure, not a planning one. Whether the plan itself was wrong is a different
 * question, judged under creative alignment.
 */
function judgeComposition(plan: CompositionPlan | null, map: CompositionMap | null, issues: VisionIssue[]): AlignmentFinding {
  if (!plan || plan.product_position.from === "absent") {
    return unknownFinding("no composition decided where the product should be");
  }
  if (!map) return unknownFinding("the returned frame was never measured");
  if (!map.product) {
    // ABSENCE OF EVIDENCE, NOT EVIDENCE OF ABSENCE.
    //
    // This raised a BLOCKING "the frame has no product" on a live render of a
    // white detergent bottle on a white ground -- the product filled a third
    // of the frame. `CompositionMap.product` is the busiest coherent region,
    // and a low-contrast product on a matching ground has no region busier
    // than the rest. The measurement could not locate it; that is a limit of
    // the measurement, and reporting it as a render failure would send someone
    // to fix a picture that was correct.
    return unknownFinding(
      "the frame has no region busier than the rest, which is what a low-contrast product on a matching ground looks like: the measurement cannot locate the product here",
    );
  }

  const want = plan.product_position.value;
  const got = map.product;
  const wantCx = want.x + want.width / 2;
  const wantCy = want.y + want.height / 2;
  const gotCx = got.x + got.width / 2;
  const gotCy = got.y + got.height / 2;
  const drift = Math.hypot(wantCx - gotCx, wantCy - gotCy);
  // A third of the frame. Below it the product is recognisably where it was
  // asked to be; above it the plan and the picture disagree about the layout,
  // and the copy was placed for the plan.
  const MOVED = 33;
  const NUDGED = 18;

  const observed = `${labelFor(gotCx, gotCy)}, about ${Math.round(got.width)}%×${Math.round(got.height)}%`;
  const intended = `${want.label}, about ${want.width}%×${want.height}%`;
  if (drift > MOVED) {
    issues.push({
      what: `the product came back ${labelFor(gotCx, gotCy)} when the composition placed it ${want.label}`,
      severity: "major",
      owner: "PromptCompiler",
      because: "the composition's placement is the input and the render is the output; they disagree, so the instruction did not carry",
      improvement_direction: "make the product's position explicit in the prompt and check no later section restates it differently",
    });
    return { alignment: "missed", intended, observed, because: `measured: the product's centre is ${Math.round(drift)}% of the frame from where it was placed`, from_observation: false };
  }
  return {
    alignment: drift > NUDGED ? "partial" : "aligned",
    intended,
    observed,
    because: `measured: the product's centre is ${Math.round(drift)}% of the frame from where it was placed`,
    from_observation: false,
  };
}

function labelFor(x: number, y: number): string {
  const v = y < 34 ? "upper" : y > 66 ? "lower" : "centre";
  const h = x < 40 ? "left" : x > 60 ? "right" : "centre";
  return v === "centre" && h === "centre" ? "centre" : `${v} ${h}`;
}

// ── typography: measured against the DNA ──────────────────────────────────

/**
 * Did the type get the treatment that was decided for it?
 *
 * The design records what was actually composited, so this is a comparison of
 * two structures rather than a reading of pixels. The owner is TypographyDNA
 * only when the DECISION is the problem; a treatment that was decided and then
 * not applied is the compositor's failure, and the two are distinguished by
 * which side of the comparison is empty.
 */
function judgeTypography(
  dna: TypographyDNA | null,
  design: EditableDesign | null,
  issues: VisionIssue[],
  analysis: VisionAnalysisResult | null,
): AlignmentFinding {
  // What the critique MEASURED on the render outranks what the design records.
  //
  // A live render came back with every client line drawn twice -- once
  // composited and once painted by the image model, which had been told to
  // draw none -- and this function called typography "aligned" because the
  // composited layer matched its decision perfectly. It did. The picture was
  // still wrong, and the existing critique had already said so.
  const critique = analysis?.typography_critique as { findings?: Array<{ area?: string; blocking?: boolean; what?: string }> } | undefined;
  const blocking = (critique?.findings ?? []).filter((f) => f.blocking);
  if (blocking.length) {
    const duplicated = blocking.filter((f) => f.area === "duplicate_text");
    for (const f of duplicated.length ? duplicated : blocking) {
      issues.push({
        what: clean(f.what) || `a blocking ${clean(f.area) || "typographic"} fault was measured on the render`,
        severity: "blocking",
        owner: "Renderer",
        // The prompt's instruction was right and the model did not follow it.
        // By the ownership rule that is the renderer's output failing to match
        // its own input, not a decision anyone made wrongly.
        because: f.area === "duplicate_text"
          ? "the copy was composited AND drawn by the image model, which the prompt told it not to do: the instruction was correct and the output contradicts it"
          : "the critique measured this on the returned pixels, so it is what the render did rather than what was decided",
        improvement_direction: f.area === "duplicate_text"
          ? "re-render: the scene must come back with no lettering at all, and a frame that has any cannot be composited over"
          : "re-render; this is a property of the returned pixels, not of a decision",
      });
    }
    return {
      alignment: "missed",
      intended: dna ? dna.visual_behavior : "typography as composited",
      observed: `${blocking.length} blocking typographic fault${blocking.length === 1 ? "" : "s"} measured on the render`,
      because: "the typographic critique measured a fault on the returned pixels, which outranks a composited layer matching its decision",
      from_observation: true,
    };
  }
  if (!dna) return unknownFinding("no typographic direction was decided");
  const texts = (design?.layers ?? []).filter((l): l is TextLayer => l.kind === "text");
  if (!design) return unknownFinding("no composited design was available to compare against");
  if (!texts.length) {
    return {
      alignment: dna.treatment.weight === 0 ? "unknown" : "aligned",
      intended: dna.visual_behavior,
      observed: "the frame carries no type",
      because: "there is no copy in this design, so there is nothing for the treatment to have been applied to",
      from_observation: false,
    };
  }

  const headline = texts.find((t) => t.role === "headline") ?? texts[0];
  const applied = headline.treatment;
  const wanted = dna.treatment;
  const intended = dna.visual_behavior;
  if (!applied) {
    issues.push({
      what: "the typographic treatment was decided and never applied",
      severity: "major",
      owner: "Renderer",
      because: "the DNA resolved a treatment and the composited layer carries none, so the decision was lost between the two",
      improvement_direction: "carry the resolved treatment onto the text layer at composition time",
    });
    return { alignment: "missed", intended, observed: "the composited type carries no treatment", because: "compared against the composited design", from_observation: false };
  }

  // Phase 7.5: the five questions a typographic art director asks, added to
  // the existing comparison rather than to a second critic. Each is grounded
  // in something already decided or already measured -- none of them asks a
  // model whether the type "feels designed", which is a question that produces
  // a different answer every time it is asked.
  judgeTypographyIntent(dna, design, texts, headline, issues);

  const drifted = TREATMENT_AXES.filter((a) => Math.abs((wanted[a] ?? 0) - (applied[a] ?? 0)) > 0.2);
  const weightOff = Math.abs(wanted.weight - headline.font_weight) >= 200;
  const observed = describe(applied, headline.font_weight);

  if (!drifted.length && !weightOff) {
    return { alignment: "aligned", intended, observed, because: "every behaviour the DNA resolved is present on the composited layer", from_observation: false };
  }
  // Attenuation the DNA itself recorded is not a drift: it is the decision.
  const explained = drifted.filter((a) => dna.refused.some((r) => r.includes(a)));
  const unexplained = drifted.filter((a) => !explained.includes(a));
  if (unexplained.length || weightOff) {
    issues.push({
      what: `the type was set ${weightOff ? `at weight ${headline.font_weight} against a decided ${wanted.weight}` : `without the decided ${unexplained.join(" and ")}`}`,
      severity: "minor",
      owner: "Renderer",
      because: "the DNA's decision and the composited layer disagree, and nothing in the DNA's own refusals explains the difference",
      improvement_direction: "apply the resolved treatment as decided, or record why it was reduced",
    });
  }
  return {
    alignment: unexplained.length || weightOff ? "partial" : "aligned",
    intended,
    observed,
    because: explained.length
      ? `${explained.join(", ")} were reduced for reasons the DNA recorded; ${unexplained.length ? `${unexplained.join(", ")} were not` : "nothing else drifted"}`
      : "compared behaviour by behaviour against the composited layer",
    from_observation: false,
  };
}

/**
 * Phase 7.5 — the five checks, each with an actionable finding.
 *
 * "Typography bad" is not a finding. Every issue here names what it is
 * measured against and what direction to move in, because a critic that cannot
 * say which way is better has only expressed a preference.
 */
function judgeTypographyIntent(
  dna: TypographyDNA,
  design: EditableDesign,
  texts: TextLayer[],
  headline: TextLayer,
  issues: VisionIssue[],
): void {
  // ── 1. does it match the creative intent? ────────────────────────────────
  //
  // Checked against `avoid_rules`, which are the losing sides of arguments
  // this brief actually had. A direction that drifted back toward the thing it
  // argued against is the specific failure "generic" usually means.
  const applied = headline.treatment;
  if (applied) {
    const strongest = TREATMENT_AXES.reduce((a, b) => ((applied[b] ?? 0) > (applied[a] ?? 0) ? b : a), TREATMENT_AXES[0]);
    // Tolerant of a DNA written before Phase 7.5: these arrive from a stored
    // design document, which may predate the fields.
    for (const rule of dna.avoid_rules ?? []) {
      const m = /do not drift back toward ([a-z ]+):/.exec(rule);
      if (!m) continue;
      const loser = m[1].trim();
      // The only drift this layer can see: a behaviour the losing quality
      // wanted turning up at strength anyway.
      if (LOSER_WANTS[loser]?.includes(strongest) && (applied[strongest] ?? 0) >= 0.4) {
        issues.push({
          what: `the headline is set ${strongest} at ${(applied[strongest] ?? 0).toFixed(2)}, which is what ${loser} wanted — and ${loser} lost this brief's argument`,
          severity: "minor",
          owner: "TypographyDNA",
          because: `the direction records "${rule}" and the applied treatment leads with exactly that behaviour`,
          improvement_direction: `move away from ${loser}: ${shorten(dna.headline_behavior ?? dna.visual_behavior, 90)}`,
        });
      }
    }
  }

  // ── 2. does it belong to the environment? ────────────────────────────────
  //
  // Measured: the ink against the frame it sits on. Type that is light on a
  // light frame or dark on a dark one is not integrated, it is stranded.
  const scene = design.scene_content;
  const relationship = (dna.relationship_to_scene ?? "").toLowerCase();
  const wantsLight = /light type on a dark frame/.test(relationship);
  const wantsDark = /dark type on a light frame/.test(relationship);
  const ink = luminanceOf(headline.color);
  if ((wantsLight && ink < 0.35) || (wantsDark && ink > 0.65)) {
    issues.push({
      what: `the type was set ${ink < 0.35 ? "dark" : "light"} where the composition expected the opposite against this frame`,
      severity: "major",
      owner: "Renderer",
      because: `the direction says "${shorten(dna.relationship_to_scene, 70)}" and the composited ink contradicts it`,
      improvement_direction: "set the ink against the area it actually sits on, not against the frame's average",
    });
  }

  // ── 3. does the hierarchy support the message? ───────────────────────────
  //
  // Measured on the composited sizes. A subheading larger than the headline is
  // not a style opinion; it is the reading order inverted, and it was a real
  // defect in this engine before the layout work.
  const byRole = new Map(texts.map((t) => [t.role, t]));
  const head = byRole.get("headline");
  const sub = byRole.get("subheadline");
  const cta = byRole.get("cta");
  if (head && sub && sub.font_size > head.font_size) {
    issues.push({
      what: `the subheadline is set larger than the headline (${sub.font_size}px against ${head.font_size}px), so the reading order is inverted`,
      severity: "major",
      owner: "Renderer",
      because: "the hierarchy strategy puts the headline first and the composited sizes put it second",
      improvement_direction: `restore the order the strategy asked for: ${shorten(dna.hierarchy_strategy ?? "the headline is read first", 90)}`,
    });
  }
  if (head && cta && cta.font_size > head.font_size) {
    issues.push({
      what: `the call to action is set larger than the headline (${cta.font_size}px against ${head.font_size}px)`,
      severity: "minor",
      owner: "Renderer",
      because: "the action closes the read and cannot open it",
      improvement_direction: "size the action below the line that carries the idea",
    });
  }

  // ── 4. does it compete with the product? ─────────────────────────────────
  //
  // Measured against where the product actually came back, not where it was
  // planned: type over the product is the collision the whole layout engine
  // exists to avoid, and it is worth checking after the fact.
  if (scene?.product) {
    const canvas = design.canvas;
    for (const t of texts) {
      const box = {
        x: (t.x / canvas.width) * 100, y: (t.y / canvas.height) * 100,
        width: (t.width / canvas.width) * 100, height: (t.height / canvas.height) * 100,
      };
      const share = overlapShare(box, scene.product);
      if (share > 0.35) {
        issues.push({
          what: `the ${t.role} sits over ${(share * 100).toFixed(0)}% of the product, so the two compete for the same area`,
          severity: share > 0.6 ? "major" : "minor",
          owner: "CompositionPlan",
          because: "the frame came back with the product where the copy was placed, and the composition reserved that area for copy",
          improvement_direction: `${dna.relationship_to_product} — move the reserved area to where the product actually is not`,
        });
      }
    }
  }

  // ── 5. does it feel designed, or merely applied? ─────────────────────────
  //
  // The honest version of "does it look generic". Not a judgement about taste:
  // a brief that argued strongly about how the letters should behave, and then
  // got letters that do nothing at all, has lost its direction somewhere
  // between the two -- and that is measurable.
  const hasBehaviour = applied ? TREATMENT_AXES.some((a) => (applied[a] ?? 0) >= 0.12) : false;
  const askedForSomething = TREATMENT_AXES.some((a) => (dna.treatment[a] ?? 0) >= 0.25);
  if (askedForSomething && !hasBehaviour && !dna.refused.length) {
    issues.push({
      what: "the direction asked the letterforms to behave and the composited type does nothing at all, so it reads as type applied rather than designed",
      severity: "minor",
      owner: "Renderer",
      because: "a behaviour was resolved above the visibility threshold, nothing was refused, and none of it reached the layer",
      improvement_direction: `apply what was decided: ${shorten(dna.visual_behavior, 90)}`,
    });
  }
}

/**
 * Which behaviours each quality argues FOR.
 *
 * Only the ones that can be seen on a composited layer, and only for qualities
 * that appear in `avoid_rules`. It maps a losing argument to the evidence that
 * it won anyway -- it does not decide anything.
 */
const LOSER_WANTS: Record<string, string[]> = {
  diffusion: ["softness"],
  "emitted light": ["luminosity"],
  "polished surface": ["sheen"],
  transparency: ["translucency"],
  "printed surface": ["contact"],
  force: ["relief"],
  heat: ["relief", "luminosity"],
  play: ["relief"],
  cinema: ["contact"],
  "the near future": ["luminosity", "sheen"],
};

/** Relative luminance of a hex colour, on the same curve WCAG uses. */
function luminanceOf(hex: string): number {
  const h = normalizeHex(hex) || "#000000";
  const ch = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch[0]) + 0.7152 * lin(ch[1]) + 0.0722 * lin(ch[2]);
}

/** Share of `box` that falls inside `other`. Both in frame percentages. */
function overlapShare(box: { x: number; y: number; width: number; height: number }, other: { x: number; y: number; width: number; height: number }): number {
  const x = Math.max(0, Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x));
  const y = Math.max(0, Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y));
  const area = box.width * box.height;
  return area > 0 ? (x * y) / area : 0;
}

function describe(t: TypographyTreatment, weight: number): string {
  const on = TREATMENT_AXES.filter((a) => (t[a] ?? 0) >= 0.12).map((a) => `${a} ${(t[a] ?? 0).toFixed(2)}`);
  return `${on.length ? on.join(", ") : "solid ink"}, weight ${weight}`;
}

// ── the product, and whether it is the hero it was meant to be ────────────

function judgeProduct(
  plan: CompositionPlan | null,
  map: CompositionMap | null,
  analysis: VisionAnalysisResult | null,
  issues: VisionIssue[],
): AlignmentFinding {
  const accuracy = analysis?.product_accuracy ?? [];
  if (!plan || plan.product_role.value === "absent") {
    return unknownFinding("no product role was decided for this frame");
  }
  if (!map?.product) {
    return unknownFinding("the frame was not measured, or contains no coherent product area");
  }
  const share = (map.product.width * map.product.height) / 100;
  const wanted = plan.product_scale.value.share;
  const intended = `${plan.product_role.value} — ${plan.product_scale.value.label}`;
  const observed = `occupies about ${share.toFixed(0)}% of the frame`;

  // A hero that came back small, or evidence that came back dominating, are
  // both failures of the same kind: the picture disagrees with the role.
  const ratio = wanted > 0 ? share / wanted : 1;
  if (plan.product_role.value === "hero" && ratio < 0.5) {
    issues.push({
      what: `the product was decided as the hero and occupies only ${share.toFixed(0)}% of the frame`,
      severity: "major",
      owner: "PromptCompiler",
      because: "the plan asked for a hero at roughly " + wanted.toFixed(0) + "% and the render returned less than half of it",
      improvement_direction: "state the framing distance more plainly; a hero the size of a prop is a framing failure, not a styling one",
    });
    return { alignment: "missed", intended, observed, because: `measured against the ${wanted.toFixed(0)}% the framing implied`, from_observation: false };
  }
  if (plan.product_role.value === "evidence" && ratio > 2.2) {
    issues.push({
      what: `the product was decided as evidence for the idea and came back dominating the frame at ${share.toFixed(0)}%`,
      severity: "minor",
      owner: "PromptCompiler",
      because: "the plan made the product supporting and the render made it the subject",
      improvement_direction: "pull the framing back so the scene carries the idea and the product supports it",
    });
    return { alignment: "partial", intended, observed, because: `measured against the ${wanted.toFixed(0)}% the framing implied`, from_observation: false };
  }
  // The model's reading of whether the product is ACCURATE is a different
  // question from whether it is prominent, and only it can answer that one.
  const wrong = accuracy.filter((n) => /wrong|incorrect|distort|不|missing|different|invent/i.test(clean(n.what)));
  if (wrong.length) {
    issues.push({
      what: shorten(clean(wrong[0].what), 120),
      severity: "blocking",
      owner: "Renderer",
      because: "the supplied product was not reproduced as supplied, which no creative decision can excuse",
      improvement_direction: "re-render with the product reference weighted harder; a wrong product is not a style question",
    });
    return { alignment: "missed", intended, observed, because: "the model read the product as not matching what was supplied", from_observation: true };
  }
  return { alignment: "aligned", intended, observed, because: `measured against the ${wanted.toFixed(0)}% the framing implied`, from_observation: false };
}

// ── hierarchy: is the eye sent where the plan sent it ─────────────────────

function judgeHierarchy(plan: CompositionPlan | null, map: CompositionMap | null, issues: VisionIssue[]): AlignmentFinding {
  if (!plan?.visual_hierarchy?.length) return unknownFinding("no reading order was decided");
  if (!map?.focal) return unknownFinding("the frame was not measured, or has no single busiest point");
  const first = plan.visual_hierarchy[0];
  const intended = `${first.element} is read first`;
  const observed = `the eye lands ${labelFor(map.focal.x, map.focal.y)}`;

  // The only thing a measurement can check: when the product is meant to be
  // read first, the busiest point should be on it.
  if (first.element === "product" && plan.product_position.from !== "absent") {
    const want = plan.product_position.value;
    const inside =
      map.focal.x >= want.x && map.focal.x <= want.x + want.width &&
      map.focal.y >= want.y && map.focal.y <= want.y + want.height;
    if (!inside) {
      issues.push({
        what: "the eye lands away from the product the plan said should be read first",
        severity: "minor",
        owner: "CompositionPlan",
        because: "the frame matches its instructions but the reading order the plan chose is not what the picture produces",
        improvement_direction: "reconsider what should lead: either move the product to where the frame's weight already is, or move the weight",
      });
      return { alignment: "partial", intended, observed, because: "measured: the busiest point falls outside the product's planned area", from_observation: false };
    }
    return { alignment: "aligned", intended, observed, because: "measured: the busiest point falls inside the product's planned area", from_observation: false };
  }
  return unknownFinding(`nothing measurable decides whether "${first.element}" is read first`);
}

// ── creative alignment: the one that needs the model ──────────────────────

/**
 * Did the IDEA survive into the picture?
 *
 * The only dimension a measurement cannot reach, and it says so: pixels cannot
 * tell you whether a frame expresses restraint. It rests on what the model
 * reported, and the cascade decides who owns a failure -- a frame that executed
 * its plan faithfully and still misses the idea is the PLAN's failure, not the
 * prompt's, and a frame that never matched its plan is the prompt's.
 */
function judgeCreative(
  bp: CreativeBlueprint | null | undefined,
  plan: CompositionPlan | null,
  analysis: VisionAnalysisResult | null,
  looked: boolean,
  composition: AlignmentFinding,
  issues: VisionIssue[],
): AlignmentFinding {
  const idea = clean(bp?.concept?.big_idea?.value) || clean(bp?.concept?.campaign_concept?.value);
  const hook = clean(bp?.concept?.emotional_hook?.value) || clean(bp?.brand_expression?.emotional_direction?.value);
  const intended = idea || hook;
  if (!intended) return unknownFinding("no creative idea was decided, so there is nothing for the frame to have missed");
  if (!looked) return unknownFinding("no model looked at the render, and an idea cannot be checked by arithmetic");

  // A model reporting the frame reads as generic, or as a different kind of
  // work, is the only signal available that the idea did not land.
  const notes = [...(analysis?.issues ?? []), ...(analysis?.strengths ?? [])].map((n) => clean(n.what));
  const mismatch = (analysis?.issues ?? [])
    .map((n) => clean(n.what))
    .filter((w) => /generic|stock|any brand|could be any|cliché|cliche|off-brief|does not read as|feels like a different|mismatch/i.test(w));

  if (!mismatch.length) {
    return {
      alignment: "aligned",
      intended: shorten(intended, 90),
      observed: notes.length ? shorten(notes[0], 90) : "the model raised nothing against the idea",
      because: "the model reported nothing that contradicts the decided idea",
      from_observation: true,
    };
  }

  // The cascade. Who owns it depends on whether the frame did what it was told.
  const owner: DecisionOwner = composition.alignment === "missed" ? "PromptCompiler" : "CreativeBlueprint";
  issues.push({
    what: shorten(mismatch[0], 120),
    severity: "major",
    owner,
    because:
      owner === "PromptCompiler"
        ? "the frame does not match its composition either, so the instruction failed before the idea could be judged"
        : "the frame executed its composition faithfully and still does not read as the idea, so the decision is what needs to change",
    improvement_direction:
      owner === "PromptCompiler"
        ? "fix the transmission first: the composition never reached the picture, so the idea was never tested"
        : "the idea as decided does not produce this picture — reconsider the route, not the rendering",
  });
  return {
    alignment: "missed",
    intended: shorten(intended, 90),
    observed: shorten(mismatch[0], 90),
    because: "the model read the frame as not expressing the decided idea",
    from_observation: true,
  };
}

// ── brand ─────────────────────────────────────────────────────────────────

function judgeBrand(analysis: VisionAnalysisResult | null, looked: boolean, issues: VisionIssue[]): AlignmentFinding {
  if (!looked) return unknownFinding("no model looked at the render");
  const notes = (analysis?.issues ?? []).map((n) => clean(n.what));
  const off = notes.filter((w) => /brand|logo|off-brand|wrong colour|wrong color|palette/i.test(w));
  if (!off.length) {
    return {
      alignment: "aligned",
      intended: "the brand's own colours, mark and manner",
      observed: "the model raised nothing about the brand",
      because: "no brand finding was reported",
      from_observation: true,
    };
  }
  const invented = off.filter((w) => /invent|fake|synthetic|generated logo|made-up/i.test(w));
  if (invented.length) {
    issues.push({
      what: shorten(invented[0], 120),
      severity: "blocking",
      owner: "Renderer",
      because: "a mark the brand did not supply appeared in the frame, which no decision authorises",
      improvement_direction: "re-render; an invented mark is never acceptable and is not a styling question",
    });
  } else {
    issues.push({
      what: shorten(off[0], 120),
      severity: "minor",
      owner: "CompositionPlan",
      because: "the frame carries the brand differently from how the composition described it",
      improvement_direction: "state the brand's colours and where its mark sits as part of the composition",
    });
  }
  return {
    alignment: invented.length ? "missed" : "partial",
    intended: "the brand's own colours, mark and manner",
    observed: shorten(off[0], 90),
    because: "the model reported a brand finding",
    from_observation: true,
  };
}

/** Counts, alignments and owners. Never the client's copy. */
export function visionReviewTelemetry(r: VisionReview | null | undefined) {
  if (!r) return { vision_review: false };
  return {
    vision_review: true,
    achieved: r.achieved_creative_goal,
    severity: r.severity,
    alignments: {
      creative: r.creative_alignment.alignment,
      composition: r.composition_alignment.alignment,
      typography: r.typography_alignment.alignment,
      product: r.product_visibility.alignment,
      hierarchy: r.visual_hierarchy.alignment,
      brand: r.brand_consistency.alignment,
    },
    issues: r.detected_issues.length,
    owners: [...new Set(r.detected_issues.map((i) => i.owner))],
    not_judged: r.not_judged.length,
    // How much of the verdict rests on a model's words rather than a
    // measurement. A review that is entirely observation is a review that
    // changes when the model does.
    observed_dimensions: [
      r.creative_alignment, r.composition_alignment, r.typography_alignment,
      r.product_visibility, r.visual_hierarchy, r.brand_consistency,
    ].filter((f) => f.from_observation).length,
  };
}
