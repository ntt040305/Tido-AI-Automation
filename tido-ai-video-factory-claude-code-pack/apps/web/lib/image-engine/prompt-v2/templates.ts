/**
 * The meta-prompt, the playbooks and the gold examples, loaded from text files.
 *
 * WHY FILES AND NOT CODE
 * ----------------------
 * These are the things that get tuned after looking at renders, by whoever is looking
 * at them. A string literal inside a TypeScript module makes that a code change, a
 * build and a deploy; a text file makes it an edit. Nothing in here interprets the
 * text -- it substitutes `{{slots}}` and hands the result over.
 *
 * FOUR FILES, FOR FOUR DIFFERENT RATES OF CHANGE
 * ----------------------------------------------
 *   system.v{N}.md    what an agency-standard prompt must contain. Changes rarely,
 *                     and never because of one job. NO SLOTS.
 *   request.v{N}.md   this job's brief. All the slots live here.
 *   playbooks/*.txt   what a poster asks of a frame that a banner does not.
 *   gold-examples/    a proven prompt per asset type, as a quality bar.
 *
 * One file holding all four would mean editing the standing instructions to add a
 * slot, and rewriting the quality bar to fix a typo in the role description.
 *
 * VERSIONS ARE IN THE FILENAME
 * ----------------------------
 * `system.v1.md`, `request.v1.md`, `playbooks/poster.v1.txt`. A new version is a new
 * file, so the old one is still on disk and still runnable:
 * `PROMPT_V2_TEMPLATE_VERSION=v2` switches all of them together. The version used is
 * reported on every build, because "which meta-prompt produced this image" is the
 * first question a bad render raises.
 *
 * The gold examples are NOT versioned: a prompt that produced a good image produced
 * it whatever the meta-prompt said, and versioning them would mean copying every one
 * on every bump.
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

/**
 * Where the template files are, resolved at runtime rather than assumed.
 *
 * `path.join(__dirname, "templates")` is wrong under Next, and wrong in a way that
 * only shows up in a real render: Next BUNDLES server code, so `__dirname` inside a
 * route points into `.next/server/...`, where no `templates/` directory exists. The
 * same line works perfectly under `tsx`, where `__dirname` IS the source folder --
 * so every offline test passed while every real render failed with ENOENT, fell back
 * to v1 and produced an image that looked exactly like v1 because it WAS v1.
 *
 * Measured: `[PROMPT_V2] falling back to v1`, zero model calls, on a live render.
 *
 * So: try the candidates, in order, and accept the first one that actually holds a
 * `playbooks/` directory. A wrong path now fails loudly, naming everywhere it looked.
 */
const TEMPLATE_CANDIDATES = (): string[] => {
  const cwd = process.cwd();
  return [
    // Under tsx / ts-node, and in any runtime that does not rewrite __dirname.
    path.join(__dirname, "templates"),
    // Next, dev and production: cwd is the app root (`apps/web`).
    path.join(cwd, "lib", "image-engine", "prompt-v2", "templates"),
    // Run from the repo root, or from the pack root.
    path.join(cwd, "apps", "web", "lib", "image-engine", "prompt-v2", "templates"),
    path.join(cwd, "tido-ai-video-factory-claude-code-pack", "apps", "web", "lib", "image-engine", "prompt-v2", "templates"),
  ];
};

let resolvedDir: string | null = null;

function templateDir(): string {
  if (resolvedDir) return resolvedDir;
  const tried = TEMPLATE_CANDIDATES();
  for (const dir of tried) {
    try {
      // `playbooks/` is the marker: it is distinctive enough that a directory
      // holding it is this directory and not some other `templates` folder.
      if (fs.statSync(path.join(dir, "playbooks")).isDirectory()) {
        resolvedDir = dir;
        return dir;
      }
    } catch {
      // Not this one. Try the next.
    }
  }
  throw new Error(
    `the prompt-v2 template directory was not found. Looked in: ${tried.join(" | ")}. ` +
      `cwd=${process.cwd()} __dirname=${__dirname}`,
  );
}

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

/** `V2_TEMPLATE_RELOAD=true`. Read here rather than imported, to keep this module leaf-level. */
function reloadEveryRead(): boolean {
  return String(process.env.V2_TEMPLATE_RELOAD || "").trim().toLowerCase() === "true";
}

/**
 * Read once per path per process, because these files do not change while the server
 * runs -- unless somebody is editing them, which `V2_TEMPLATE_RELOAD=true` is for.
 */
