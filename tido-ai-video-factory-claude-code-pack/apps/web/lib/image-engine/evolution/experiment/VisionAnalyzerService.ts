import crypto from "crypto";
import { LLMProviderService } from "../../llm/llm-provider.service";
import { RenderTracer } from "../../observability/RenderTracer";
import { sniffImageMime } from "./VisualDNAAnalyzer";
import {
  checkRenderedText,
  type TextCheck,
  type TextRequirement,
  type VisibleText,
} from "../../compiler/ExactCopyIntegrityValidator";
import {
  VisionAnalysisResult,
  VisionNote,
  VisionAction,
  VisionArea,
  CorrectableScope,
  CORRECTABLE_SCOPES,
  emptyVisionAnalysis,
} from "./VisionAnalysisResult";

/**
 * Looks at the render and says what is wrong with it.
 *
 * Why this is not VisualDNAAnalyzer
 * ---------------------------------
 * That analyzer already reads images with a model, and reusing it was the first
 * thing considered. But it answers a different question: it reads a PRODUCT --
 * form, materials, palette, finish -- to learn what the thing is. Asked about a
 * finished poster it would report the coffee cup accurately and say nothing
 * about whether the headline is legible, whether the closing line collides with
 * the vessel, or whether the text rendered as letter-shaped noise.
 *
 * Those are the defects that actually cost this product its render scores, so
 * this service asks about them directly. It shares the analyzer's transport and
 * its discipline, not its schema.
 *
 * Provider independence
 * ---------------------
 * The provider is an interface with one method, and the default implementation
 * is a thin wrapper over the existing LLM gateway. Nothing above this file
 * names a model or a vendor, so swapping in a dedicated vision endpoint later
 * is a constructor argument rather than a migration.
 *
 * The one invariant
 * -----------------
 * `analyzed_image` is set true at exactly one point in this file: after a
 * provider returns a response that parses, for bytes that were handed to it. A
 * missing provider, a timeout, an unreadable buffer, an unparseable reply -- all
 * of them return `emptyVisionAnalysis(reason)` with the flag false. There is no
 * path through this service that claims sight without it.
 */

/** One vision backend. Replaceable; nothing above depends on its identity. */
export interface VisionProvider {
  /** Named in the result so a finding can be traced to what produced it. */
  readonly name: string;
  /**
   * Hands the image and the question to a model and returns its raw reply.
   * Throwing is fine -- the service treats any failure as "nothing looked".
   */
  analyzeImage(req: {
    image: Buffer;
    mimeType: string;
    system: string;
    instruction: string;
  }): Promise<string>;
}

/** The default: the multimodal path the gateway already supports. */
export class LLMVisionProvider implements VisionProvider {
  public readonly name: string;
  private llm: LLMProviderService;

  constructor(llm?: LLMProviderService, name = "llm-gateway") {
    this.llm = llm || new LLMProviderService();
    this.name = name;
  }

