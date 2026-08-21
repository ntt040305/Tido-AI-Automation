import fs from "fs";
import crypto from "crypto";
import { IMAGE_ENGINE_CONFIG } from "../config";
import {
  CompiledEditPackageV1,
  CompiledReferenceMapping,
  EditCategory,
  EditCompilerResult,
  EditPromptCompilerInput,
} from "../types";

export class EditPromptCompilerService {
  private templateRaw: string = "";
  private templateHash: string = "";
  private templateVersion: string = "1.0.0";

  constructor() {
    this.loadTemplate();
  }

  private loadTemplate() {
    try {
      const filePath = IMAGE_ENGINE_CONFIG.EDIT_PROMPT_V1_PATH;
      if (fs.existsSync(filePath)) {
        this.templateRaw = fs.readFileSync(filePath, "utf-8");
        this.templateHash = crypto.createHash("sha256").update(this.templateRaw).digest("hex");
        const versionMatch = this.templateRaw.match(/VERSION:\s*([0-9\.]+)/i);
        if (versionMatch) {
          this.templateVersion = versionMatch[1];
        }
      } else {
        this.templateRaw = this.getDefaultTemplate();
        this.templateHash = crypto.createHash("sha256").update(this.templateRaw).digest("hex");
      }
    } catch (_) {
      this.templateRaw = this.getDefaultTemplate();
      this.templateHash = crypto.createHash("sha256").update(this.templateRaw).digest("hex");
    }
  }

  private getDefaultTemplate(): string {
    return `<!-- ID: edit_prompt_v1 | VERSION: 1.0.0 -->
# EDIT PROMPT V1 — TARGETED IMAGE EDITING ARCHITECTURE

## ROLE
Targeted commercial image edit engine. Modify the provided current rendered image strictly according to the user edit instruction while maintaining complete visual preservation over all unrequested elements.

---

## VISUAL SOURCE OF TRUTH
The primary visual reference for this edit is the current rendered image (image 1 in the input list).

Preserve the existing composition, camera angle, perspective, subject placement, spatial relationships, lighting atmosphere, background structure, product identities, and unaffected typography unless explicitly requested to change.

---

## TARGETED EDIT INSTRUCTION
\`\`\`
{{EDIT_INSTRUCTION}}
\`\`\`

---

## EDIT CATEGORY
\`\`\`
{{EDIT_CATEGORY}}
\`\`\`

---

## PRESERVATION CONTRACT
- **PRESERVE:** Unrequested visual elements, camera angle, composition, subject placement, unaffected product identity, unaffected typography, lighting, and overall scene structure.
- **MODIFY:** Only the specific elements explicitly requested in the Targeted Edit Instruction.
- Do NOT rebuild the scene from scratch. Do NOT alter unrequested details, colors, background objects, or product branding.

---

## SUPPORTING IDENTITY EVIDENCE
Any additional reference images attached following image 1 represent supporting evidence for original product identity. Use them strictly to maintain physical product accuracy for affected products.

---

## BRAND & CONTEXT
\`\`\`
{{BRAND_KNOWLEDGE}}
\`\`\`

---

## READABLE-TEXT FIREWALL
Every readable text string rendered on the edited visual canvas must come exclusively from the exact user-supplied strings listed in FINAL VISIBLE COPY. Do NOT render role labels, metadata names, field identifiers, or extraneous text.

---

## FINAL VISIBLE COPY
\`\`\`
{{FINAL_VISIBLE_COPY}}
\`\`\`

---

## FINAL OUTPUT
Render ONE finished production-grade edited commercial visual. Output NO moodboards, before/after comparisons, or explanatory text.`;
  }

  public classifyEditInstruction(instruction: string): EditCategory {
    const text = instruction.toLowerCase().trim();
    if (/chữ|headline|subheadline|text|đổi tên|sửa tên|sửa câu|câu chữ|price|giá|cta|mùa|chữ/i.test(text)) {
      return "TEXT_EDIT";
    }
    if (/sản phẩm|product|chai|ly|lon|bao bì|nhãn|logo|thương hiệu/i.test(text)) {
      return "PRODUCT_EDIT";
    }
    if (/sáng|tối|bóng|chiếu|ánh sáng|nắng|đèn|glow/i.test(text)) {
      return "LIGHTING_EDIT";
    }
    if (/nền|background|bối cảnh|phông|tường|bàn/i.test(text)) {
      return "BACKGROUND_EDIT";
    }
    if (/bố cục|góc|view|camera|crop|khung|xa|gần|gần hơn|tập trung/i.test(text)) {
      return "COMPOSITION_EDIT";
    }
    if (/bỏ|xóa|thêm|vật|đồ|hoa|trang trí|prop|vật thể/i.test(text)) {
      return "OBJECT_EDIT";
    }
    return "OTHER";
  }

