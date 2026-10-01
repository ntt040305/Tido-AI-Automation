import fs from "fs";

const prompt = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");
console.log("Total length:", prompt.length);

const N = 4;
const chunkSize = Math.ceil(prompt.length / N);
const parts: string[] = [];

for (let i = 0; i < N; i++) {
  const start = i * chunkSize;
  const end = Math.min((i + 1) * chunkSize, prompt.length);
  parts.push(prompt.slice(start, end));
}

let sum = 0;
parts.forEach((p, i) => {
  console.log(`Part ${i + 1}: start=${i * chunkSize}, len=${p.length}`);
  sum += p.length;
});
console.log("Reassembled matches original:", parts.join("") === prompt);
console.log("Sum chars:", sum);
