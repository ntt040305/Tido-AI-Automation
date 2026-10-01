import fs from "fs";
import path from "path";

// 1. Load env and set timeout BEFORE any module import
const file = path.join(process.cwd(), ".env.local");
if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Ensure 180s timeout is set in process.env BEFORE CreativeDirectorV1 is loaded
process.env.LLM_DIRECTOR_TIMEOUT_MS = "180000";

async function main() {
  // Dynamically import CreativeDirectorV1 after env is configured
  const { CreativeDirectorV1 } = await import("../lib/image-engine/evolution/experiment/CreativeDirectorV1");
  const { toCreativeDecision } = await import("../lib/image-engine/evolution/experiment/CreativeDirectorV1");
  const { MarketingBrainService } = await import("../lib/image-engine/llm/marketing-brain.service");
  const { MasterPromptCompilerService } = await import("../lib/image-engine/compiler/MasterPromptCompilerService");
  const { NanoBananaPromptComposer } = await import("../lib/image-engine/evolution/experiment/NanoBananaPromptComposer");

  console.log("Starting Healthy-Path Creative Director Execution...");
  const director = new CreativeDirectorV1();

  const brief = {
    concept: "Luxury organic Centella Asiatica calming serum bottle resting on textured travertine stone platform, warm morning Mediterranean daylight, soft green botanical accents, elegant editorial skincare aesthetic",
    contentMessage: "Barrier Calm Serum. Botanical recovery for sensitive skin.",
    useCase: "Poster",
    aspectRatio: "1:1",
    brandName: "AURA BOTANICA",
    industry: "skincare",
    objective: "Establish clinical credibility and organic luxury desire",
    audience: "Discerning consumers seeking natural clinical dermatological care",
    textRequirement: {
      mode: "required" as const,
      lines: [
        { role: "headline" as const, text: "Barrier Calm Serum" },
        { role: "cta" as const, text: "Botanical recovery for sensitive skin." },
      ],
    },
  };

  const judgmentFlags = {
    exploration: true,
    reasoning: true,
    antiGeneric: true,
    strategy: true,
    consumer: true,
    brand: true,
    semantics: true,
    review: true,
    copyRoles: true,
    formatChallenge: false,
    strategySelection: false,
    multiProductStaging: false,
  };

  const t0 = Date.now();
  console.log("Calling director.judge() with 180s timeout...");
  const rawJudgment = await director.judge(brief, judgmentFlags);
  const elapsed = Date.now() - t0;
  console.log(`Director finished in ${elapsed}ms. Result:`, rawJudgment ? "SUCCESS" : "NULL");

  if (!rawJudgment) {
    console.error("Director returned null!");
    process.exit(1);
  }

  fs.writeFileSync("scratch/healthy_judgment.json", JSON.stringify(rawJudgment, null, 2), "utf8");
  console.log("Saved scratch/healthy_judgment.json successfully!");

  // Now call MarketingBrainService with the brief to compare side-by-side
  console.log("\nCalling MarketingBrainService.generateStrategy()...");
  const brain = new MarketingBrainService();
  const brainStrategy = await brain.generateStrategy({
    concept: brief.concept,
    useCase: brief.useCase,
    aspectRatio: brief.aspectRatio,
    brandName: brief.brandName,
    copyItems: ["Barrier Calm Serum", "Botanical recovery for sensitive skin."],
    targetAudience: brief.audience,
    marketingGoal: brief.objective,
  });

  fs.writeFileSync("scratch/healthy_brain_strategy.json", JSON.stringify(brainStrategy, null, 2), "utf8");
  console.log("Saved scratch/healthy_brain_strategy.json successfully!");

  console.log("\nBoth CreativeDirector and MarketingBrain completed successfully!");
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
