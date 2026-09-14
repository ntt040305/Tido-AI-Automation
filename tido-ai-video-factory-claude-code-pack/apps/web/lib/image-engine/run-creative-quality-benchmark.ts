import fs from "fs";
import path from "path";

/**
 * Universal Creative Quality Framework.
 *
 * An evaluation harness, deliberately NOT a pipeline stage. It reads compiled
 * production prompts off disk and scores eight properties of the decision-making
 * behind them. Nothing here runs at render time and nothing here can change a
 * render — an evaluator that also participates in generation stops being able to
 * tell you whether generation is any good.
 *
 * What it can and cannot see
 * --------------------------
 * It reads prompts, not pictures. Every criterion below is therefore a statement
 * about whether the system REASONED, not about whether the image came out well.
 * `production_realism` in particular is a proxy: it measures whether physical
 * instructions reached the renderer, which is a precondition for a credible
 * image and not a measurement of one. Scores are labelled MEASURED or PROXY so
 * the difference stays visible rather than being averaged away.
 *
 * Deliberately not industry-aware. The whole point is that one framework judges
 * a serum launch and a tyre campaign by the same standard: did the system make
 * decisions for reasons. A per-industry rubric would be the template generator
 * this phase exists to avoid, wearing a scorecard.
 */

export type Kind = "MEASURED" | "PROXY";

export interface Criterion {
  key: string;
  question: string;
  kind: Kind;
  /** 0-10. */
  score: (p: string) => number;
}

const has = (p: string, re: RegExp) => (re.test(p) ? 1 : 0);
const clamp10 = (n: number) => Math.max(0, Math.min(10, n));

/** Words that describe a verdict on a finished picture rather than a thing to render. */
const VERDICT = /\b(?:premium|luxur(?:y|ious)|cinematic|beautiful|stunning|gorgeous|breathtaking|high[- ]end|exquisite)\b/gi;

/** A sentence that states a reason rather than only a parameter. */
const REASONED = /\b(?:so that|so the|because|rather than|which keeps|which makes|in order to|the reason|not\b[^.]{0,40}\bbut)\b/gi;

