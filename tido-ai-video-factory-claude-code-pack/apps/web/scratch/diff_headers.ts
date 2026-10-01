import fs from "fs";

const healthy = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");
const degraded = fs.readFileSync("scratch/full_verbatim_provider_prompt.txt", "utf8");

function listSections(p: string) {
  const lines = p.split("\n");
  const headers: string[] = [];
  lines.forEach((l, i) => {
    if (l.startsWith("## ") || l.startsWith("# ") || l === "THE COMPOSITION" || l === "TYPOGRAPHY ART DIRECTION" || l.startsWith("TEXT IN THE IMAGE") || l.startsWith("CREATIVE BLUEPRINT")) {
      headers.push(l);
    }
  });
  return headers;
}

console.log("HEALTHY HEADERS:");
console.log(listSections(healthy));

console.log("\nDEGRADED HEADERS:");
console.log(listSections(degraded));
