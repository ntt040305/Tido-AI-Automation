/**
 * SUPERSEDED, NOT DELETED. The render path no longer imports this file.
 *
 * Replaced by: `templates/playbooks/*.v1.txt`
 *
 * Why: the simplified engine returns four tags instead of JSON and runs three
 * checks instead of eleven lint rules. The playbooks are text files now, so
 * changing a copy budget is an edit rather than a release.
 *
 * Evidence that nothing in production reaches this file (2026-10-02):
 *
 *   grep -rn "prompt-v2/playbooks" --include=*.ts lib app
 *
 * answers only with other files in this list and with the test and eval runners
 * `run-prompt-engine-v2-tests.ts`, `run-prompt-v2-eval.ts` and
 * `run-prompt-v2-eval-live.ts`. `ExperimentPipeline.ts` imports `build-
 * simple.ts`.
 *
 * It is kept, and kept passing its tests, for two reasons: the eval compares the
 * two engines against the same briefs, and the JSON path is the fallback if the
 * tag path turns out worse on real renders -- which has NOT yet been measured.
 * Deleting it before that measurement would throw away the comparison.
 */
/**
 * The asset playbooks — what each channel asks of the frame, per aspect ratio.
 *
 * WHY A FILE OF ITS OWN
 * --------------------
 * This is the part of v2 that gets tuned after looking at renders. It is a
 * configuration table with no logic in it on purpose: changing a word budget or a
 * layout rule should be an edit in one place by someone who is looking at an
 * image, not a code change.
 *
 * WHY ASSET TYPE x RATIO AND NOT ASSET TYPE
 * -----------------------------------------
 * The audit found the system changing nothing but four numbers between a banner
 * and a poster, and changing nothing at all between 1:1 and 16:9. But the ratio is
 * what decides where copy can physically go: a 16:9 frame has two horizontal zones
 * and a 9:16 frame has a top and a bottom. A poster at 16:9 and a poster at 9:16
 * are two different layout problems, and one rule for both is how copy ends up on
 * top of the product.
 *
 * Only `1:1`, `9:16` and `16:9` exist here, because those are the three the
 * provider accepts (`ImgStudioImageGenerationProvider` checks the list before it
 * calls). The user's choice is respected and never silently changed.
 *
 * Pure data. No model call, no I/O.
 */

export type AspectRatio = "1:1" | "9:16" | "16:9";

export const PLAYBOOK_IDS = ["poster", "banner", "social", "hero", "ugc"] as const;
export type PlaybookId = (typeof PLAYBOOK_IDS)[number];

export interface CopyBudget {
  headline_max_words: number;
  subline_max_words: number;
  cta_max_words: number;
  /** How many separate strings the frame can carry at all. */
  max_strings: number;
}

export interface Playbook {
  id: PlaybookId;
  ratio: AspectRatio;
  /** What the asset has to achieve, in one line, for the system prompt. */
  job: string;
  /** Where things go in THIS ratio. The sentence the director is held to. */
  layout: string;
  /** How much of the frame the subject occupies, in words rather than numbers. */
  subject: string;
  copy_budget: CopyBudget;
  /** Rules specific to the channel, each one a thing a renderer can do or not do. */
  rules: string[];
}

interface PlaybookBase {
  job: string;
  subject: string;
  copy_budget: CopyBudget;
  rules: string[];
  /** Layout per ratio. Three different layout problems, three sentences. */
  layout: Record<AspectRatio, string>;
}

