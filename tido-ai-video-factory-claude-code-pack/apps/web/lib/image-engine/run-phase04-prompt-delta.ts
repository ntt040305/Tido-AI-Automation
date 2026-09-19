import crypto from "crypto";
import { MasterPromptCompilerService } from "./compiler/MasterPromptCompilerService";
import type { MasterPromptCompilerInput } from "./types";
import type { KnowledgePackageV1 } from "./types";
import type { RoutingResultSchema } from "./types";

/**
 * Phase 0.4-A — proof that Creative Director decisions reach the prompt.
 *
 *   npx tsx lib/image-engine/run-phase04-prompt-delta.ts
 *
 * Offline, deterministic, no model, no render, no cost. It compiles the SAME
 * brief twice through the REAL compiler, moving one input — authority off, then
 * on — and compares the two compiled prompts byte for byte.
 *
 * Why this benchmark exists
 * -------------------------
 * E2 measured the previous state honestly and the answer was uncomfortable.
 * The tier ladder moved every dimension from USER to CREATIVE_DIRECTOR in 12
 * of 12 renders, and the prompt kept announcing those same lines as "EXPLICIT
 * CLIENT DIRECTIVES ... never substitute a house default" in 12/12 prompts of
 * BOTH arms. Scored across 24 renders the arms differed by +0.14 once two
 * provider-side label failures were set aside — which is what a change that
 * never reached the model looks like from the outside.
 *
 * A render benchmark could not catch that, because a stochastic provider makes
 * every pair of images differ whether or not the prompt did. Only the prompt
 * bytes can answer it, so this compares those and nothing else.
 *
 * It exits non-zero when the two prompts are identical. That is the whole
 * contract: a fix that stops reaching the compiler fails here rather than
 * quietly costing another 24 renders to discover.
 */

const sha = (s: string) => crypto.createHash("sha256").update(s, "utf-8").digest("hex");

const routing: RoutingResultSchema = {
  routing_version: "1.0",
  routing_mode: "HIGH_CONFIDENCE",
  requires_universal_core: true,
  products: [
    {
      product_id: "PRODUCT_01",
      reference_ids: ["REF_01"],
      reference_relationship_confidence: 1.0,
      summary: "A capped glass bottle with a printed paper label",
      categories: [],
      industry_domains: [],
      likely_functions: [],
      materials: [
        { value: "Glass", confidence: 0.9, evidence_type: "OBSERVED", evidence_summary: "Glass body observed" },
      ],
      contents: [],
      surface_properties: [],
      geometry_traits: [],
      packaging_types: [],
      branding_features: [],
      visual_challenges: [],
      unknowns: [],
      retrieval_queries: [],
    },
  ],
  global_retrieval_queries: [],
  routing_summary: "Single bottled product",
};

const knowledge: KnowledgePackageV1 = {
  package_version: "1.0",
  routing_version: "1.0",
  retrieval_mode: "HYBRID",
  requires_universal_core: true,
  universal_blocks: [
    {
      id: "universal.commercial_visual_hierarchy",
      version: "1.0.1",
      title: "Commercial Visual Hierarchy",
      knowledge_type: "UNIVERSAL",
      selection_tier: "UNIVERSAL",
      matched_signals: [],
      estimated_tokens: 150,
      scores: {
        metadata: 1.0,
        semantic: 1.0,
        signal_confidence: 1.0,
        information_value: 1.0,
        priority: 1.0,
        query_importance: 1.0,
        redundancy_penalty: 0,
      },
      final_score: 1.0,
      selection_reasons: ["Universal core block"],
    },
  ],
  selected_blocks: [],
  rejected_candidates: [],
  warnings: [],
  stats: {
    repository_blocks: 0,
    metadata_candidates: 0,
    semantic_candidates: 0,
    fused_candidates: 0,
    selected_blocks: 0,
    estimated_tokens: 0,
    duration_ms: 0,
  },
};

/**
 * The interpretation is the point of the test.
 *
 * None of these four requirements was typed by the client — they are
 * `CreativeInterpretationService` reading one sentence of brief. Under
 * authority they are the director's calls, and the prompt has to say so.
 */
