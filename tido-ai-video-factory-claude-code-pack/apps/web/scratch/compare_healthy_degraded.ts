import fs from "fs";
import crypto from "crypto";

const healthy = fs.readFileSync("scratch/run1_healthy_final_provider_prompt.txt", "utf8");
const degraded = fs.readFileSync("scratch/full_verbatim_provider_prompt.txt", "utf8");

const healthyHash = crypto.createHash("sha256").update(healthy, "utf8").digest("hex");
const degradedHash = crypto.createHash("sha256").update(degraded, "utf8").digest("hex");

console.log("=== HEALTHY PROMPT ===");
console.log("Chars:", healthy.length);
console.log("Bytes:", Buffer.byteLength(healthy, "utf8"));
console.log("SHA-256:", healthyHash);

console.log("\n=== DEGRADED PROMPT ===");
console.log("Chars:", degraded.length);
console.log("Bytes:", Buffer.byteLength(degraded, "utf8"));
console.log("SHA-256:", degradedHash);

console.log("\nDelta chars (healthy - degraded):", healthy.length - degraded.length);
