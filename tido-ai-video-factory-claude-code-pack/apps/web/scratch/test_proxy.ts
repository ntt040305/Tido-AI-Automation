import fs from "fs";
import path from "path";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

async function main() {
  const baseUrl = process.env.LLM_BASE_URL || "http://127.0.0.1:8317/v1";
  const apiKey = process.env.LLM_API_KEY || "";
  const model = process.env.LLM_MODEL || "claude-sonnet-4-6";

  console.log("Testing proxy with baseUrl:", baseUrl, "model:", model);

  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Hi! Reply with 'OK'." }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(30000),
    });

    console.log("HTTP status:", res.status, "in", Date.now() - t0, "ms");
    const json = await res.json();
    console.log("Response:", JSON.stringify(json));
  } catch (err: any) {
    console.error("Fetch failed in", Date.now() - t0, "ms:", err.message);
  }
}

main();