const cache = new Map<string, string>();
function read(file: string): string {
  // Dev mode re-reads. Without it an edit to a meta-prompt needs a server restart to
  // take effect, and it is very easy to spend an afternoon testing the old version.
  const hit = reloadEveryRead() ? undefined : cache.get(file);
  if (hit !== undefined) return hit;
  const text = fs.readFileSync(file, "utf8");
  cache.set(file, text);
  return text;
}

/** Forget the cache. For tests that write a template and read it back. */
export function clearTemplateCache(): void {
  cache.clear();
  resolvedDir = null;
}

/** Where the templates were found. For a startup check and for the record. */
export function templateDirectory(): string {
  return templateDir();
}

export interface LoadedTemplates {
  /**
   * The Creative Director's standing instructions. Carries no slots: nothing about
   * one job belongs in it, which is why it can be edited without regard to any job.
   */
  system: string;
  /** The per-job brief. All the slots live here. */
  request: string;
  playbook: string;
  /** The proven prompt for this asset type, or "" when there is none yet. */
  goldExample: string;
  version: string;
  playbookName: PlaybookName;
  /** Which dialect's set these came from. */
  dialect: TemplateDialect;
  /** The files actually read, for the record. */
  files: string[];
}

/**
 * The gold example's filename for an asset type.
 *
 * Deliberately NOT the playbook name: `social` the playbook is `social_ad.md` the
 * example, because the author named the files and the files are the interface.
 */
const GOLD_FILE: Record<PlaybookName, string> = {
  poster: "poster.md",
  banner: "banner.md",
  social: "social_ad.md",
  hero: "product_hero.md",
  ugc: "ugc.md",
};

/** A file that may legitimately not exist. Missing is "", not a throw. */
function readOptional(file: string): string {
  try {
    return read(file);
  } catch {
    return "";
  }
}

/**
 * Which dialect's template set to read.
 *
 * The Gemini set lives at the root of `templates/` where it has always lived, so
 * `loadTemplates("Poster")` reads exactly the files it read before and the Nano
 * Banana 2 path cannot move. The GPT set lives in `templates/gpt/`.
 *
 * A subdirectory rather than a filename suffix because the two dialects are whole
 * instruction sets, not variants of one: a GPT system prompt edited next to a
 * Gemini one invites an edit meant for one landing in the other.
 */
export type TemplateDialect = "gemini" | "gpt-image";

const DIALECT_SUBDIR: Record<TemplateDialect, string> = {
  gemini: "",
  "gpt-image": "gpt",
};

export function loadTemplates(
  assetType: string,
  version = templateVersion(),
  dialect: TemplateDialect = "gemini",
  /**
   * Whether this job has copy. The GPT set keeps two gold examples per asset type —
   * one with copy and one without — because a prompt that must set three strings and a
   * prompt that must set none are different shapes, and showing the wrong one teaches
   * the director to add text nobody asked for.
   */
  hasCopy = true,
): LoadedTemplates {
  const playbookName = playbookNameFor(assetType);
  const sub = DIALECT_SUBDIR[dialect];
  const dir = sub ? path.join(templateDir(), sub) : templateDir();
  const systemFile = path.join(dir, `system.${version}.md`);
  const requestFile = path.join(dir, `request.${version}.md`);
  const playbookFile = path.join(dir, "playbooks", `${playbookName}.${version}.txt`);
  const goldFile = sub
    ? path.join(dir, "gold-examples", GOLD_FILE[playbookName].replace(/\.md$/, hasCopy ? ".with-copy.md" : ".no-copy.md"))
    : path.join(dir, "gold-examples", GOLD_FILE[playbookName]);
  return {
    system: read(systemFile),
    request: read(requestFile),
    playbook: read(playbookFile),
    // Not versioned: a proven prompt is proven whatever the meta-prompt version, and
    // versioning it would mean copying it on every bump.
    goldExample: readOptional(goldFile),
    version,
    playbookName,
    dialect,
    files: [systemFile, requestFile, playbookFile, ...(readOptional(goldFile) ? [goldFile] : [])],
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
  // Either case: the playbooks use `{{ASPECT_RATIO}}` and the request template uses
  // `{{aspect_ratio}}`, because each was written by whoever owns that file. Accepting
  // both costs nothing and beats renaming someone's file to suit a regex.
  const out = template.replace(/\{\{([A-Za-z_]+)\}\}/g, (whole, name: string) => {
    const value = slots[name];
    return value === undefined ? whole : value;
  });
  const leftover = [...new Set((out.match(/\{\{[A-Za-z_]+\}\}/g) || []))];
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
    system_chars: t.system.length,
    request_chars: t.request.length,
    playbook_chars: t.playbook.length,
    gold_example: Boolean(t.goldExample.trim()),
  };
}
