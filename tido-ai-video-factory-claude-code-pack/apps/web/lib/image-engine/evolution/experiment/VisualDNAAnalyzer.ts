import crypto from "crypto";
import {
  defaultLLMProviderService,
  LLMContentPart,
  LLMProviderService,
} from "../../llm/llm-provider.service";
import { ImageNormalizationService } from "../../service/ImageNormalizationService";

/**
 * What the attached images actually show, before anything is decided from them.
 *
 * The gap this fills
 * ------------------
 * The product photograph and the logo reach Nano Banana as reference
 * attachments, and no reasoning layer has ever seen them. `CreativeDirectorV1`
 * receives nine text fields; it decides camera, lighting, composition and
 * typography for a product it has never looked at. Every visual judgement in
 * this engine has been made from a description of a description.
 *
 * Why failure returns null rather than a default
 * ---------------------------------------------
 * `InspirationStyleIntelligenceService` answers a failed vision call with a
 * heuristic manifest — "High-end commercial 3-point softbox studio lighting with
 * subtle rim separation" — and `types.ts` then warns that such a manifest "must
 * NOT be injected into the prompt as an authoritative style directive: it
 * competes with the real attached image and reintroduces generic studio
 * styling". A plausible sentence about a product nobody looked at is worse than
 * silence, because silence is visibly absent and a plausible sentence is not.
 *
 * So there is no fallback here. Every failure path returns null and the render
 * proceeds exactly as it does today.
 *
 * What this is not allowed to do
 * ------------------------------
 * It does not decide anything. It contains no recommendation field, no style
 * name, no category. It may not touch product identity: identity comes from
 * reference evidence the engine already holds, and a vision model's description
 * of a surface is not evidence of what the product is. Anything resembling an
 * identity instruction is stripped before the result leaves this file.
 */

/** A surface, a shape, a colour — things a photograph can be said to contain. */
export interface VisualDNAObservedProduct {
  form?: string;
  materials?: string[];
  palette?: string[];
  finish?: string;
  surface_detail?: string;
  scale_cues?: string;
  condition?: string;
}

export interface VisualDNAObservedLogo {
  letterform?: string;
  weight?: string;
  geometry?: string;
  colour?: string[];
  spacing?: string;
}

export interface VisualDNAObservedReference {
  composition?: string;
  light_behaviour?: string;
  tonal_range?: string;
}

export interface VisualDNAObserved {
  product?: VisualDNAObservedProduct;
  logo?: VisualDNAObservedLogo;
  reference?: VisualDNAObservedReference;
}

/**
 * A reading of the observations, and the observation it rests on.
 *
 * `basis_quote` is checked against the observed branch and the entry is dropped
 * when it does not appear there. An inference that cannot point at something
 * seen is a hallucination with a schema around it, and the only difference
 * between that and a finding is whether anything checks.
 */
export interface VisualDNAInference {
  claim: string;
  basis: string;
  basis_quote: string;
  confidence: "low" | "medium" | "high";
}

export interface VisualDNAProvenance {
  /** False means the analysis did not come from pixels. The caller discards it. */
  derived_from_image: boolean;
  analyzed_roles: string[];
  source_hashes: string[];
  model_calls: number;
  analyzed_at: string;
}

export interface VisualDNA {
  observed: VisualDNAObserved;
  inferred: VisualDNAInference[];
  provenance: VisualDNAProvenance;
}

/** One attached image, reduced to what this file needs. */
export interface VisualDNAImage {
  role?: string;
  buffer?: Buffer;
  mimeType?: string;
}

export interface VisualDNAInput {
  images: VisualDNAImage[];
  /** A previous result. Reused when every hash still matches; no call is made. */
  existingDNA?: VisualDNA | null;
}

/**
 * Words that name a market rather than describe a thing.
 *
 * A field reading "skincare aesthetic" has stopped observing and started
 * classifying, and a classification is the shortest route back to the house
 * style this whole experiment exists to escape.
 */
