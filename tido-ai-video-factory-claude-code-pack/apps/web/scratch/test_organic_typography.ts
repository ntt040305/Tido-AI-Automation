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

  // Test C: Editorial Integrated Typography
  // Color sampled from deep coffee liquid: #231815
  // Subline in warm stone dark tone: #4a3b32
  // Subtle warm ambient bleed shadow
  // Refined editorial hierarchy
  const svgC = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <filter id="organic_ink" x="-20%" y="-20%" width="140%" height="140%">
        <feOffset dx="0" dy="1.5" in="SourceGraphic" result="off"/>
        <feGaussianBlur in="off" stdDeviation="1.2" result="blur"/>
        <feFlood flood-color="#1e130c" flood-opacity="0.18" result="shadow_color"/>
        <feComposite in="shadow_color" in2="blur" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <!-- Editorial Headline & Subhead in upper-right quiet space -->
    <g filter="url(#organic_ink)">
      <text x="650" y="260"
        font-family="'Playfair Display', Georgia, serif" font-size="44" font-weight="600"
        letter-spacing="0.5" fill="#231815">Slow mornings</text>
      <line x1="652" y1="282" x2="710" y2="282" stroke="#b08d57" stroke-width="1.5" stroke-opacity="0.7"/>
      <text x="652" y="315"
        font-family="'Montserrat', 'Segoe UI', sans-serif" font-size="14" font-weight="500"
        letter-spacing="2.5" fill="#54443b">COLD BREW, DONE PROPERLY</text>
    </g>
  </svg>`;

  const outC = await sharp(sceneBuf).composite([{ input: Buffer.from(svgC), top: 0, left: 0 }]).png().toBuffer();
  const fileC = path.join(process.cwd(), "scratch/option_c_editorial.png");
  fs.writeFileSync(fileC, outC);

  console.log("Judging Option C (Editorial Integrated Typography with Accent Line & Deep Roast Tone)...");
  const scoresC = await judgeRender(fileC, brief);
  console.log("Scores C:", scoresC);
  console.log("Mean C:", mean(scoresC.map(s => s.score)));

  // Test D: Warm tonal integration without rule line (pure type, tone-matched to scene)
  const svgD = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <filter id="ambient_tone" x="-20%" y="-20%" width="140%" height="140%">
        <feOffset dx="0" dy="1.2" in="SourceGraphic" result="off"/>
        <feGaussianBlur in="off" stdDeviation="1.0" result="blur"/>
        <feFlood flood-color="#2a1b12" flood-opacity="0.14" result="shadow_color"/>
        <feComposite in="shadow_color" in2="blur" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#ambient_tone)">
      <text x="645" y="265"
        font-family="'Playfair Display', Georgia, serif" font-size="45" font-weight="600"
        letter-spacing="1" fill="#251a14">Slow mornings</text>
      <text x="647" y="306"
        font-family="'Montserrat', 'Segoe UI', sans-serif" font-size="16" font-weight="400"
        letter-spacing="1.5" fill="#58483f">Cold brew, done properly</text>
    </g>
  </svg>`;

  const outD = await sharp(sceneBuf).composite([{ input: Buffer.from(svgD), top: 0, left: 0 }]).png().toBuffer();
  const fileD = path.join(process.cwd(), "scratch/option_d_tonal.png");
  fs.writeFileSync(fileD, outD);

  console.log("Judging Option D (Warm Tonal Tone-Matched Pure Type)...");
  const scoresD = await judgeRender(fileD, brief);
  console.log("Scores D:", scoresD);
  console.log("Mean D:", mean(scoresD.map(s => s.score)));
}

main().catch(console.error);