export const CRITERIA: Criterion[] = [
  {
    key: "strategic_relevance",
    question: "Does the prompt say what the image must achieve, for whom, and why it exists?",
    kind: "MEASURED",
    score: (p) =>
      clamp10(
        2.5 * has(p, /^WHAT THIS IMAGE MUST ACHIEVE:/m) +
          2.5 * has(p, /^CONSUMER INSIGHT:/m) +
          2.5 * has(p, /^WHO THIS IS FOR:/m) +
          2.5 * has(p, /^(?:BUSINESS GOAL|CREATIVE MESSAGE):/m)
      ),
  },
  {
    key: "creative_quality",
    question: "Is there a creative idea — a scene and a message — rather than a mood board?",
    kind: "MEASURED",
    score: (p) => {
      const scene = /^- What is happening: (.+)$/m.exec(p);
      const len = scene ? scene[1].length : 0;
      return clamp10(
        3 * has(p, /^THE SCENE — WHAT THE IMAGE ACTUALLY SHOWS:/m) +
          3 * has(p, /^CREATIVE MESSAGE:/m) +
          // A scene is a situation. One clause is a caption; length here is a
          // crude but honest stand-in for "an actual moment was described".
          Math.min(4, len / 60)
      );
    },
  },
  {
    key: "design_quality",
    question: "Are composition, hierarchy and attention decided rather than defaulted?",
    kind: "MEASURED",
    score: (p) =>
      clamp10(
        2.5 * has(p, /^ATTENTION BUDGET/m) +
          2.5 * has(p, /^EYE FLOW:/m) +
          2.5 * has(p, /^NEGATIVE SPACE STRATEGY:/m) +
          2.5 * has(p, /^- COMPOSITION:/m)
      ),
  },
  {
    key: "brand_suitability",
    question: "Does the brand reach the renderer as something to honour, not just a name?",
    kind: "MEASURED",
    score: (p) =>
      clamp10(
        4 * has(p, /^BRAND NAME:|Respect brand identity|brand mark/mi) +
          3 * has(p, /Non-negotiable:/m) +
          3 * has(p, /LOCKED CLIENT INTENT/m)
      ),
  },
  {
    key: "audience_suitability",
    question: "Is the viewer described as a person, beyond a demographic bracket?",
    // PROXY, and deliberately coarse.
    //
    // Two earlier versions of this criterion were wrong in opposite directions.
    // The first scored `4 + length / 60`, which rewarded verbosity: tightening
    // the strategy fields to fit the character budget lowered the score while the
    // understanding behind them was unchanged. The second counted behavioural
    // keywords, which missed "slightly fatigued by products that promise to
    // reverse her" — a sharper piece of audience understanding than anything on
    // the list — because it used different words.
    //
    // What a regex can honestly tell is whether the description got past a
    // demographic bracket. Whether it is a GOOD description is a judgement this
    // harness cannot make, so it stops at three levels rather than inventing
    // gradations it cannot support.
    kind: "PROXY",
    score: (p) => {
      const who = /^WHO THIS IS FOR: (.+)$/m.exec(p);
      if (!who) return 0;
      const t = who[1].trim();
      // An age range, a gender and an income band are a targeting filter. They
      // say who will see the image, not who is looking at it.
      const onlyDemographic = /^[^.]{0,80}\d{2}\s?[\u2013-]\s?\d{2}[^.]{0,30}$/.test(t);
      if (onlyDemographic) return 3;
      // More than one sentence about the person, rather than a single label.
      return /[.;]\s+\S/.test(t) ? 9 : 6;
    },
  },
  {
    key: "commercial_usefulness",
    question: "Can the result actually be used — right format, safe margins, exact copy?",
    kind: "MEASURED",
    score: (p) =>
      clamp10(
        2.5 * has(p, /^FORMAT: /m) +
          2.5 * has(p, /^SAFE MARGIN:/m) +
          2.5 * has(p, /^RESERVED ZONES/m) +
          2.5 * has(p, /Reproduce them exactly|No copy is authorized/m)
      ),
  },
  {
    key: "originality",
    question: "Does it avoid generic AI-commercial vocabulary, and is the format reasoned about?",
    kind: "MEASURED",
    score: (p) => {
      // The instruction line names these words in order to forbid them; counting
      // it as a violation would penalise the fix.
      const body = p.replace(/^Words like premium.*$/m, "");
      const verdicts = (body.match(VERDICT) || []).length;
      return clamp10(
        4 * has(p, /^ASSET CONTEXT —/m) +
          3 * has(p, /Why this format serves this campaign/m) +
          Math.max(0, 3 - verdicts * 0.5)
      );
    },
  },
  {
    key: "production_realism",
    question: "Did physical and material instruction reach the renderer at all?",
    kind: "PROXY",
    score: (p) =>
      clamp10(
        2 * has(p, /^- MATERIALS & SURFACES:/m) +
          2 * has(p, /^- LIGHTING:/m) +
          2 * has(p, /specular|contact shadow|falloff/i) +
          // Knowledge is where the physical rules live. Its absence is the single
          // largest known gap and this term is what keeps the score honest about it.
          4 * has(p, /^## PROFESSIONAL KNOWLEDGE/m)
      ),
  },
];

export interface QualityReport {
  label: string;
  chars: number;
  scores: Record<string, number>;
  reasoned_sentences: number;
  verdict_words: number;
  total: number;
}

export function evaluate(label: string, prompt: string): QualityReport {
  const scores: Record<string, number> = {};
  for (const c of CRITERIA) scores[c.key] = Number(c.score(prompt).toFixed(1));
  const body = prompt.replace(/^Words like premium.*$/m, "");
  return {
    label,
    chars: prompt.length,
    scores,
    reasoned_sentences: (prompt.match(REASONED) || []).length,
    verdict_words: (body.match(VERDICT) || []).length,
    total: Number(
      (Object.values(scores).reduce((a, b) => a + b, 0) / CRITERIA.length).toFixed(2)
    ),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error("usage: run-creative-quality-benchmark <directory of .txt prompts>");
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  const reports = files.map((f) =>
    evaluate(path.basename(f, ".txt"), fs.readFileSync(path.join(dir, f), "utf-8"))
  );

  const keys = CRITERIA.map((c) => c.key);
  const head = ["case".padEnd(20), ...keys.map((k) => k.slice(0, 9).padEnd(10)), "TOTAL"];
  console.log("\nUNIVERSAL CREATIVE QUALITY FRAMEWORK  (0-10 per criterion)\n");
  console.log(head.join(""));
  console.log("-".repeat(head.join("").length));
  for (const r of reports) {
    console.log(
      [r.label.slice(0, 19).padEnd(20), ...keys.map((k) => String(r.scores[k]).padEnd(10)), r.total].join("")
    );
  }
  const mean = (k: string) => reports.reduce((a, r) => a + r.scores[k], 0) / reports.length;
  console.log("-".repeat(head.join("").length));
  console.log(["MEAN".padEnd(20), ...keys.map((k) => mean(k).toFixed(1).padEnd(10)),
    (reports.reduce((a, r) => a + r.total, 0) / reports.length).toFixed(2)].join(""));
  console.log(
    "\nkind: " + CRITERIA.map((c) => `${c.key}=${c.kind}`).join("  ")
  );
  console.log(
    `\nreasoned sentences (mean): ${(reports.reduce((a, r) => a + r.reasoned_sentences, 0) / reports.length).toFixed(1)}` +
      `   verdict words (mean): ${(reports.reduce((a, r) => a + r.verdict_words, 0) / reports.length).toFixed(1)}` +
      `   chars (mean): ${Math.round(reports.reduce((a, r) => a + r.chars, 0) / reports.length)}`
  );
}
