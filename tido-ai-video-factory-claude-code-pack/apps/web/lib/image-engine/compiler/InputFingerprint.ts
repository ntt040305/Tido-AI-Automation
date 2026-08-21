import crypto from "crypto";
import { MasterPromptCompilerInput } from "../types";

export class InputFingerprint {
  /**
   * Generates a deterministic SHA-256 fingerprint for a set of MasterPromptCompilerInput parameters
   */
  public static compute(input: MasterPromptCompilerInput): string {
    const normReferences = (input.productReferences || []).map((ref) => {
      if (typeof ref === "string") return ref;
      return `${ref.reference_id}:${ref.product_id || ""}:${ref.input_index ?? ""}`;
    });

    const normCopy = (input.copyItems || []).map((c) => {
      if (typeof c === "string") return c;
      return `${c.type || "other"}:${c.text}`;
    });

    const canonicalState = {
      brief: (input.brief || "").trim(),
      productCount: input.productCount ?? 1,
      brandName: (input.brandName || "").trim(),
      brandInfo: (input.brandInfo || "").trim(),
      useCase: (input.useCase || "").trim(),
      aspectRatio: (input.aspectRatio || "").trim(),
      hardRequirements: (input.hardRequirements || []).map((r) => r.trim()).sort(),
      references: normReferences.sort(),
      copyItems: normCopy.sort(),
      routingMode: input.routingResult?.routing_mode || "",
      universalBlocks: (input.knowledgePackage?.universal_blocks || []).map((b) => b.id).sort(),
      selectedBlocks: (input.knowledgePackage?.selected_blocks || []).map((b) => b.id).sort(),
    };

    const json = JSON.stringify(canonicalState);
    return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
  }
}
