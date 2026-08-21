import { GoogleGenAI } from "@google/genai";
import { IMAGE_ENGINE_CONFIG } from "../config";

/**
 * Server-side Embedding Service using Google GenAI SDK (@google/genai)
 * Model: gemini-embedding-2
 * Dimensionality: 768
 */
export class EmbeddingService {
  private static mockProvider: ((text: string) => Promise<number[]>) | null = null;

  /**
   * For unit tests: allow injecting a mock embedding provider
   */
  public static setMockProvider(provider: ((text: string) => Promise<number[]>) | null) {
    this.mockProvider = provider;
  }

  /**
   * Generates a 768-dimensional vector embedding for a query or document.
   */
  public static async embedText(rawText: string, isQuery: boolean = false): Promise<number[]> {
    const formattedText = isQuery
      ? `task: search result | query: ${rawText}`
      : rawText.startsWith("title:") ? rawText : `text: ${rawText}`;

    if (this.mockProvider) {
      return this.mockProvider(formattedText);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.embedContent({
        model: IMAGE_ENGINE_CONFIG.EMBEDDING_MODEL,
        contents: formattedText,
        config: {
          outputDimensionality: IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS,
        },
      });

      const resAny = response as any;
      const values: number[] | undefined = resAny.embedding?.values || resAny.embeddings?.[0]?.values;
      if (!values || !Array.isArray(values) || values.length !== IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Invalid embedding response dimensions. Expected ${IMAGE_ENGINE_CONFIG.EMBEDDING_DIMENSIONS}, received ${values?.length || 0}`
        );
      }

      return values;
    } catch (err: any) {
      throw new Error(`Embedding API Error: ${err.message || String(err)}`);
    }
  }

  /**
   * Convenience helper for query embeddings
   */
  public static async embedQuery(query: string): Promise<number[]> {
    return this.embedText(query, true);
  }

  /**
   * Convenience helper for document embeddings
   */
  public static async embedDocument(title: string, documentText: string): Promise<number[]> {
    const formattedDoc = `title: ${title} | text: ${documentText}`;
    return this.embedText(formattedDoc, false);
  }
}
