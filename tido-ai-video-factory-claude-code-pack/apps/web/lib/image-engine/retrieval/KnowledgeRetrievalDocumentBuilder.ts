import { KnowledgeBlock } from "../types";

/**
 * Builds clean, semantic retrieval document text for Knowledge Blocks
 * suitable for vector embedding generation.
 */
export class KnowledgeRetrievalDocumentBuilder {
  public static buildDocumentText(block: KnowledgeBlock): string {
    const meta = block.metadata;
    const lines: string[] = [];

    lines.push(`Title: ${meta.title}`);
    if (meta.summary) {
      lines.push(`Summary: ${meta.summary}`);
    }

    const descriptors: string[] = [
      ...(meta.keywords || []),
      ...(meta.aliases || []),
      ...(meta.semantic_tags || []),
    ];
    if (descriptors.length > 0) {
      lines.push(`Relevant descriptors: ${descriptors.join(", ")}`);
    }

    const rd = meta.routing_dimensions || {};
    const applicability: string[] = [];
    if (rd.materials?.length) applicability.push(`materials: ${rd.materials.join(", ")}`);
    if (rd.properties?.length) applicability.push(`properties: ${rd.properties.join(", ")}`);
    if (rd.contents?.length) applicability.push(`contents: ${rd.contents.join(", ")}`);
    if (rd.geometry_traits?.length) applicability.push(`geometry: ${rd.geometry_traits.join(", ")}`);
    if (rd.packaging_types?.length) applicability.push(`packaging: ${rd.packaging_types.join(", ")}`);
    if (rd.visual_challenges?.length) applicability.push(`visual challenges: ${rd.visual_challenges.join(", ")}`);

    if (applicability.length > 0) {
      lines.push(`Routing applicability: ${applicability.join("; ")}`);
    }

    if (block.content) {
      // Strip markdown header duplicates if any, keep clean knowledge text
      const cleanContent = block.content.trim();
      lines.push(`Professional knowledge:\n${cleanContent}`);
    }

    return lines.join("\n\n");
  }
}
