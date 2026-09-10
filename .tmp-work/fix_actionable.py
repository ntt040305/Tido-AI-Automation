# -*- coding: utf-8 -*-
"""Replace the open-ended imperative whitelist with a shape test."""
import io

p = "lib/image-engine/reasoning/KnowledgeQualityGate.ts"
s = io.open(p, encoding="utf-8").read()

# Locate the ACTION_VERB declaration and everything up to its terminating line.
start = s.index("/**\n * A decision must begin by telling someone to do something.")
end = s.index("\n", s.index("|elevate|lift|lower", start)) + 1

new_block = '''/**
 * Whether a decision tells someone to do something.
 *
 * This began as a whitelist of imperatives and was extended three times, each
 * time because real knowledge used a verb nobody had thought of — "Identify",
 * "Route", "Verify", "Suspend", "Fill". An English imperative list is open-ended,
 * so a whitelist guarantees a steady trickle of correct knowledge being rejected,
 * and a gate that rejects good work is worse than no gate because it is trusted.
 *
 * The test is now the sentence's SHAPE rather than its vocabulary. A descriptive
 * statement announces a subject and then a finite verb — "Younger consumers ARE
 * more active", "The palette IS restrained". An imperative does neither: it opens
 * on a bare verb with the subject implied.
 *
 * Two signals, either of which means descriptive:
 *   1. The sentence opens with a determiner, pronoun or existential.
 *   2. A copula or modal appears within the first five words, which only happens
 *      when a subject preceded it.
 *
 * The known-imperative list is retained purely as a fast accept, so the common
 * cases never reach the heuristic.
 */
const KNOWN_IMPERATIVE = /^(use|apply|choose|select|adopt|frame|anchor|lead|set|build|place|hold|render|prioriti[sz]e|avoid|replace|reject|limit|restrict|reserve|shoot|light|compose|crop|keep|treat|show|cast|ground|isolate|separate|align|scale|reduce|increase|remove|give|work|review|photograph|rake|claim|fill|suspend|divide|split|stack|pair|capture|retain|score|identify|route|match|supply|verify|state|declare)\\b/i;

/** Openers that can only begin a description, never an instruction. */
const DESCRIPTIVE_OPENER = /^(the|a|an|this|that|these|those|it|its|they|their|them|we|our|us|you|your|i|my|he|she|his|her|there|here|most|many|some|all|every|each|both|either|neither|when|if|while|although|because|since|however|therefore|thus|so)\\b/i;

/** A finite verb this close to the start implies a subject came before it. */
const EARLY_COPULA = /^(?:\\S+\\s+){0,4}(is|are|was|were|be|been|being|has|have|had|will|would|can|could|should|shall|may|might|must|does|do|did|tends|seems|appears)\\b/i;

function isActionable(decision: string): boolean {
  const d = (decision || "").trim();
  if (!d) return false;
  if (KNOWN_IMPERATIVE.test(d)) return true;
  if (DESCRIPTIVE_OPENER.test(d)) return false;
  if (EARLY_COPULA.test(d)) return false;
  return true;
}
'''

s = s[:start] + new_block + s[end:]

# Route both call sites through the shape test.
s = s.replace("const actionable = ACTION_VERB.test(decision);", "const actionable = isActionable(decision);")
s = s.replace("if (decision && !ACTION_VERB.test(decision)) {", "if (decision && !isActionable(decision)) {")

assert "ACTION_VERB" not in s, "an ACTION_VERB reference survived"
io.open(p, "w", encoding="utf-8").write(s)
print("replaced the imperative whitelist with a sentence-shape test")
