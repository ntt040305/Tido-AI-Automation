/**
 * Cosine Similarity Helper for Vector Distance Calculations
 */
export class CosineSimilarity {
  public static compute(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      throw new Error(`Invalid vectors for cosine similarity computation (${vecA?.length || 0} vs ${vecB?.length || 0})`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const valA = vecA[i];
      const valB = vecB[i];

      if (!Number.isFinite(valA) || !Number.isFinite(valB)) {
        throw new Error(`Non-finite numeric value detected in vector at index ${i}`);
      }

      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const magA = Math.sqrt(normA);
    const magB = Math.sqrt(normB);

    if (magA === 0 || magB === 0) {
      return 0; // Handle zero vector safely
    }

    const similarity = dotProduct / (magA * magB);
    // Clamp to valid -1.0 to 1.0 range to account for floating point precision
    return Math.max(-1.0, Math.min(1.0, similarity));
  }
}