  async analyzeImage(req: {
    image: Buffer;
    mimeType: string;
    system: string;
    instruction: string;
  }): Promise<string> {
    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.logPrompt(
        "VISION_REVIEW",
        `[SYSTEM]\n${req.system}\n\n[INSTRUCTION]\n${req.instruction}\n\n[IMAGE_ATTACHMENT]\nmimeType=${req.mimeType}, bytes=${req.image.length}`,
        process.env.LLM_MODEL || "gemini-3.7-flash-high"
      );
    }
    const response = await this.llm.generateChatCompletion(
      [
        { role: "system", content: req.system },
        {
          role: "user",
          content: [
            { type: "text", text: req.instruction },
            {
              type: "image_url",
              // "high" detail: the defects this looks for are small type and
              // edge collisions, which a downsampled read cannot resolve.
              image_url: {
                url: `data:${req.mimeType};base64,${req.image.toString("base64")}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      "vision_render_critic",
      { temperature: 0.2, max_tokens: 1200, timeoutMs: 60000 },
    );
    if (RenderTracer.isTraceEnabled()) {
      RenderTracer.logResponse("VISION_REVIEW", response || "");
    }
    return response;
  }
}

const SYSTEM = `You are a senior art director reviewing a finished commercial image before it ships.

You are looking at the RENDER, not a brief. Report only what you can actually see in this image.

What to examine, in order of how often it ruins a commercial render:
1. TEXT. Is every word spelled correctly and fully formed? AI renderers produce letter-shaped noise, dropped diacritics and invented words. Quote any text you can read, exactly as it appears.
2. DUPLICATION. Does the same line appear more than once anywhere in the frame -- repeated at another size, echoed in a corner, printed again on the product, or set twice in the same block? List every occurrence separately in "visible_text" so a repeat is visible as two entries rather than one.
3. COLLISION. Does any line of type cross the product, another line, a hard edge, a highlight, or the edge of the frame? Say which two things touch.
4. HIERARCHY. Is it obvious which line is meant to be read first? Report when every line is set at roughly the same size and weight, or when a supporting line is louder than the line above it.
5. READABILITY. Does any text sit on a background that swallows it, on busy detail, or at a size too small to read at a glance?
6. BALANCE. Is the type massed on one side with nothing answering it, or piled on the same axis as the product?
7. PRODUCT. Does the product look like a real manufactured object -- consistent shape, plausible label, no melted or duplicated parts?
8. LAYOUT. Is anything tangent, cropped awkwardly, or crowded against an edge?
9. ARTIFACTS. Extra fingers, impossible reflections, repeated patterns, warped geometry.

On typography, say what a senior art director would say to another designer:
"The headline overlaps the product silhouette." "The subtitle is too close to the CTA." "The typography block lacks visual hierarchy." Name the elements and what is wrong between them -- not an adjective.

Rules:
- Report ONLY what is visible. If you cannot read the text, say that rather than guessing what it says.
- Do NOT critique the creative direction. The colour palette, the mood, the crop and the concept were chosen deliberately by a human director. You are checking execution, not taste.
- An empty list is a valid and useful answer. Do not invent problems to seem thorough.`;

const INSTRUCTION = `Review this rendered commercial image and reply with a single JSON object, nothing around it:

{
  "strengths": [{ "what": "...", "where": "..." }],
  "issues": [{ "what": "...", "where": "...", "confidence": "low|medium|high" }],
  "typography_problems": [{ "what": "...", "where": "...", "kind": "duplicate|collision|hierarchy|readability|balance|malformed" }],
  "layout_problems": [{ "what": "...", "where": "..." }],
  "product_accuracy": [{ "what": "...", "where": "..." }],
  "visible_text": [{ "text": "exactly as rendered, one entry per separate block of text", "where": "...", "on_product": true, "on_logo": false }],
  "improvement_actions": [
    { "action": "specific, executable instruction",
      "because": "what it fixes",
      "area": "typography|layout|product_accuracy|composition|readability|artifact",
      "scope": "error|readability|product_accuracy|composition" }
  ]
}

Every action must be specific enough to execute. "Improve the typography" is not an instruction; "set the closing line at half the headline weight and move it clear of the cup's edge" is.

Report a duplicate as a typography_problem with "kind": "duplicate" AND as two separate "visible_text" entries. A line set once is not a duplicate; a line set twice is, however different the two treatments are.

Omit any list you have nothing real to put in -- except "visible_text": list every piece of legible text in the image, exactly as it is rendered, with "on_product": true when it is printed on the product itself (its label, cap or packaging) and false when it is set in the image around the product; "on_logo": true when the words are part of a brand logo mark. An image with no text at all has "visible_text": [].`;

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

function toNotes(raw: unknown): VisionNote[] {
  if (!Array.isArray(raw)) return [];
  const out: VisionNote[] = [];
  for (const r of raw) {
    // The model is asked for objects but sometimes answers with bare strings;
    // both carry a real observation, so both are accepted.
    const what = typeof r === "string" ? clean(r) : clean(r?.what);
    if (!what) continue;
    const where = typeof r === "object" && r ? clean((r as any).where) : "";
    const conf = typeof r === "object" && r ? clean((r as any).confidence) : "";
    out.push({
      what,
      ...(where ? { where } : {}),
      ...(conf === "low" || conf === "medium" || conf === "high" ? { confidence: conf } : {}),
    });
  }
  return out;
}

const AREAS: VisionArea[] = [
  "typography",
  "layout",
  "product_accuracy",
  "composition",
  "readability",
  "artifact",
];

/** The text the model read. Null when it did not report the list at all. */
function toVisibleText(raw: unknown): VisibleText[] | null {
  if (!Array.isArray(raw)) return null;
  const out: VisibleText[] = [];
  for (const r of raw) {
    const text = typeof r === "string" ? clean(r) : clean(r?.text);
    if (!text) continue;
    const o = typeof r === "object" && r ? (r as { on_product?: unknown; on_logo?: unknown }) : null;
    out.push({ text, on_product: o?.on_product === true, ...(o?.on_logo === true ? { on_logo: true } : {}) });
  }
  return out;
}

function toActions(raw: unknown): VisionAction[] {
  if (!Array.isArray(raw)) return [];
  const out: VisionAction[] = [];
  for (const r of raw) {
    const action = typeof r === "string" ? clean(r) : clean(r?.action);
    if (!action) continue;
    const o = (typeof r === "object" && r ? r : {}) as any;
    const scope = clean(o.scope) as CorrectableScope;
    const area = clean(o.area) as VisionArea;
    out.push({
      action,
      ...(clean(o.because) ? { because: clean(o.because) } : {}),
      ...(AREAS.includes(area) ? { area } : {}),
      // An unrecognised scope is preserved verbatim rather than coerced into a
      // permitted one. `sanitizeActions` then drops it, which is the point:
      // guessing here would smuggle an unvetted instruction into a render.
      scope: (CORRECTABLE_SCOPES as readonly string[]).includes(scope) ? scope : ("unscoped" as CorrectableScope),
    });
  }
  return out;
}

export interface VisionAnalyzerInput {
  image: Buffer;
  mimeType?: string;
  /** What the render was supposed to contain, so text can be checked against it. */
  expectedCopy?: string[];
  /** What the product is, for the accuracy check. */
  productDescription?: string;
  /**
   * The text requirement: exactly these lines, or no text at all. When given,
   * the review checks it -- missing, incorrect and unwanted text -- and the
   * verdict is computed, not asked for. Supersedes `expectedCopy`.
   */
  textRequirement?: TextRequirement;
}

export class VisionAnalyzerService {
  private provider: VisionProvider | null;

  /** Pass null to construct a service that will never look. Useful in tests. */
  constructor(provider?: VisionProvider | null) {
    this.provider = provider === undefined ? new LLMVisionProvider() : provider;
  }

  /** Identifies which bytes a finding came from. */
  public static hash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  }

  /**
   * Analyses one render. Never throws -- a failed look returns an unavailable
   * result, because a view of the picture is never worth failing the picture.
   */
  public async analyze(input: VisionAnalyzerInput): Promise<VisionAnalysisResult> {
    if (!this.provider) return emptyVisionAnalysis("no vision provider configured");
    const image = input?.image;
    if (!Buffer.isBuffer(image) || image.length === 0) {
      return emptyVisionAnalysis("no rendered image was available to analyse");
    }

    const mimeType = input.mimeType || sniffImageMime(image) || "";
    if (!mimeType) return emptyVisionAnalysis("the rendered bytes were not a recognisable image");

    let instruction = INSTRUCTION;
    const req = input.textRequirement;
    const copy = req ? req.lines : (input.expectedCopy || []).map(clean).filter(Boolean);
    if (req?.mode === "none") {
      instruction += `

This image was required to carry NO text at all. Any headline, slogan, caption, price, CTA or decorative lettering set in the image is a defect: report each one in typography_problems. Text printed on the product itself (its label or packaging) is part of the product and is not a defect.`;
    } else if (copy.length) {
      // Giving the model the intended words is what turns "the text looks odd"
      // into "it reads GHE THU, it should read Ghé thử" -- the difference
      // between a finding and an actionable one.
      instruction += `\n\nThe image was supposed to contain exactly this text: ${copy
        .map((c) => `"${c}"`)
        .join(", ")}. Compare what is rendered against it, character by character, and report any difference.`;
    }
    if (clean(input.productDescription)) {
      instruction += `\n\nThe product is: ${clean(input.productDescription)}.`;
    }

    let raw: string;
    try {
      raw = await this.provider.analyzeImage({ image, mimeType, system: SYSTEM, instruction });
    } catch (e: any) {
      return emptyVisionAnalysis(`the vision provider failed: ${e?.message || String(e)}`);
    }

    const text = clean(raw);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      return emptyVisionAnalysis("the vision provider did not return a readable analysis");
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return emptyVisionAnalysis("the vision provider's analysis did not parse");
    }
    if (!parsed || typeof parsed !== "object") {
      return emptyVisionAnalysis("the vision provider's analysis was not an object");
    }

    // What the model read, and -- when there is a requirement -- the verdict
    // on it, computed here rather than asked for, so "is the text exact" does
    // not depend on the same model grading its own reading.
    const visible = toVisibleText(parsed.visible_text);
    const typography = toNotes(parsed.typography_problems);
    let textCheck: TextCheck | undefined;
    if (req && visible) {
      textCheck = checkRenderedText(visible, req);
      for (const m of textCheck.missing) typography.push({ what: `required text is missing: "${m}"` });
      for (const i of textCheck.incorrect) {
        typography.push({ what: `text is incorrect: rendered "${i.rendered}", required "${i.expected}" exactly` });
      }
      for (const u of textCheck.unwanted) {
        typography.push({
          what: req.mode === "none"
            ? `unwanted generated text: "${u}" -- this image must carry no text`
            : `unwanted text that was not supplied: "${u}"`,
        });
      }
    }

    // A model looked at these bytes and answered about them. This is the only
    // place in the codebase permitted to set this flag.
    return {
      analyzed_image: true,
      strengths: toNotes(parsed.strengths),
      issues: toNotes(parsed.issues),
      typography_problems: typography,
      layout_problems: toNotes(parsed.layout_problems),
      product_accuracy: toNotes(parsed.product_accuracy),
      improvement_actions: toActions(parsed.improvement_actions),
      provider: this.provider.name,
      image_hash: VisionAnalyzerService.hash(image),
      ...(visible ? { visible_text: visible } : {}),
      ...(textCheck ? { text_check: textCheck } : {}),
    };
  }
}
