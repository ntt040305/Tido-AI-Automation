import io

# ── 1. Extend domain list + add domain_profile to the TS types ───────────
p = "lib/image-engine/reasoning/reasoning-knowledge.types.ts"
s = io.open(p, encoding="utf-8").read()

old = """/** The 15 domain folders under data/cios-knowledge (Database Spec §13). */
export const REASONING_DOMAINS = [
  "strategy",
  "audience",
  "category",
  "concept",
  "differentiation",
  "visual_direction",
  "layout",
  "typography",
  "color",
  "photography",
  "material",
  "channel",
  "production",
  "critic",
  "examples",
] as const;"""

new = """/**
 * Domain folders under data/cios-knowledge.
 *
 * Phase 2.1 splits three areas that were previously folded into a parent domain,
 * because retrieval could not distinguish them: `lighting` and `camera` both lived
 * inside `photography`, and `composition` inside `layout`. A brief that needs a
 * lens decision should not have to sift lighting knowledge to find it.
 *
 * `industry` is added for knowledge about how a whole industry communicates.
 * `category` predates it and is retained so existing objects stay valid; new
 * industry-level knowledge should use `industry`.
 *
 * Adding values to this list is backward compatible — every object authored
 * against the earlier list remains valid.
 */
export const REASONING_DOMAINS = [
  // Strategic
  "strategy",
  "audience",
  "industry",
  "category",
  "concept",
  "differentiation",
  // Visual direction
  "visual_direction",
  "composition",
  "layout",
  "typography",
  "color",
  // Production craft
  "photography",
  "camera",
  "lighting",
  "material",
  // Delivery
  "channel",
  "production",
  // Meta
  "critic",
  "examples",
] as const;"""
assert old in s, "domains anchor missing"
s = s.replace(old, new)

# ── domain_profile types ──
old2 = """// ── Context (Governance §4 — mandatory on every object) ─────────────────"""
new2 = """/**
 * Domain-specific detail.
 *
 * Phase 2.1 needs fields the core schema does not carry — a layout object needs
 * eye movement and a failure pattern; a lighting object needs its emotional
 * reading. Rather than fork the schema per domain, all of it hangs off one
 * optional `domain_profile`. The core 24 fields are untouched, every object
 * written before this existed stays valid, and the retriever needs no change
 * because it selects on `context`, never on profile detail.
 */
export interface LayoutProfile {
  /** What this layout is FOR, in one line. */
  purpose: string;
  /** How the frame is divided. */
  structure: string;
  /** Ranked reading order of elements. */
  visual_hierarchy: string[];
  /** Where the eye travels, in order. */
  eye_movement: string;
  /** How this layout fails when misapplied. */
  failure_pattern: string;
}

export interface PhotographyProfile {
  /** What a focal length choice says, beyond how much fits in frame. */
  lens_psychology?: string;
  /** What the crop implies about the viewer's relationship to the subject. */
  framing_psychology?: string;
  /** What the camera height and tilt assert about power and intimacy. */
  camera_angle?: string;
  /** Depth of field as a narrative instrument rather than an exposure setting. */
  depth_of_field?: string;
}

export interface LightingProfile {
  /** What this light makes a viewer feel before they read anything. */
  emotional_perception: string;
  /** Where this lighting is standard practice commercially. */
  commercial_usage: string;
  /** Quality, direction and ratio in plain terms. */
  technical_character?: string;
}

export interface ColorProfile {
  /** What this palette asserts about the brand. */
  brand_perception: string;
  /** The feeling it produces before meaning is decoded. */
  emotional_association: string;
  /** Meaning that changes by market — Vietnam and SEA differ from the West. */
  cultural_note?: string;
}

export interface CompositionProfile {
  /** The organising geometry. */
  structure: string;
  /** What the arrangement does to attention. */
  attention_effect: string;
  failure_pattern?: string;
}

export interface TypographyProfile {
  /** What the letterforms say about the brand before the words are read. */
  personality: string;
  /** Pairing and hierarchy guidance. */
  hierarchy?: string;
  /** Vietnamese diacritics need vertical room most Latin faces do not reserve. */
  vietnamese_note?: string;
}

export type DomainProfile =
  | ({ kind: "layout" } & LayoutProfile)
  | ({ kind: "photography" } & PhotographyProfile)
  | ({ kind: "lighting" } & LightingProfile)
  | ({ kind: "color" } & ColorProfile)
  | ({ kind: "composition" } & CompositionProfile)
  | ({ kind: "typography" } & TypographyProfile);

// ── Context (Governance §4 — mandatory on every object) ─────────────────"""
assert old2 in s, "profile anchor missing"
s = s.replace(old2, new2, 1)

old3 = """  related_knowledge?: string[];
  source?: string;

  /** Set by the loader, not by the author. */
  _file?: string;"""
new3 = """  related_knowledge?: string[];
  source?: string;

  /** Optional domain-specific detail. See DomainProfile. */
  domain_profile?: DomainProfile;

  /** Set by the loader, not by the author. */
  _file?: string;"""
assert old3 in s, "field anchor missing"
s = s.replace(old3, new3)
io.open(p, "w", encoding="utf-8").write(s)
print("types: 4 new domains + domain_profile")

# ── 2. Extend the JSON schema (additive) ────────────────────────────────
import json
p = "data/cios-knowledge/_schema/reasoning_knowledge_schema_v2.json"
schema = json.load(io.open(p, encoding="utf-8"))
schema["properties"]["domain"]["enum"] = [
    "strategy", "audience", "industry", "category", "concept", "differentiation",
    "visual_direction", "composition", "layout", "typography", "color",
    "photography", "camera", "lighting", "material",
    "channel", "production", "critic", "examples",
]
schema["properties"]["domain_profile"] = {
    "type": "object",
    "description": "Optional domain-specific detail (Phase 2.1). Additive: the core 24 fields are unchanged and objects authored without it remain valid.",
    "required": ["kind"],
    "properties": {
        "kind": {"type": "string", "enum": ["layout", "photography", "lighting", "color", "composition", "typography"]},
        "purpose": {"type": "string"},
        "structure": {"type": "string"},
        "visual_hierarchy": {"type": "array", "items": {"type": "string"}},
        "eye_movement": {"type": "string"},
        "failure_pattern": {"type": "string"},
        "lens_psychology": {"type": "string"},
        "framing_psychology": {"type": "string"},
        "camera_angle": {"type": "string"},
        "depth_of_field": {"type": "string"},
        "emotional_perception": {"type": "string"},
        "commercial_usage": {"type": "string"},
        "technical_character": {"type": "string"},
        "brand_perception": {"type": "string"},
        "emotional_association": {"type": "string"},
        "cultural_note": {"type": "string"},
        "attention_effect": {"type": "string"},
        "personality": {"type": "string"},
        "hierarchy": {"type": "string"},
        "vietnamese_note": {"type": "string"},
    },
    "additionalProperties": False,
}
io.open(p, "w", encoding="utf-8").write(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
print("schema: domain enum extended to %d, domain_profile added" % len(schema["properties"]["domain"]["enum"]))