  public async compile(input: EditPromptCompilerInput): Promise<EditCompilerResult> {
    const startTime = Date.now();

    if (!input.parentImageId || !input.parentImageId.trim()) {
      return {
        success: false,
        error: {
          code: "INVALID_COMPILER_INPUT",
          message: "parentImageId is required for image edit prompt compilation.",
        },
      };
    }

    if (!input.editInstruction || !input.editInstruction.trim()) {
      return {
        success: false,
        error: {
          code: "INVALID_COMPILER_INPUT",
          message: "editInstruction is required for image edit prompt compilation.",
        },
      };
    }

    const editInstruction = input.editInstruction.trim();
    const editCategory = input.editCategory || this.classifyEditInstruction(editInstruction);

    // Build Brand Context
    let brandKnowledgeText = "No specific brand guidelines provided.";
    if (input.brandName || input.brandInfo) {
      const lines: string[] = [];
      if (input.brandName) lines.push(`BRAND NAME: ${input.brandName.trim()}`);
      if (input.brandInfo) lines.push(`BRAND CONTEXT: ${input.brandInfo.trim()}`);
      brandKnowledgeText = lines.join("\n");
    }

    // Build Typography & Readable Copy
    const copyItems = input.copyItems || [];
    let typographyAndReadableCopyText = "";

    if (copyItems.length > 0) {
      const lines: string[] = [
        "Integrate the authorized visible copy using its intended visual hierarchy. Preserve every character, spelling, capitalization, punctuation, numbers, and Vietnamese accents exactly. Only the quoted strings below may appear as readable typography; all other prompt text consists of non-visible instructions:\n",
      ];
      copyItems.forEach((item) => {
        const text = typeof item === "string" ? item : item.text;
        if (text && text.trim()) {
          lines.push(`"${text.trim()}"`);
        }
      });
      typographyAndReadableCopyText = lines.join("\n");
    } else {
      typographyAndReadableCopyText = "Preserve existing typography unless instructed to change. Do NOT render unauthorized readable text.";
    }

    // Replace Placeholders
    let compiled = this.templateRaw
      .replace("{{EDIT_INSTRUCTION}}", editInstruction)
      .replace("{{EDIT_CATEGORY}}", editCategory)
      .replace("{{BRAND_KNOWLEDGE}}", brandKnowledgeText)
      .replace("{{TYPOGRAPHY_AND_READABLE_COPY}}", typographyAndReadableCopyText)
      .replace("{{FINAL_VISIBLE_COPY}}", typographyAndReadableCopyText);

    const compiledPromptHash = crypto.createHash("sha256").update(compiled).digest("hex");

    // Process supporting references
    const supportingReferences: CompiledReferenceMapping[] = (input.supportingReferences || []).map((ref, idx) => {
      if (typeof ref === "string") {
        return {
          reference_id: `REF_${String(idx + 1).padStart(2, "0")}`,
          product_id: `PRODUCT_${String(idx + 1).padStart(2, "0")}`,
          input_index: idx + 1,
        };
      }
      return {
        reference_id: ref.reference_id || `REF_${String(idx + 1).padStart(2, "0")}`,
        product_id: ref.product_id || `PRODUCT_${String(idx + 1).padStart(2, "0")}`,
        input_index: ref.input_index ?? (idx + 1),
      };
    });

    // Compute edit fingerprint
    const fingerprintStr = JSON.stringify({
      parentImageId: input.parentImageId,
      editInstruction,
      editCategory,
      copyItems,
      brandName: input.brandName,
      templateHash: this.templateHash,
    });
    const editFingerprint = crypto.createHash("sha256").update(fingerprintStr).digest("hex");

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      package: {
        package_version: "1.0",
        template: {
          id: "edit_prompt_v1",
          version: this.templateVersion,
          hash: this.templateHash,
        },
        parent_image_id: input.parentImageId,
        edit_instruction: editInstruction,
        edit_category: editCategory,
        compiled_edit_prompt: compiled,
        compiled_edit_prompt_hash: compiledPromptHash,
        edit_fingerprint: editFingerprint,
        supporting_references: supportingReferences,
        stats: {
          prompt_characters: compiled.length,
          estimated_prompt_tokens: Math.ceil(compiled.length / 4),
          compile_duration_ms: durationMs,
        },
      },
    };
  }
}

export const defaultEditPromptCompilerService = new EditPromptCompilerService();