const INDUSTRY_TERMS =
  /\b(?:skincare|skin\s?care|cosmetic\w*|beauty|fashion|apparel|food|beverage|f&b|automotive|tech\w*|electronics|pharma\w*|finance|banking|retail|hospitality|real\s?estate|fmcg|luxury\s+goods)\b/i;

/**
 * Verdicts on a finished picture, which a camera cannot point at.
 *
 * The director's own instructions already refuse these words. Letting them in
 * through an observation field would launder them into the prompt wearing the
 * authority of evidence.
 */
const VERDICT_TERMS =
  /\b(?:premium|luxur\w+|cinematic|elegant|stunning|beautiful|gorgeous|minimal(?:ist|istic)?|sophisticated|high[- ]end|upscale|exquisite)\b/i;

/** Words that name product identity, which this layer has no authority over. */
const IDENTITY_TERMS =
  /\b(?:logo|packaging|label|brand mark|trademark|should be|must be|make the|change the|replace)\b/i;

const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim();

/** Roles this analyzer will look at, mapped to the branch they populate. */
const ROLE_BRANCH: Record<string, "product" | "logo" | "reference"> = {
  PRODUCT: "product",
  PRODUCT_REFERENCE: "product",
  LOGO: "logo",
  INSPIRATION_REFERENCE: "reference",
};

/**
 * Which branch an uploaded role is looked at under, or null when it is not
 * looked at at all.
 *
 * Exported so the persistence layer can align a stored asset with the branch
 * that observed it WITHOUT keeping a second copy of this map. Two copies would
 * disagree the first time a role was added, and the failure would be silent:
 * an asset filed under the wrong branch still stores cleanly.
 */
export function branchForRole(role: string | null | undefined): "product" | "logo" | "reference" | null {
  return ROLE_BRANCH[String(role || "").toUpperCase()] ?? null;
}

/** At most one image per branch. Three photographs is a description, not an album. */
const MAX_IMAGES = 3;

/**
 * What the file actually is, read from its first bytes.
 *
 * The declared type comes from the client upload and is not checked anywhere on
 * the way here. Measured in this repository's own render output: 2 of 239 files
 * named `.png` begin `ff d8 ff … JFIF` and are JPEGs. Sending one of those as
 * `data:image/png;base64,…` asks a vision API to decode bytes of a format it was
 * told to expect something else from, and the failure is at the provider rather
 * than anywhere we can see.
 *
 * `ImageNormalizationService` does not close this: on the path where an image is
 * already inside the budget it returns `input.mimeType || image/${meta.format}`,
 * so a small mislabelled file keeps its wrong label. Only re-encoding corrects
 * it, and re-encoding is exactly what does not happen to a file that already
 * fits. So the sniff runs first, and normalisation is handed the truth.
 *
 * Returns null when the bytes match nothing known, in which case the declared
 * type is kept: guessing twice is worse than trusting once.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  if (b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp") {
    const brand = b.toString("ascii", 8, 12);
    if (brand.startsWith("avi")) return "image/avif";
    if (brand.startsWith("hei") || brand.startsWith("mif")) return "image/heic";
  }
  return null;
}

/**
 * How large an image is worth sending.
 *
 * Tighter than the engine's own defaults, which are sized for what the image
 * provider accepts in a multipart body rather than for what a vision model reads.
 * Measured on this repository's renders: a 620,681-byte file becomes 827,576
 * characters of base64 and an 830 KB HTTP request for a single attachment, and
 * three of those in one call is around 2.5 MB. The same file at this budget is
 * 60,228 bytes — a tenth — and nothing in the description it produces depends on
 * the difference.
 */
const VISION_BUDGET = { maxDimension: 1024, maxImageBytes: 512 * 1024 };

