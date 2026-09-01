import {
  ImageProjectInput,
  ProductCompositionMode,
  ProductIdentityStrength,
} from "@tido/contracts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function runContractExtensionTest() {
  console.log("========================================================================");
  console.log("TIDO PICTURE ENGINE — PHASE 2.5.1 CONTRACT EXTENSION TEST");
  console.log("========================================================================");

  const compositionMode: ProductCompositionMode = "multi";
  const identityStrength: ProductIdentityStrength = "absolute";
  const targetProductCount = 3;

  const imageInput: ImageProjectInput = {
    prompt: "Commercial visual poster for premium energy beverage trio",
    aspect_ratio: "16:9",
    creative_type: "poster",
    marketing_goal: "conversion",
    brand_name: "TIDO Energy",
    product_composition_mode: compositionMode,
    product_identity_strength: identityStrength,
    target_product_count: targetProductCount,
  };

  assert(imageInput.product_composition_mode === "multi", "ImageProjectInput supports product_composition_mode: 'multi'");
  assert(imageInput.product_identity_strength === "absolute", "ImageProjectInput supports product_identity_strength: 'absolute'");
  assert(imageInput.target_product_count === 3, "ImageProjectInput supports target_product_count: 3");

  console.log("\nSample ImageProjectInput Payload:");
  console.log(JSON.stringify(imageInput, null, 2));

  console.log("\n========================================================================");
  console.log("🎉 PHASE 2.5.1 CONTRACT EXTENSION TEST PASSED (100%)");
  console.log("========================================================================");
}

runContractExtensionTest();
