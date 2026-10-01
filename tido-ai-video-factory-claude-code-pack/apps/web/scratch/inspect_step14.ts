import fs from "fs";
import path from "path";

const cpPath = path.join(process.cwd(), "scratch/healthy_checkpoints.json");
const cp = JSON.parse(fs.readFileSync(cpPath, "utf8"));

console.log("Checkpoints count in healthy_checkpoints.json:", cp.length);
cp.forEach((c: any) => {
  console.log(`- Checkpoint ${c.checkpoint}: gen_id=${c.generation_id}, chars=${c.prompt_chars}, sha256=${c.sha256}`);
});

// Let's save these to step14_checkpoints.json
fs.writeFileSync("scratch/step14_checkpoints.json", JSON.stringify(cp, null, 2));

const finalCp = cp.find((c: any) => c.checkpoint === "F" || c.checkpoint === "F_HTTP");
if (finalCp) {
  const prompt = finalCp.prompt_text;
  fs.writeFileSync("scratch/step14_final_prompt.txt", prompt);
  console.log("\nStep 14 final prompt saved! Length:", prompt.length);

  // Find ## COMMERCIAL LAYOUT
  const commStart = prompt.indexOf("## COMMERCIAL LAYOUT");
  const nextSec = prompt.indexOf("\n\n## ", commStart + 5);
  console.log("\n=== STEP 14: COMMERCIAL LAYOUT ===");
  console.log(prompt.slice(commStart, nextSec !== -1 ? nextSec : undefined));

  // Find THE COMPOSITION
  const compStart = prompt.indexOf("THE COMPOSITION\n");
  const compEnd = prompt.indexOf("\n\n## TYPOGRAPHY ART DIRECTION", compStart);
  console.log("\n=== STEP 14: THE COMPOSITION ===");
  console.log(prompt.slice(compStart, compEnd !== -1 ? compEnd : undefined));
}
