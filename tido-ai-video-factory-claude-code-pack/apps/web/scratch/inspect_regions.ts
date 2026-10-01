import fs from "fs";
import path from "path";

const checkpointsPath = path.join(process.cwd(), "scratch/healthy_checkpoints.json");
const checkpoints = JSON.parse(fs.readFileSync(checkpointsPath, "utf8"));

const cpA = checkpoints[0].prompt_text;
const cpC = checkpoints[2].prompt_text;

console.log("cpA length:", cpA.length);
console.log("cpC length:", cpC.length);

// Find first difference between cpA and cpC
let diffIndex = -1;
for (let i = 0; i < Math.min(cpA.length, cpC.length); i++) {
  if (cpA[i] !== cpC[i]) {
    diffIndex = i;
    break;
  }
}

console.log("First diff index:", diffIndex);
if (diffIndex !== -1) {
  console.log("cpA around diff:\n", JSON.stringify(cpA.slice(diffIndex - 50, diffIndex + 50)));
  console.log("cpC around diff:\n", JSON.stringify(cpC.slice(diffIndex - 50, diffIndex + 50)));
} else {
  console.log("cpC starts with cpA! Then cpC.startsWith(cpA) must have been true unless length was smaller?");
}
