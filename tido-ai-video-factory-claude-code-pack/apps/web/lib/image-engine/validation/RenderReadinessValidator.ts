import { MasterPromptCompilerInput } from "../types";
import { ProductIdentityResolver, ResolvedProductIdentityPackage } from "../compiler/ProductIdentityResolver";

export interface RenderReadinessResult {
  isReady: boolean;
  errors?: string[];
  resolvedIdentityPackage?: ResolvedProductIdentityPackage;
}

export class RenderReadinessValidator {
  public static validate(input: MasterPromptCompilerInput): RenderReadinessResult {
    const errors: string[] = [];

    if (!input) {
      return { isReady: false, errors: ["Compiler input is required."] };
    }

    if (!input.routingResult) {
      errors.push("routingResult is missing.");
    }

    if (!input.knowledgePackage) {
      errors.push("knowledgePackage is missing.");
    }

    const rawRefs = input.productReferences || [];
    const expectedRefIds = (input.productReferences || []).map((r, i) =>
      typeof r === "string" ? r : r.reference_id || `REF_${String(i + 1).padStart(2, "0")}`
    );

    // Resolve Product Identity Package deterministically (decoupled from visible instance count)
    const identityPackage = ProductIdentityResolver.resolve(
      input.routingResult,
      rawRefs,
      expectedRefIds
    );

    // Sanity Check 1: Every resolved product group must have at least 1 reference
    identityPackage.groups.forEach((g) => {
      if (!g.reference_ids || g.reference_ids.length === 0) {
        errors.push(`Product group '${g.product_id}' has no assigned reference image.`);
      }
    });

    // Sanity Check 2: Distinct product count must match resolved group count
    if (identityPackage.distinctProductCount !== identityPackage.groups.length) {
      errors.push(
        `Distinct product count (${identityPackage.distinctProductCount}) does not match group count (${identityPackage.groups.length}).`
      );
    }

    // Sanity Check 3: No weak or ambiguous merge treated as confirmed same identity
    identityPackage.groups.forEach((g) => {
      if (g.reference_ids.length > 1 && !g.is_same_identity_proven) {
        errors.push(
          `Unsafe identity merge detected for product '${g.product_id}' on references [${g.reference_ids.join(", ")}]: evidence is weak or ambiguous.`
        );
      }
    });

    if (errors.length > 0) {
      return { isReady: false, errors };
    }

    return {
      isReady: true,
      resolvedIdentityPackage: identityPackage,
    };
  }
}
