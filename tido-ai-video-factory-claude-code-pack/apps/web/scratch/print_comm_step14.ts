import fs from "fs";

const prompt = fs.readFileSync("scratch/step14_final_prompt.txt", "utf8");
const commStart = prompt.indexOf("## COMMERCIAL LAYOUT");
console.log(prompt.slice(commStart, commStart + 2200));