const creativeInterpretation: any = {
  locked_intent: {
    subject: ["the bottle"],
    environment: ["a steel counter at opening"],
    mood: ["early", "unhurried"],
    style: [],
    emotional_goal: "recognition rather than aspiration",
    camera_requirements: ["eye-level with the centre of the bottle", "straight-on perpendicular axis"],
    lighting_requirements: ["one window source raking across the steel, no fill"],
    composition_requirements: ["the bottle off-centre left, negative space carrying the queue"],
    material_requirements: ["glass reads cold, label paper reads matte"],
    non_negotiable_constraints: [],
  },
  ai_enhancement: {},
};

const baseInput: MasterPromptCompilerInput = {
  brief: "Giới thiệu cold brew pha mỗi sáng tại quán.",
  productCount: 1,
  brandName: "Cafe Florian",
  brandInfo: "A neighbourhood roaster, six years old",
  copyItems: ["Rang mỗi sáng", "từ 6h"],
  hardRequirements: [],
  useCase: "Poster",
  aspectRatio: "9:16",
  productReferences: [{ reference_id: "REF_01", product_id: "PRODUCT_01", input_index: 0 }],
  routingResult: routing,
  knowledgePackage: knowledge,
  creativeInterpretation,
} as MasterPromptCompilerInput;

async function main() {
  const compiler = new MasterPromptCompilerService();

  const off = await compiler.compile({ ...baseInput, creativeDirectorAuthority: false });
  const on = await compiler.compile({
    ...baseInput,
    creativeDirectorAuthority: true,
    // Nothing locked: every requirement above is an inference, so all four
    // dimensions belong to the director.
    userLockedDimensions: {},
  });

  if (!off.success || !on.success || !off.package || !on.package) {
    console.error("ABORTED: the compiler did not return a package.");
    console.error("  OFF:", off.success ? "ok" : JSON.stringify(off.error));
    console.error("  ON :", on.success ? "ok" : JSON.stringify(on.error));
    process.exit(2);
  }

  const offPrompt = off.package.compiled_prompt;
  const onPrompt = on.package.compiled_prompt;
  const offHash = sha(offPrompt);
  const onHash = sha(onPrompt);

  console.log("\n=== Phase 0.4-A — OFF vs ON compiled prompt ===\n");
  console.log(`  OFF  ${offHash.slice(0, 16)}  ${offPrompt.length} chars`);
  console.log(`  ON   ${onHash.slice(0, 16)}  ${onPrompt.length} chars`);

  const clientHeader = "EXPLICIT CLIENT DIRECTIVES";
  const directorHeader = "ART DIRECTOR'S DECISIONS";
  const count = (s: string, needle: string) => s.split(needle).length - 1;

  console.log("\n  Directive blocks");
  console.log(`    OFF  client: ${count(offPrompt, clientHeader)}   director: ${count(offPrompt, directorHeader)}`);
  console.log(`    ON   client: ${count(onPrompt, clientHeader)}   director: ${count(onPrompt, directorHeader)}`);

  const protectionPresent = [offPrompt, onPrompt].every((p) => p.includes("PRODUCT IDENTITY PROTECTION"));
  console.log(`\n  Product identity protection present in both arms: ${protectionPresent ? "yes" : "NO"}`);

  const failures: string[] = [];
  if (offHash === onHash) {
    failures.push("the two prompts are byte-identical: the director's decisions do not reach the compiler");
  }
  if (count(offPrompt, directorHeader) !== 0) {
    failures.push("the OFF arm attributes lines to the director");
  }
  if (count(onPrompt, directorHeader) !== 1) {
    failures.push("the ON arm does not carry exactly one director block");
  }
  if (count(onPrompt, clientHeader) !== 0) {
    failures.push("the ON arm still calls the director's inferences explicit client directives");
  }
  if (!protectionPresent) {
    failures.push("product identity protection is missing from at least one arm");
  }

  console.log("\n" + "=".repeat(74));
  if (failures.length) {
    console.log("FAILED");
    for (const f of failures) console.log(`  - ${f}`);
    console.log("=".repeat(74) + "\n");
    process.exit(1);
  }
  console.log("PASSED — the compiled prompt changes when the director gains authority");
  console.log("=".repeat(74) + "\n");
}

main().catch((err) => {
  if (process.env.DELTA_TRACE) console.error(err);
  console.error("ABORTED:", err?.message || err);
  process.exit(2);
});