const SYSTEM_PROMPT = `You are describing photographs for someone who cannot see them.

Report what is visibly present. Do not name a market, a category or an industry.
Do not say premium, luxury, minimal, elegant, cinematic or high-end — those are
verdicts about a finished advertisement, not properties of an object, and every
brand claims them. Say what would make a person reach that verdict instead: the
grain of the surface, how light leaves it, how the edges are cut.

You have no authority over what the product IS. Do not suggest changes, do not
describe what the packaging or the logo should become, and do not correct
anything. You are reading, not directing.

Separate two things and never mix them:

  OBSERVED  - what is in the pixels. A material, a colour, a proportion, a
              finish, a condition. If you cannot see it, it does not go here.

  INFERRED  - what those observations suggest about how this brand behaves.
              Every inference must quote the observation it rests on, verbatim,
              in basis_quote. An inference you cannot ground in something you
              described is a guess, and a guess presented as a finding is worse
              than no finding at all. Say so with confidence: low.

Return ONLY a JSON object of this shape, and nothing else:
{
  "observed": {
    "product": {
      "form": "<shape, proportion, construction>",
      "materials": ["<surface, and how light behaves on it>"],
      "palette": ["<colours actually present>"],
      "finish": "<matte, gloss, textured, brushed…>",
      "surface_detail": "<grain, seams, wear, imperfection>",
      "scale_cues": "<what indicates real size>",
      "condition": "<new, used, sealed, opened>"
    },
    "logo": {
      "letterform": "<describe the shapes; do not classify the typeface>",
      "weight": "...", "geometry": "...", "colour": ["..."], "spacing": "..."
    },
    "reference": { "composition": "...", "light_behaviour": "...", "tonal_range": "..." }
  },
  "inferred": [
    { "claim": "<how this brand behaves>", "basis": "<which observed field>",
      "basis_quote": "<the exact text you wrote in that field>",
      "confidence": "low|medium|high" }
  ]
}
Omit any branch you were not given an image for.`;

export class VisualDNAAnalyzer {
  private llm: LLMProviderService;

  constructor(provider?: LLMProviderService) {
    this.llm = provider || defaultLLMProviderService;
  }

