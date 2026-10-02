/**
 * The meta-prompt and the playbooks, loaded from text files.
 *
 * WHY FILES AND NOT CODE
 * ----------------------
 * These two are the things that get tuned after looking at renders, by whoever is
 * looking at them. A string literal inside a TypeScript module makes that a code
 * change, a build and a deploy; a `.txt` file makes it an edit. Nothing in here
 * interprets the text -- it substitutes `{{SLOTS}}` and hands the result over.
 *
 * VERSIONS ARE IN THE FILENAME
 * ----------------------------
 * `meta-prompt.v1.txt`, `playbooks/poster.v1.txt`. A new version is a new file, so
 * the old one is still on disk and still runnable: `PROMPT_V2_TEMPLATE_VERSION=v2`
 * switches both. The version used is reported on every build, because "which
 * meta-prompt produced this image" is the first question a bad render raises.
 *
 * SLOTS
 * -----
 * Everything the prompt needs is a `{{SLOT}}`. An unknown slot left in the file is
 * an error, not a silent empty string: a meta-prompt with `{{COPY}}` unfilled would
 * brief the model about a placeholder.
 */
import fs from "fs";
import path from "path";

export type AspectRatio = "1:1" | "9:16" | "16:9";
export const PLAYBOOK_NAMES = ["poster", "banner", "social", "hero", "ugc"] as const;
export type PlaybookName = (typeof PLAYBOOK_NAMES)[number];

const TEMPLATE_DIR = path.join(__dirname, "templates");

/** The version suffix on the files this process reads. */
export function templateVersion(env: Record<string, string | undefined> = process.env): string {
  const raw = String(env.PROMPT_V2_TEMPLATE_VERSION || "v1").trim().toLowerCase();
  // A version is a filename fragment, so it may not contain a path.
  return /^v\d+$/.test(raw) ? raw : "v1";
}

/** Which playbook an asset type belongs to. The one mapping, shared by build and eval. */
export function playbookNameFor(assetType: string | null | undefined): PlaybookName {
  const a = String(assetType || "").toLowerCase();
  if (/ugc|user[- ]generated|unbox|handheld|selfie/.test(a)) return "ugc";
  if (/banner|display|leaderboard|skyscraper|web ad/.test(a)) return "banner";
  if (/packshot|product hero|hero|catalogue|catalog|ecommerce|e-commerce/.test(a)) return "hero";
  if (/social|instagram|facebook|feed|story|reel|tiktok/.test(a)) return "social";
  return "poster";
}

/**
 * The layout sentence for a ratio.
 *
 * In code rather than in the playbook files because it is the same statement for
 * every asset type: a 16:9 frame has two horizontal zones and a 9:16 frame has a top
 * and a bottom, whatever is being advertised. The playbooks say what the asset must
 * WIN; this says where things can physically go.
 */
export const LAYOUT_BY_RATIO: Record<AspectRatio, string> = {
  "1:1": "a centred composition — the subject a little off centre, the words in the calm area on the opposite side of the frame.",
  "9:16": "stacked vertically — the subject in the middle band, the words above or below it, and nothing that matters in the top or bottom eighth.",
  "16:9": "two horizontal zones — the subject on one side, the block of words left-aligned in the quiet side opposite it.",
};

export const RATIO_SENTENCE: Record<AspectRatio, string> = {
  "1:1": "Square 1:1 frame.",
  "9:16": "Vertical 9:16 frame.",
  "16:9": "Wide 16:9 frame.",
};

/** Read once per path per process. These files do not change while the server runs. */
const cache = new Map<string, string>();
function read(file: string): string {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  const text = fs.readFileSync(file, "utf8");
  cache.set(file, text);
  return text;
}

/** Forget the cache. For tests that write a template and read it back. */
export function clearTemplateCache(): void {
  cache.clear();
}

export interface LoadedTemplates {
  metaPrompt: string;
  playbook: string;
  version: string;
  playbookName: PlaybookName;
  /** The files actually read, for the record. */
  files: string[];
}

export function loadTemplates(assetType: string, version = templateVersion()): LoadedTemplates {
  const playbookName = playbookNameFor(assetType);
  const metaFile = path.join(TEMPLATE_DIR, `meta-prompt.${version}.txt`);
  const playbookFile = path.join(TEMPLATE_DIR, "playbooks", `${playbookName}.${version}.txt`);
  return {
    metaPrompt: read(metaFile),
    playbook: read(playbookFile),
    version,
    playbookName,
    files: [metaFile, playbookFile],
  };
}

/**
 * Fills the slots.
 *
 * Two passes, because the playbook has slots of its own (`{{ASPECT_RATIO}}`,
 * `{{LAYOUT}}`) and it is substituted INTO the meta-prompt, which then has its own.
 * An unfilled slot left over is thrown: the alternative is briefing a model about
 * a placeholder, which is how "BUSINESS GOAL: in beauty_skincare" reached a render.
 */
export function fillSlots(template: string, slots: Record<string, string>): string {
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, name: string) => {
    const value = slots[name];
    return value === undefined ? whole : value;
  });
  const leftover = [...new Set((out.match(/\{\{[A-Z_]+\}\}/g) || []))];
  if (leftover.length) throw new Error(`template slots not filled: ${leftover.join(", ")}`);
  return out;
}

/** Counts and names only. Never the prompt. */
export function templateTelemetry(t: LoadedTemplates | null | undefined) {
  if (!t) return { templates: false };
  return {
    templates: true,
    version: t.version,
    playbook: t.playbookName,
    meta_chars: t.metaPrompt.length,
    playbook_chars: t.playbook.length,
  };
}
