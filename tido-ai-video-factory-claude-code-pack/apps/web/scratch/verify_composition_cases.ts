import { CommercialLayoutService } from "../lib/image-engine/service/CommercialLayoutService";
import { buildGeometry } from "../lib/image-engine/evolution/experiment/LayoutGeometry";
import { buildCompositionPlan, renderCompositionPlan } from "../lib/image-engine/evolution/experiment/CompositionPlan";
import { buildComposition } from "../lib/image-engine/evolution/experiment/VisualComposition";

// Case 1: Square poster (1:1), centered hero
const case1_layout = CommercialLayoutService.plan({
  assetType: "poster",
  aspectRatio: "1:1",
  copyItems: ["Barrier Calm Serum", "Botanical recovery for sensitive skin"],
  hasLogoAsset: false,
});
const case1_geo = buildGeometry({
  ratio: "1:1",
  copyRoles: ["HEADLINE", "CTA"],
  productCount: 1,
});
const case1_plan = buildCompositionPlan({
  geometry: case1_geo,
  copyLines: 2,
  copy: [
    { role: "headline", text: "Barrier Calm Serum" },
    { role: "cta", text: "Botanical recovery for sensitive skin" },
  ],
  ratio: "1:1",
});

// Case 2: Wide banner (16:9), side composition hint
const case2_layout = CommercialLayoutService.plan({
  assetType: "banner",
  aspectRatio: "16:9",
  copyItems: ["Sale 50% Off", "Shop Now"],
  hasLogoAsset: true,
});
const case2_geo = buildGeometry({
  ratio: "16:9",
  copyRoles: ["HEADLINE", "CTA"],
  productCount: 1,
  compositionHint: "Hero bottle positioned off-centre right against clean negative space",
});
const case2_plan = buildCompositionPlan({
  geometry: case2_geo,
  copyLines: 2,
  copy: [
    { role: "headline", text: "Sale 50% Off" },
    { role: "cta", text: "Shop Now" },
  ],
  ratio: "16:9",
});

// Case 3: Tall story (9:16), social ad, side: left hint
const case3_layout = CommercialLayoutService.plan({
  assetType: "social_ad",
  aspectRatio: "9:16",
  copyItems: ["New Launch", "Discover More"],
  hasLogoAsset: false,
});
const case3_geo = buildGeometry({
  ratio: "9:16",
  copyRoles: ["HEADLINE", "CTA"],
  productCount: 1,
  compositionHint: "Product placed on the left third of the frame",
});
const case3_plan = buildCompositionPlan({
  geometry: case3_geo,
  copyLines: 2,
  copy: [
    { role: "headline", text: "New Launch" },
    { role: "cta", text: "Discover More" },
  ],
  ratio: "9:16",
});

console.log("=== CASE 1 (1:1 Poster, Centered) ===");
console.log("CommercialLayoutService zones:");
console.log(JSON.stringify(case1_layout.zones, null, 2));
console.log("CompositionPlan product_position & typography_zone:");
console.log({
  product_position: case1_plan.product_position,
  typography_zone: case1_plan.typography_zone,
});
console.log("CompositionPlan rendered block:\n", renderCompositionPlan(case1_plan));

console.log("\n=== CASE 2 (16:9 Banner, Off-centre right) ===");
console.log("CommercialLayoutService zones:");
console.log(JSON.stringify(case2_layout.zones, null, 2));
console.log("CompositionPlan product_position & typography_zone:");
console.log({
  product_position: case2_plan.product_position,
  typography_zone: case2_plan.typography_zone,
});
console.log("CompositionPlan rendered block:\n", renderCompositionPlan(case2_plan));

console.log("\n=== CASE 3 (9:16 Social Ad, Left third) ===");
console.log("CommercialLayoutService zones:");
console.log(JSON.stringify(case3_layout.zones, null, 2));
console.log("CompositionPlan product_position & typography_zone:");
console.log({
  product_position: case3_plan.product_position,
  typography_zone: case3_plan.typography_zone,
});
console.log("CompositionPlan rendered block:\n", renderCompositionPlan(case3_plan));
