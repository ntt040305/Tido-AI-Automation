import fs from "fs";
import { IMAGE_ENGINE_CONFIG } from "../config";

/**
 * RoutingRuntimeSchemaAdapter
 * 
 * Dynamic runtime adapter that converts the canonical routing_schema_v1.json
 * into a Gemini-compatible JSON Schema for Structured Output.
 * 
 * SINGLE SOURCE OF TRUTH PRINCIPLE:
 * This class DOES NOT hardcode or duplicate schema definitions in TypeScript.
 * It mechanically loads routing_schema_v1.json and applies a generic compatibility
 * transform (dereferencing $ref pointers and stripping non-supported draft-07 metadata).
 */
export class RoutingRuntimeSchemaAdapter {
  private static cachedSchema: any = null;

  /**
   * Returns the Gemini-compatible JSON Schema derived dynamically from canonical routing_schema_v1.json
   */
  public static getGeminiResponseJsonSchema(): any {
    if (this.cachedSchema) {
      return this.cachedSchema;
    }

    if (!fs.existsSync(IMAGE_ENGINE_CONFIG.ROUTING_SCHEMA_V1_PATH)) {
      throw new Error(
        `Canonical Routing Schema V1 file not found at ${IMAGE_ENGINE_CONFIG.ROUTING_SCHEMA_V1_PATH}`
      );
    }

    const rawContent = fs.readFileSync(IMAGE_ENGINE_CONFIG.ROUTING_SCHEMA_V1_PATH, "utf-8");
    const canonicalSchema = JSON.parse(rawContent);

    // Mechanically transform canonical schema into Gemini-compatible runtime schema
    const definitions = canonicalSchema.definitions || canonicalSchema.$defs || {};
    const adapted = this.transformSchema(canonicalSchema, definitions);

    this.cachedSchema = adapted;
    return adapted;
  }

  /**
   * Backward-compatible alias for existing service calls
   */
  public static getGeminiResponseSchema(): any {
    return this.getGeminiResponseJsonSchema();
  }

  /**
   * Generic Schema Transformer:
   * 1. Inlines $ref pointers from definitions/$defs
   * 2. Strips draft-07 meta keys ($schema, $id, title, definitions, $defs)
   * 3. Retains all validation constraints (minimum, maximum, enum, additionalProperties, required, type, properties, items)
   */
  private static transformSchema(node: any, definitions: Record<string, any>): any {
    if (!node || typeof node !== "object") {
      return node;
    }

    // 1. Dereference $ref pointers
    if (node.$ref && typeof node.$ref === "string") {
      const refPath = node.$ref;
      const refKey = refPath.split("/").pop() || "";
      const targetDef = definitions[refKey];
      if (!targetDef) {
        throw new Error(`Schema Adapter Error: Unable to resolve $ref pointer '${refPath}'`);
      }
      // Merge any sibling properties (e.g. description override) with dereferenced target definition
      const { $ref, ...siblings } = node;
      return this.transformSchema({ ...targetDef, ...siblings }, definitions);
    }

    // 2. Build clean transformed node
    const result: any = {};

    // List of draft-07 meta keywords that Gemini API does not consume at runtime
    const metaKeysToStrip = new Set(["$schema", "$id", "title", "definitions", "$defs"]);

    for (const [key, value] of Object.entries(node)) {
      if (metaKeysToStrip.has(key)) {
        continue;
      }

      if (key === "properties" && value && typeof value === "object") {
        const cleanProps: Record<string, any> = {};
        for (const [propName, propSchema] of Object.entries(value as Record<string, any>)) {
          cleanProps[propName] = this.transformSchema(propSchema, definitions);
        }
        result.properties = cleanProps;
      } else if (key === "items" && value && typeof value === "object") {
        result.items = this.transformSchema(value, definitions);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "object" ? this.transformSchema(item, definitions) : item
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
