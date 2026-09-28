import fs from "fs";
import path from "path";
import sharp from "sharp";
import { judgeRender, mean } from "../lib/image-engine/benchmark/CreativeQualityJudge";
import { BENCHMARK_BRIEFS } from "../lib/image-engine/benchmark/creative-quality-dataset";

async function main() {
  const scenePath = path.join(
    process.cwd(),
    "data/generated/image-renders/bench-beverage_coffee_premium-1790580795089/layers/scene.png"
  );
  const sceneBuf = fs.readFileSync(scenePath);
  const brief = BENCHMARK_BRIEFS.find((b) => b.id === "beverage_coffee_premium")!;

  // Test Option A: Centered top (symmetrical editorial hierarchy)
  // Headline: "Slow mornings" at y: 65, font-size: 38px, letter-spacing: 0.08em
  // Subheadline: "Cold brew, done properly" at y: 110, font-size: 16px, letter-spacing: 0.12em
  // All above y: 155 (cap is at y: 164)
  const svgTop = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <filter id="subtle_shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feOffset dx="0" dy="1" in="SourceGraphic" result="off"/>
        <feGaussianBlur in="off" stdDeviation="1.5" result="blur"/>
        <feFlood flood-color="#2a241e" flood-opacity="0.15" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <text text-anchor="middle" x="512" y="78"
      font-family="'Playfair Display', Georgia, serif" font-size="42" font-weight="600"
      letter-spacing="2.5" fill="#1c1917" filter="url(#subtle_shadow)">Slow mornings</text>
    <text text-anchor="middle" x="512" y="122"
      font-family="'Montserrat', 'Segoe UI', sans-serif" font-size="16" font-weight="400"
      letter-spacing="3" fill="#44403c" filter="url(#subtle_shadow)">COLD BREW, DONE PROPERLY</text>
  </svg>`;

  const outTop = await sharp(sceneBuf).composite([{ input: Buffer.from(svgTop), top: 0, left: 0 }]).png().toBuffer();
  const fileTop = path.join(process.cwd(), "scratch/option_a_top.png");
  fs.writeFileSync(fileTop, outTop);

  console.log("Judging Option A (Centered Top Symmetrical)...");
  const scoresA = await judgeRender(fileTop, brief);
  console.log("Scores A:", scoresA);
  console.log("Mean A:", mean(scoresA.map(s => s.score)));

  // Test Option B: Refined side with crisp rendering (no blur), elegant left-alignment or subtle plate
  const svgSide = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <filter id="subtle_shadow_b" x="-20%" y="-20%" width="140%" height="140%">
        <feOffset dx="0" dy="1" in="SourceGraphic" result="off"/>
        <feGaussianBlur in="off" stdDeviation="1.5" result="blur"/>
        <feFlood flood-color="#2a241e" flood-opacity="0.15" result="color"/>
        <feComposite in="color" in2="blur" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <text text-anchor="start" x="660" y="275"
      font-family="'Playfair Display', Georgia, serif" font-size="44" font-weight="600"
      letter-spacing="1.5" fill="#1c1917" filter="url(#subtle_shadow_b)">Slow mornings</text>
    <text text-anchor="start" x="662" y="318"
      font-family="'Montserrat', 'Segoe UI', sans-serif" font-size="17" font-weight="400"
      letter-spacing="2" fill="#57534e" filter="url(#subtle_shadow_b)">Cold brew, done properly</text>
  </svg>`;

  const outSide = await sharp(sceneBuf).composite([{ input: Buffer.from(svgSide), top: 0, left: 0 }]).png().toBuffer();
  const fileSide = path.join(process.cwd(), "scratch/option_b_side.png");
  fs.writeFileSync(fileSide, outSide);

  console.log("Judging Option B (Refined Crisp Side)...");
  const scoresB = await judgeRender(fileSide, brief);
  console.log("Scores B:", scoresB);
  console.log("Mean B:", mean(scoresB.map(s => s.score)));
}

main().catch(console.error);
