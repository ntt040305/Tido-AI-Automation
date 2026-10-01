import fs from "fs";

const logPath = "C:/Users/HP/.gemini/antigravity-ide/brain/5afa0784-70d3-457b-8cb7-d2efca3941ff/.system_generated/tasks/task-5322.log";
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.split("\n");
  console.log("Total lines:", lines.length);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes("generationId") || l.includes("gen_") || l.includes("finalPrompt") || l.includes("CHECKPOINT")) {
      console.log(`Line ${i}: ${l.slice(0, 120)}`);
    }
  }
} else {
  console.log("Log does not exist at:", logPath);
}
