import { CopyItemInput } from "../types";

export interface ExactCopyValidationResult {
  isValid: boolean;
  missingItems: string[];
}

export class ExactCopyIntegrityValidator {
  /**
   * Verifies that every supplied non-empty copy item appears exactly in the compiled prompt string.
   * Performs exact Unicode string matching without stripping diacritics or altering casing.
   */
  public static validate(
    copyItems: (CopyItemInput | string)[] | undefined,
    compiledPrompt: string
  ): ExactCopyValidationResult {
    if (!copyItems || copyItems.length === 0) {
      return { isValid: true, missingItems: [] };
    }

    const missingItems: string[] = [];

    for (const item of copyItems) {
      const rawText = typeof item === "string" ? item : item.text;
      if (!rawText || !rawText.trim()) continue;

      const trimmedText = rawText.trim();
      if (!compiledPrompt.includes(trimmedText)) {
        missingItems.push(trimmedText);
      }
    }

    return {
      isValid: missingItems.length === 0,
      missingItems,
    };
  }
}
