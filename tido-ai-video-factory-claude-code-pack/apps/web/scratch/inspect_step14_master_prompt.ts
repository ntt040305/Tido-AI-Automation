import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "data/generated/image-renders/gen_1790693394976_qfaeq");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8"));
console.log("Metadata:", JSON.stringify(meta, null, 2));

const prompt = fs.readFileSync(path.join(dir, "master_prompt.md"), "utf8");
console.log("Master prompt total length:", prompt.length);

fs.writeFileSync("scratch/step14_final_prompt.txt", prompt);

// 1. Extract COMMERCIAL LAYOUT
const commStart = prompt.indexOf("## COMMERCIAL LAYOUT");
const nextSec = prompt.indexOf("\n\n## ", commStart + 5);
const commLayoutText = prompt.slice(commStart, nextSec !== -1 ? nextSec : undefined);
console.log("\n==================== STEP 14: COMMERCIAL LAYOUT ====================");
console.log(commLayoutText);

// 2. Extract THE COMPOSITION
const compStart = prompt.indexOf("THE COMPOSITION\n");
const compEnd = prompt.indexOf("\n\n## TYPOGRAPHY ART DIRECTION", compStart);
const compText = prompt.slice(compStart, compEnd !== -1 ? compEnd : undefined);
console.log("\n==================== STEP 14: THE COMPOSITION ====================");
console.log(compText);

// 3. Extract TYPOGRAPHY ART DIRECTION
const typoStart = prompt.indexOf("TYPOGRAPHY ART DIRECTION\n");
const typoEnd = prompt.indexOf("\n\nTEXT IN THE IMAGE", typoStart);
const typoText = prompt.slice(typoStart, typoEnd !== -1 ? typoEnd : undefined);
console.log("\n==================== STEP 14: TYPOGRAPHY ART DIRECTION ====================");
console.log(typoText);
