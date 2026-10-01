import fs from "fs";

const prompt = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");

function showSection(name: string) {
  const start = prompt.indexOf(name);
  if (start === -1) {
    console.log("NOT FOUND:", name);
    return;
  }
  const next = prompt.indexOf("\n\n## ", start + name.length);
  console.log(`=== ${name} ===`);
  console.log(prompt.slice(start, next !== -1 ? next : start + 1000));
}

showSection("## USER HARD REQUIREMENTS");
showSection("## ART DIRECTION");