  /** Deterministic, and short enough to read in a log. */
  public static hash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  }

  /**
   * Reads the attached images, or returns null.
   *
   * Null is returned for: no usable image, an unparseable response, a response
   * that survives no filtering, and any thrown error. There is no other outcome,
   * and in particular there is no default.
   */
  public async analyze(input: VisualDNAInput): Promise<VisualDNA | null> {
    const selected = this.select(input.images || []);
    if (!selected.length) return null;

    // Prepared before hashing, so the cache key describes what was actually
    // looked at. Hashing the original would report a hit for two uploads that
    // differ only in a way normalisation removes, and a miss for the same image
    // re-encoded — both wrong, in opposite directions.
    const prepared = await this.prepare(selected);
    const hashes = prepared.map((p) => VisualDNAAnalyzer.hash(p.buffer));

    const existing = input.existingDNA;
    if (
      existing?.provenance?.derived_from_image &&
      existing.provenance.source_hashes.length === hashes.length &&
      existing.provenance.source_hashes.every((h, i) => h === hashes[i])
    ) {
      console.log("[EXPERIMENT][VISUAL_DNA] reusing analysis for unchanged images", {
        hashes,
      });
      return existing;
    }

    const started = Date.now();
    try {
      const content: LLMContentPart[] = [
        {
          type: "text",
          text: `These are the client's own attachments. ${selected
            .map((s) => `${s.branch.toUpperCase()}: one image`)
            .join(". ")}.`,
        },
        ...prepared.map(
          (p): LLMContentPart => ({
            type: "image_url",
            image_url: {
              url: `data:${p.mimeType};base64,${p.buffer.toString("base64")}`,
              detail: "high",
            },
          })
        ),
      ];

      const raw = await this.llm.generateChatCompletion(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        "visual_dna_v1",
        // Cool, because this call is asked to report rather than to invent, and
        // a warm description of a photograph is a description of a different
        // photograph. The token budget is small: the schema is shallow and a
        // long answer here is a sign the model started writing advertising copy.
        { temperature: 0.2, max_tokens: 1800, timeoutMs: 90000 }
      );

      const parsed = this.parse(raw);
      if (!parsed) {
        console.warn("[EXPERIMENT][VISUAL_DNA] unparseable response", { chars: raw?.length ?? 0 });
        return null;
      }

      const dna = this.filter(parsed, selected, hashes);
      if (!dna) {
        console.warn("[EXPERIMENT][VISUAL_DNA] nothing survived filtering — discarded");
        return null;
      }

      console.log("[EXPERIMENT][VISUAL_DNA]", {
        duration_ms: Date.now() - started,
        // What the attachments cost on the wire, before and after preparation,
        // and how many carried a type that did not match their bytes.
        bytes_before: prepared.reduce((n, p) => n + p.before, 0),
        bytes_sent: prepared.reduce((n, p) => n + p.after, 0),
        mime_corrected: prepared.filter((p) => p.corrected).length,
        roles: dna.provenance.analyzed_roles,
        observed_branches: Object.keys(dna.observed),
        inferences_kept: dna.inferred.length,
        hashes,
      });
      return dna;
    } catch (err: any) {
      // The render continues on what it had. An experiment that can fail a
      // generation is a worse trade than one that sometimes does nothing.
      console.warn("[EXPERIMENT][VISUAL_DNA] analysis failed", {
        error: err?.message || String(err),
      });
      return null;
    }
  }

  /** One image per branch, in a fixed order, and only where a buffer exists. */
  private select(
    images: VisualDNAImage[]
  ): { branch: "product" | "logo" | "reference"; buffer: Buffer; mimeType: string; role: string }[] {
    const out: { branch: "product" | "logo" | "reference"; buffer: Buffer; mimeType: string; role: string }[] = [];
    const taken = new Set<string>();
    for (const branch of ["product", "logo", "reference"] as const) {
      for (const img of images) {
        if (out.length >= MAX_IMAGES) break;
        if (taken.has(branch)) break;
        if (!img?.buffer || !img.buffer.length) continue;
        // An absent role means PRODUCT: the upload route's own convention
        // (`role: p.role || "PRODUCT (default)"`) tags inspiration and logos
        // explicitly and leaves product photographs bare. Reading it as "no
        // role" meant the product photograph -- the one image this analyzer
        // exists to read -- was never selected on a real upload, so the
        // director never saw it and asset memory never stored it.
        const role = String(img.role || "PRODUCT").toUpperCase();
        if (ROLE_BRANCH[role] !== branch) continue;
        taken.add(branch);
        out.push({ branch, buffer: img.buffer, mimeType: img.mimeType || "image/jpeg", role });
      }
    }
    return out;
  }

  /**
   * Corrects each image's declared type and shrinks it to what a vision call
   * needs, using the engine's own normaliser rather than a second one.
   *
   * Order matters. The sniff runs first so `normalizeOne` is told what the file
   * really is; run the other way round, a small mislabelled image keeps its wrong
   * label because nothing re-encodes it. Where normalisation does re-encode, the
   * type it returns is authoritative — it produced those bytes — so it wins.
   *
   * Every failure here is non-fatal. An image that cannot be normalised is sent
   * as it arrived: a larger request may still succeed, and refusing to look at a
   * photograph because it could not be shrunk would turn a working render into a
   * silent one.
   */
  private async prepare(
    selected: { branch: string; buffer: Buffer; mimeType: string; role: string }[]
  ): Promise<{ buffer: Buffer; mimeType: string; role: string; before: number; after: number; corrected: boolean }[]> {
    const prepared: { buffer: Buffer; mimeType: string; role: string; before: number; after: number; corrected: boolean }[] = [];
    for (const s of selected) {
      const sniffed = sniffImageMime(s.buffer);
      const corrected = Boolean(sniffed && sniffed !== s.mimeType);
      const truthful = sniffed || s.mimeType;
      if (corrected) {
        console.warn("[EXPERIMENT][VISUAL_DNA] declared type does not match the bytes", {
          role: s.role,
          declared: s.mimeType,
          actual: sniffed,
        });
      }
      try {
        const n = await ImageNormalizationService.normalizeOne(
          { reference_id: s.role, buffer: s.buffer, mimeType: truthful, filename: `${s.role}` },
          VISION_BUDGET
        );
        prepared.push({
          buffer: n.buffer,
          // Re-encoding makes the normaliser the authority; otherwise the sniff is.
          mimeType: n.compression_applied ? n.mimeType : truthful,
          role: s.role,
          before: s.buffer.length,
          after: n.buffer.length,
          corrected,
        });
      } catch (err: any) {
        console.warn("[EXPERIMENT][VISUAL_DNA] normalisation failed; sending the original", {
          role: s.role,
          error: err?.message || String(err),
        });
        prepared.push({
          buffer: s.buffer,
          mimeType: truthful,
          role: s.role,
          before: s.buffer.length,
          after: s.buffer.length,
          corrected,
        });
      }
    }
    return prepared;
  }

  /** Tolerant of fenced JSON, which this gateway emits intermittently. */
  private parse(raw: string): any | null {
    const attempt = (text: string): any | null => {
      try {
        const p = JSON.parse(text);
        return p && typeof p === "object" && p.observed ? p : null;
      } catch {
        return null;
      }
    };
    const t = String(raw || "");
    return (
      attempt(t.trim()) ||
      attempt(t.replace(/```json/gi, "").replace(/```/g, "").trim()) ||
      attempt(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1))
    );
  }

  /** True when a string is an observation rather than a classification or an order. */
  private keep(value: string): boolean {
    if (!value) return false;
    return !INDUSTRY_TERMS.test(value) && !VERDICT_TERMS.test(value) && !IDENTITY_TERMS.test(value);
  }

  private keepList(values: unknown): string[] | undefined {
    if (!Array.isArray(values)) return undefined;
    const kept = values.map(clean).filter((v) => this.keep(v));
    return kept.length ? kept.slice(0, 6) : undefined;
  }

  private keepString(value: unknown): string | undefined {
    const v = clean(value);
    return this.keep(v) ? v : undefined;
  }

  /**
   * Strips everything this layer has no right to say, then checks that what is
   * left still amounts to an observation.
   *
   * A branch that loses every field is removed rather than kept empty, and a
   * result with no observed branch at all is discarded: an inference list with
   * nothing underneath it is the failure mode this file was written against.
   */
  private filter(
    parsed: any,
    selected: { branch: string; role: string }[],
    hashes: string[]
  ): VisualDNA | null {
    const observed: VisualDNAObserved = {};

    const p = parsed.observed?.product;
    if (p) {
      const product: VisualDNAObservedProduct = {
        form: this.keepString(p.form),
        materials: this.keepList(p.materials),
        palette: this.keepList(p.palette),
        finish: this.keepString(p.finish),
        surface_detail: this.keepString(p.surface_detail),
        scale_cues: this.keepString(p.scale_cues),
        condition: this.keepString(p.condition),
      };
      if (Object.values(product).some(Boolean)) observed.product = product;
    }

    const l = parsed.observed?.logo;
    if (l) {
      const logo: VisualDNAObservedLogo = {
        letterform: this.keepString(l.letterform),
        weight: this.keepString(l.weight),
        geometry: this.keepString(l.geometry),
        colour: this.keepList(l.colour),
        spacing: this.keepString(l.spacing),
      };
      if (Object.values(logo).some(Boolean)) observed.logo = logo;
    }

    const r = parsed.observed?.reference;
    if (r) {
      const reference: VisualDNAObservedReference = {
        composition: this.keepString(r.composition),
        light_behaviour: this.keepString(r.light_behaviour),
        tonal_range: this.keepString(r.tonal_range),
      };
      if (Object.values(reference).some(Boolean)) observed.reference = reference;
    }

    if (!Object.keys(observed).length) return null;

    // Everything the observed branch actually says, for the grounding check. The
    // quote has to appear in what survived filtering, not in what was returned —
    // an inference resting on a claim this file just removed is not grounded.
    const grounded = JSON.stringify(observed).toLowerCase();
    const inferred: VisualDNAInference[] = (Array.isArray(parsed.inferred) ? parsed.inferred : [])
      .map((i: any) => ({
        claim: clean(i?.claim),
        basis: clean(i?.basis),
        basis_quote: clean(i?.basis_quote),
        confidence: (["low", "medium", "high"] as const).includes(i?.confidence) ? i.confidence : "low",
      }))
      .filter((i: VisualDNAInference) => {
        if (!i.claim || !i.basis_quote) return false;
        if (!this.keep(i.claim)) return false;
        // A short quote matches too easily to mean anything.
        if (i.basis_quote.length < 8) return false;
        return grounded.includes(i.basis_quote.toLowerCase());
      })
      .slice(0, 6);

    return {
      observed,
      inferred,
      provenance: {
        derived_from_image: true,
        analyzed_roles: selected.map((s) => s.role),
        source_hashes: hashes,
        model_calls: 1,
        analyzed_at: new Date().toISOString(),
      },
    };
  }
}

