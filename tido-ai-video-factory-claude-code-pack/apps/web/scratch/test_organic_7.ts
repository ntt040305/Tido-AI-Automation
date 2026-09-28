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

  // Option E: Integrated Editorial Title Block
  // - Warm deep tone matching the darkest roast in the bottle: #1e140e
  // - Eyebrow / kicker: "ORIGIN BLEND • COLD BREW"
  // - Headline: "Slow mornings." in Playfair Display
  // - Supporting line: "Crafted for unhurried rituals" or "Done properly"
  // - Fine editorial accent bar in warm amber gold
  const svgE = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <filter id="natural_embed" x="-20%" y="-20%" width="140%" height="140%">
        <!-- Soft warm ambient light bounce behind text -->
        <feOffset dx="0" dy="1.5" in="SourceGraphic" result="off"/>
        <feGaussianBlur in="off" stdDeviation="1" result="blur"/>
        <feFlood flood-color="#2c1a0e" flood-opacity="0.22" result="shadow_color"/>
        <feComposite in="shadow_color" in2="blur" operator="in" result="shadow"/>
        <feMerge>
          <feMergeNode in="shadow"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#natural_embed)">
      <text x="648" y="248"
        font-family="'Montserrat', 'Segoe UI', sans-serif" font-size="11" font-weight="600"
        letter-spacing="3" fill="#8c6d48">ORIGIN BLEND</text>
      <text x="646" y="295"
        font-family="'Playfair Display', Georgia, serif" font-size="46" font-weight="600"
        letter-spacing="0.5" fill="#1e140e">Slow mornings</text>
      <line x1="648" y1="316" x2="715" y2="316" stroke="#b08d57" stroke-width="1.2" stroke-opacity="0.8"/>
      <text x="648" y="348"
        font-family="'Montserrat', 'Segoe UI', sans-serif" font-size="14" font-weight="400"
        letter-spacing="2" fill="#4d3c32">Cold brew, done properly</text>
    </g>
  </svg>`;

  const outE = await sharp(sceneBuf).composite([{ input: Buffer.from(svgE), top: 0, left: 0 }]).png().toBuffer();
  const fileE = path.join(process.cwd(), "scratch/option_e_titleblock.png");
  fs.writeFileSync(fileE, outE);

  console.log("Judging Option E (Integrated Editorial Title Block)...");
  const scoresE = await judgeRender(fileE, brief);
  console.log("Scores E:", scoresE);
  console.log("Mean E:", mean(scoresE.map(s => s.score)));
}

main().catch(console.error);
