/**
 * Asset Identity Profile Contract Model
 * Tracks character face embeddings, product DNA, style anchors, and voice personas.
 */

export type IdentityType = "character" | "product" | "brand_style" | "voice_persona";

export interface IdentityProfile {
  identity_id?: string;
  identity_type?: IdentityType;
  face_embedding_id?: string;
  product_dna_id?: string;
  voice_id?: string;
  style_anchor_urls?: string[];
  tags?: string[];
}
