import fs from "fs";
import path from "path";

const prompt = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");

// 1. Find ## COMMERCIAL LAYOUT
const commLayoutStart = prompt.indexOf("## COMMERCIAL LAYOUT");
const nextSection = prompt.indexOf("\n\n## ", commLayoutStart + 5);
const commLayoutText = prompt.slice(commLayoutStart, nextSection !== -1 ? nextSection : undefined);

console.log("=== COMMERCIAL LAYOUT SECTION IN PROMPT ===");
console.log("Start offset:", commLayoutStart);
console.log("End offset:", commLayoutStart + commLayoutText.length);
console.log("Length:", commLayoutText.length);
console.log(commLayoutText);

// 2. Find THE COMPOSITION
const compStart = prompt.indexOf("THE COMPOSITION\n");
const compEnd = prompt.indexOf("\n\n## TYPOGRAPHY ART DIRECTION", compStart);
const compText = prompt.slice(compStart, compEnd !== -1 ? compEnd : undefined);

console.log("\n=== THE COMPOSITION SECTION IN PROMPT ===");
console.log("Start offset:", compStart);
console.log("End offset:", compStart + compText.length);
console.log("Length:", compText.length);
console.log(compText);