const BASES: Record<PlaybookId, PlaybookBase> = {
  poster: {
    job: "one idea a viewer can still describe three seconds after looking away",
    subject: "the subject fills roughly half the frame and is unmistakably the thing the picture is about",
    copy_budget: { headline_max_words: 8, subline_max_words: 15, cta_max_words: 4, max_strings: 3 },
    rules: [
      "the words sit inside the scene, in a quiet area the light leaves, never on a panel laid over the picture",
      "one element dominates; nothing else competes for attention with it",
    ],
    layout: {
      "1:1": "a centred composition: the subject a little off centre, the words in the calm area on the opposite side of the frame",
      "9:16": "stacked vertically: the subject in the lower two thirds, the words in the upper third, clear of the top and bottom edges",
      "16:9": "two horizontal zones: the subject on one side, the block of words left-aligned in the quiet side opposite it",
    },
  },
  banner: {
    job: "one statement that reads in under a second, at a few hundred pixels wide",
    subject: "the subject is large and close, with a hard tonal separation from whatever is behind it",
    copy_budget: { headline_max_words: 7, subline_max_words: 12, cta_max_words: 3, max_strings: 2 },
    rules: [
      "the headline is the largest thing in the frame after the product, and reads when the image is reduced to a few hundred pixels",
      "the action line reads as a button: a short line with its own clear space around it",
      "nothing decorative between the words and the background",
    ],
    layout: {
      "1:1": "a centred composition with the words directly under the subject and nothing in the corners",
      "9:16": "stacked vertically: the subject centred, the words in the lower third, well inside the edges so no interface strip covers them",
      "16:9": "two horizontal zones: the product on one side and a left-aligned block of words in the quiet side opposite, with the action line last",
    },
  },
  social: {
    job: "a frame that survives a thumbnail and rewards a second look at full size",
    subject: "the subject is large, high in contrast, and readable before anything is read",
    copy_budget: { headline_max_words: 6, subline_max_words: 10, cta_max_words: 3, max_strings: 3 },
    rules: [
      "the top and bottom eighths of the frame stay clear of anything that matters, because the platform draws its own interface there",
      "the hook is short enough to read while scrolling",
    ],
    layout: {
      "1:1": "a centred composition with the hook close above or below the subject and the edges left empty",
      "9:16": "stacked vertically: subject in the middle band, hook in the upper area, action line lower, both kept away from the top and bottom eighths",
      "16:9": "two horizontal zones: subject one side, hook left-aligned opposite, nothing in the outer margins",
    },
  },
  hero: {
    job: "surface truth: the product's material, edges and markings hold up to inspection",
    subject: "the product fills the frame confidently and is shown at the angle that explains its form",
    copy_budget: { headline_max_words: 5, subline_max_words: 0, cta_max_words: 0, max_strings: 1 },
    rules: [
      "almost no words: one very short line at most, and none if the brief gave none",
      "no prop competes with the product; the surface it stands on is plain",
    ],
    layout: {
      "1:1": "a centred composition, the product filling the middle with even space around it",
      "9:16": "stacked vertically: the product in the middle two thirds, empty space above and below it",
      "16:9": "two horizontal zones: the product one side, the opposite side empty rather than filled with words",
    },
  },
  ugc: {
    job: "a frame that looks taken by a person who owns the product, not made for a campaign",
    subject: "the product is held or placed in a real room, slightly off centre, at a handheld angle",
    copy_budget: { headline_max_words: 6, subline_max_words: 0, cta_max_words: 0, max_strings: 1 },
    rules: [
      "no studio: real room light, ordinary surfaces, the kind of clutter a real room has",
      "the framing is a little imperfect, as a phone held in one hand would be",
      "no typography unless the brief gave a line, and then it reads as a caption rather than as a headline",
    ],
    layout: {
      "1:1": "a centred-ish composition, the product slightly off centre with the room visible around it",
      "9:16": "stacked vertically: the product in the lower middle as a hand would hold it, the room above",
      "16:9": "two horizontal zones only loosely: the product to one side with the room running off to the other",
    },
  },
};

/** Which playbook an asset type belongs to. One mapping, shared by v2 and the eval. */
export function playbookIdFor(assetType: string | null | undefined): PlaybookId {
  const a = String(assetType || "").toLowerCase();
  if (/ugc|user[- ]generated|unbox|handheld|selfie/.test(a)) return "ugc";
  if (/banner|display|leaderboard|skyscraper|web ad/.test(a)) return "banner";
  if (/packshot|product hero|hero|catalogue|catalog|ecommerce|e-commerce/.test(a)) return "hero";
  if (/social|instagram|facebook|feed|story|reel|tiktok/.test(a)) return "social";
  return "poster";
}

/**
 * The playbook for this asset type at this ratio.
 *
 * An unmapped asset type resolves to `poster` rather than throwing: a new channel
 * name arriving from the UI should produce a reasonable brief, not a 500.
 */
export function playbookFor(assetType: string | null | undefined, ratio: AspectRatio): Playbook {
  const id = playbookIdFor(assetType);
  const base = BASES[id];
  return {
    id,
    ratio,
    job: base.job,
    layout: base.layout[ratio],
    subject: base.subject,
    copy_budget: base.copy_budget,
    rules: base.rules,
  };
}

/** The playbook as the system prompt states it. */
export function renderPlaybook(pb: Playbook): string {
  const b = pb.copy_budget;
  const budget =
    b.max_strings === 1
      ? `At most ONE line of text, no longer than ${b.headline_max_words} words.`
      : `At most ${b.max_strings} separate lines of text: a headline of at most ${b.headline_max_words} words` +
        (b.subline_max_words ? `, a supporting line of at most ${b.subline_max_words} words` : "") +
        (b.cta_max_words ? `, and an action line of at most ${b.cta_max_words} words` : "") +
        ".";
  return [
    `ASSET: ${pb.id} at ${pb.ratio}.`,
    `What it has to do: ${pb.job}.`,
    `Subject: ${pb.subject}.`,
    `Layout for this ratio: ${pb.layout}.`,
    `Copy budget: ${budget}`,
    ...pb.rules.map((r) => `- ${r}`),
  ].join("\n");
}

/** Counts and names only. */
export function playbookTelemetry(pb: Playbook | null | undefined) {
  if (!pb) return { playbook: false };
  return {
    playbook: true,
    id: pb.id,
    ratio: pb.ratio,
    max_strings: pb.copy_budget.max_strings,
    headline_max_words: pb.copy_budget.headline_max_words,
  };
}