/** How much of the analysis the director is allowed to be handed. */
const SUMMARY_BUDGET = 900;

/**
 * The director-facing summary.
 *
 * Deliberately not the raw analysis. The director's brief already carries the
 * concept, the copy, the asset intent and its routes; adding an unbounded
 * description of a photograph would crowd out the reasoning it is supposed to
 * support, and this system has spent four phases learning what happens when a
 * prompt outgrows its budget.
 *
 * Two properties matter more than completeness. The observed and inferred
 * branches stay separated, because a renderer that cannot tell a measurement
 * from a reading will treat both as instructions. And the closing line returns
 * authority: these say what the product IS, not what the picture should be.
 */
export function summarizeVisualDNA(dna: VisualDNA | null): string | undefined {
  if (!dna || !dna.provenance?.derived_from_image) return undefined;

  const o = dna.observed;
  const facts: string[] = [];
  if (o.product) {
    const p = o.product;
    const bits = [
      p.form,
      p.materials?.join(", "),
      p.finish,
      p.surface_detail,
      p.palette?.length ? `colours present: ${p.palette.join(", ")}` : "",
      p.scale_cues,
      p.condition,
    ].filter(Boolean);
    if (bits.length) facts.push(`  PRODUCT — ${bits.join("; ")}`);
  }
  if (o.logo) {
    const l = o.logo;
    const bits = [l.letterform, l.weight, l.geometry, l.colour?.join(", "), l.spacing].filter(Boolean);
    if (bits.length) facts.push(`  LOGO — ${bits.join("; ")}`);
  }
  if (o.reference) {
    const r = o.reference;
    const bits = [r.composition, r.light_behaviour, r.tonal_range].filter(Boolean);
    if (bits.length) facts.push(`  REFERENCE IMAGE — ${bits.join("; ")}`);
  }
  if (!facts.length) return undefined;

  const lines = [
    "OBSERVED IN THE CLIENT'S OWN ATTACHMENTS — read from the images, not described by anyone:",
    ...facts,
  ];

  if (dna.inferred.length) {
    lines.push(
      "",
      "INFERRED FROM THOSE OBSERVATIONS — a reading, not a fact. Each says what it rests on, and you may disagree with any of them:",
      ...dna.inferred.map((i) => `  ${i.claim} (from: "${i.basis_quote}", confidence ${i.confidence})`)
    );
  }

  lines.push(
    "",
    "These say what the product IS. They do not say what the picture should be — that is still yours to decide."
  );

  const text = lines.join("\n");
  if (text.length <= SUMMARY_BUDGET) return text;
  // Trimmed at a line boundary: a description cut mid-clause reads as corruption
  // and the closing line is the part that must survive.
  const closing = lines[lines.length - 1];
  const room = SUMMARY_BUDGET - closing.length - 2;
  const kept: string[] = [];
  let used = 0;
  for (const line of lines.slice(0, -2)) {
    if (used + line.length + 1 > room) break;
    kept.push(line);
    used += line.length + 1;
  }
  return [...kept, "", closing].join("\n");
}

/** What was read, for the log. Never the client's images or the raw analysis. */
export function visualDNATelemetry(dna: VisualDNA | null) {
  if (!dna) return { analyzed: false };
  return {
    analyzed: true,
    roles: dna.provenance.analyzed_roles,
    branches: Object.keys(dna.observed),
    inferences: dna.inferred.length,
    confidence_mix: dna.inferred.map((i) => i.confidence),
    hashes: dna.provenance.source_hashes,
    summary_chars: summarizeVisualDNA(dna)?.length ?? 0,
  };
}
