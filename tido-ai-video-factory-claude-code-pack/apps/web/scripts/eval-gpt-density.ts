/**
 * The A/B that can settle D2: does spelling a percentage out help, or hurt?
 *
 * THE QUESTION
 * ------------
 * `GPT_NUMERIC_WORDS` has two settings and only one of them is justified by evidence:
 *
 *   words_only          relative language — "the upper third", "about half the frame"
 *   words_plus_percent  spelled-out figures — "about thirty percent of the canvas height"
 *
 * `words_only` is the default because the D8/K12 migration MEASURED that numerals and
 * parameter dumps degrade a Sunburst render, and the safest reading of that evidence is
 * that a spelled quantity inherits some of the problem. But that is a reading, not a
 * measurement: nobody has rendered the same brief both ways and compared the layouts.
 * "Thirty percent" contains no numeral at all, so it may well be strictly better — more
 * precise at no cost. Or the model may draw the words. Nobody knows.
 *
 * This script is the thing that would find out. It is NOT run in this round.
 *
 * WHAT IT DOES, AND WHAT IT REFUSES TO DO
 * ---------------------------------------
 * Renders the twelve briefs in `gpt-brief-fixtures.ts` twice — once per density, same
 * sheet, same seed order, the ONLY difference being how the layout is phrased — and saves
 * each pair with the sheet, the prompt and the image side by side.
 *
 * It does not score anything. A layout question is answered by looking: did the headline
 * land in the band the sheet asked for, is the safe margin respected, did a figure get
 * drawn into the picture. An automated score here would be a number dressed as a finding,
 * and the whole reason this flag exists is that we already have one of those.
 *
 * SPENDING
 * --------
 * Refuses to run without BOTH flags:
 *
 *   npx tsx scripts/eval-gpt-density.ts --yes-i-approve-spending --max-vnd=7000
 *
 * Twenty-eight renders — fourteen fixtures, two densities — all carrying reference images,
 * at 250 VND each is 7,000 VND. `--fixtures=` narrows it; the twelve-brief run the plan
 * asks for is the default list minus the two that attach no product sheet.
 *
 * The cap is checked before every call, so it stops AT the cap rather than near it.
 */
import fs from "fs";
import path from "path";

import { GPT_BRIEF_FIXTURES, artDirectorBriefInputFor } from "../lib/image-engine/prompt-v2/gpt-brief-fixtures";
import { buildGptMessages } from "../lib/image-engine/prompt-v2/build-gpt";
import { buildGptFallbackPrompt } from "../lib/image-engine/prompt-v2/gpt-fallback";
import type { NumericWordsDensity } from "../lib/image-engine/prompt-v2/engine-selector";

const APPROVED = process.argv.includes("--yes-i-approve-spending");
const MAX_VND = Number((process.argv.find((a) => a.startsWith("--max-vnd=")) || "").split("=")[1] || 0);
const ONLY = (process.argv.find((a) => a.startsWith("--fixtures=")) || "").split("=")[1] || "";
const VND_PER_RENDER = 250;

const DENSITIES: NumericWordsDensity[] = ["words_only", "words_plus_percent"];

if (!APPROVED || !MAX_VND) {
  const fixtures = ONLY ? ONLY.split(",").length : GPT_BRIEF_FIXTURES.length;
  console.error(
    "Refusing to spend. Run with both flags:\n\n" +
      "  npx tsx scripts/eval-gpt-density.ts --yes-i-approve-spending --max-vnd=7000\n\n" +
      `Estimated cost: ${fixtures} fixtures x ${DENSITIES.length} densities x ${VND_PER_RENDER} VND = ` +
      `${fixtures * DENSITIES.length * VND_PER_RENDER} VND.\n\n` +
      "Narrow it with --fixtures=05_five_drinks_prices_florian,04_four_dishes_fast_food\n" +
      "Set GPT_ART_DIRECTOR=true as well, or every render is the flag-OFF prompt and the\n" +
      "comparison answers nothing.",
  );
  process.exit(1);
}

if (String(process.env.GPT_ART_DIRECTOR || "").toLowerCase() !== "true") {
  console.error(
    "GPT_ART_DIRECTOR is not on. The density switch only reaches the prompt through the\n" +
      "art-director path, so this run would render the same prompt twenty-eight times.",
  );
  process.exit(1);
}

/**
 * What the comparison needs in order to be judgeable later.
 *
 * Written BEFORE any spend, so a run that dies halfway has still recorded what it was
 * asking. The prompts are the cheap half of this script and the interesting half.
 */
function plan() {
  const chosen = ONLY
    ? GPT_BRIEF_FIXTURES.filter((f) => ONLY.split(",").includes(f.id))
    : GPT_BRIEF_FIXTURES;
  const out = path.join(process.cwd(), "data", "generated", "eval-gpt-density");
  fs.mkdirSync(out, { recursive: true });

  const rows: Array<{ fixture: string; density: NumericWordsDensity; prompt: string }> = [];
  for (const fx of chosen) {
    for (const density of DENSITIES) {
      const input = artDirectorBriefInputFor(fx, density);
      const built = buildGptMessages(input, "v2");
      // The code-built prompt, not the director's. A director call is non-deterministic,
      // and an A/B whose two arms differ by the model's mood measures the model's mood.
      const prompt = buildGptFallbackPrompt(input, built.templates.playbook);
      rows.push({ fixture: fx.id, density, prompt });
      fs.writeFileSync(path.join(out, `${fx.id}.${density}.prompt.txt`), prompt, "utf8");
      fs.writeFileSync(
        path.join(out, `${fx.id}.${density}.sheet.json`),
        JSON.stringify(input.sheet, null, 2),
        "utf8",
      );
    }
  }
  return { rows, out, chosen };
}

async function main() {
  const { rows, out, chosen } = plan();
  const cost = rows.length * VND_PER_RENDER;
  console.log(`\n${chosen.length} fixtures x ${DENSITIES.length} densities = ${rows.length} renders`);
  console.log(`prompts and sheets written to ${out}`);

  if (cost > MAX_VND) {
    console.error(`\nRefusing: ${rows.length} renders would cost ${cost} VND, over the ${MAX_VND} VND cap.`);
    process.exit(1);
  }

  // The render loop is deliberately NOT written yet.
  //
  // Not an oversight and not laziness: this round was explicitly scoped to add no paid
  // call, and a script that can spend is a script that will be run by accident. Everything
  // above — the pairing, the prompts, the sheets, the cost arithmetic and both guards — is
  // the part that needed thinking about and is testable for free. Wiring
  // `ImgStudioImageGenerationProvider` in here is half an hour's work at the point someone
  // has decided to spend the seven thousand dong, and it should be done by whoever is
  // about to sit and look at twenty-eight images.
  //
  // `scripts/eval-gpt-label-lock.ts` has the provider loop to copy, including the
  // post-call balance check.
  console.log(
    "\nThe render loop is not implemented. This round added no paid call by design.\n" +
      "Copy the provider loop from scripts/eval-gpt-label-lock.ts when you are ready to spend.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
