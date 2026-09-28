import fs from "fs";
import path from "path";
import { buildGeometry } from "../lib/image-engine/evolution/experiment/LayoutGeometry";
import { buildTypographySystem, assignTextRoles, geometryRolesFor } from "../lib/image-engine/evolution/experiment/TypographySystem";
import { buildCreativeDocument } from "../lib/image-engine/evolution/experiment/CreativeDocument";
import { normalizeBrandKit } from "../lib/image-engine/evolution/experiment/BrandKit";
import { resolveTextRequirement } from "../lib/image-engine/compiler/ExactCopyIntegrityValidator";
import { buildTypographyPlan } from "../lib/image-engine/evolution/experiment/TypographyPlan";
import { composeEditable, editableTelemetry } from "../lib/image-engine/evolution/experiment/EditableDesign";
import { judgeRender, mean } from "../lib/image-engine/benchmark/CreativeQualityJudge";
import { BENCHMARK_BRIEFS } from "../lib/image-engine/benchmark/creative-quality-dataset";

async function main() {
  const scenePath = path.join(
    process.cwd(),
    "data/generated/image-renders/bench-beverage_coffee_premium-1790580795089/layers/scene.png"
  );
  const sceneBuf = fs.readFileSync(scenePath);

  const decisionsPath = path.join(
    process.cwd(),
    "data/benchmarks/creative-quality/2026-09-28T07-33-15-087Z/cases/beverage_coffee_premium/decisions.json"
  );
  const decisions = JSON.parse(fs.readFileSync(decisionsPath, "utf-8"));
  const blueprint = decisions.blueprint;

  const brief = BENCHMARK_BRIEFS.find((b) => b.id === "beverage_coffee_premium")!;
  const lines = brief.contentMessage!.split("\n");

  const kit = normalizeBrandKit({
    name: brief.brandName || "Origin Blend",
    colors: [{ hex: "#1f3a2e", role: "primary" }, { hex: "#e8b04a", role: "accent" }, { hex: "#f4efe6", role: "background" }],
    fonts: { heading: "Playfair Display", body: "Montserrat" },
    has_logo: false,
  });

  const req = resolveTextRequirement({ contentMessage: lines.join("\n") });
  const assigned = assignTextRoles(req.lines, decisions.judgment?.copy_roles);
  const geometry = buildGeometry({
    ratio: brief.aspectRatio,
    copyRoles: geometryRolesFor(assigned),
    productCount: 1,
    brandKit: kit,
    blueprint,
  });
  const typography = buildTypographySystem({
    geometry,
    lines: assigned,
    brandKit: kit,
    blueprint,
  });
  const plan = buildTypographyPlan({
    mode: req.mode,
    lines: assigned,
    geometry,
    typography,
    brandKit: kit,
    ratio: brief.aspectRatio,
    blueprint,
  });
  const doc = buildCreativeDocument({
    geometry,
    typography,
    brandKit: kit,
    canvasLongEdge: 2048,
    plan,
    blueprint,
  });

  const composed = await composeEditable({
    document: doc,
    brandKit: kit,
    scene: sceneBuf,
    plan,
    blueprint,
    category: brief.category,
    logo: null,
  });

  console.log("Telemetry:", editableTelemetry(composed.design));
  console.log("Typography DNA:", composed.design.typography_dna);
  console.log("Layers:", composed.design.layers.map(l => ({
    kind: l.kind,
    role: (l as any).role,
    effect: (l as any).effect,
    x: l.x,
    y: l.y,
    w: l.width,
    h: l.height,
    content: (l as any).content,
    font_family: (l as any).font_family,
    font_size: (l as any).font_size,
    color: (l as any).color
  })));

  const testOut = path.join(process.cwd(), "scratch/current_composed.png");
  fs.writeFileSync(testOut, composed.composite);
  console.log("Saved recomposed to:", testOut);

  console.log("Judging recomposed image with full director blueprint context...");
  const scores = await judgeRender(testOut, brief);
  console.log("Scores:", scores);
  console.log("Mean:", mean(scores.map(s => s.score)));
}

main().catch(console.error);
