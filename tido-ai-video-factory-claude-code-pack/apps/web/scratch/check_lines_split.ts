import fs from "fs";

const content = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");
const lines = content.split("\n");

console.log("Total lines:", lines.length);
console.log("Total chars:", content.length);

const p1 = lines.slice(0, 116).join("\n") + "\n";
const p2 = lines.slice(116, 245).join("\n") + "\n";
const p3 = lines.slice(245).join("\n");

console.log("P1 chars:", p1.length, "lines:", 116);
console.log("P2 chars:", p2.length, "lines:", 129);
console.log("P3 chars:", p3.length, "lines:", lines.length - 245);

const reassembled = p1 + p2 + p3;
console.log("Match:", reassembled === content);
console.log("Reassembled chars:", reassembled.length);
