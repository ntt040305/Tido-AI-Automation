/**
 * The GPT Image 2.5 Sunburst prompt engine.
 *
 * Same shape as `build-simple.ts`: gather the inputs, one director call, deterministic
 * checks, at most one repair, then stop. The differences are the ones the model forces —
 * a different template set, a different section contract, and a fallback that is built in
 * code rather than by falling through to v1.
 *
 * NEVER v1. `build-simple` may fall back to the eight-block Gemini compiler because that
 * compiler was written for the model it is talking to. This engine may not: v1 writes
 * Gemini dialect, and handing Sunburst a prompt written for Nano Banana 2 produces an
 * image that looks like a result, costs 150-250 VND, and reports nothing wrong. When the
 * director and its repair both fail, `gpt-fallback.ts` assembles a plain prompt from the
 * same brief data.
 *
 * THE 512px GATE
 * --------------
 * Sunburst has a measured identity floor: a packed product panel below 512px on its
 * longest side is not reliably legible. Whether a 496px panel still locks a product's
 * LABEL has not been confirmed against the real model — the allocation table's
 * "panels <512px" column is arithmetic, not an observation. Until it is confirmed,
 * `labelLockVerified()` is false and this engine refuses a payload that would depend on
 * it, mirroring the way the allocator already refuses nine distinct products. Shipping
 * the alternative would be a silent quality regression on exactly the renders a user
 * cares most about.
 */
import { loadTemplates, fillSlots, type LoadedTemplates } from "./templates";
import {
  compileGptBrief,
  gptFallbackMaxChars,
  gptLengthBounds,
  layoutFor,
  type GptBriefInput,
  type CompiledGptBrief,
} from "./gpt-brief";
import { runGptChecks, gptCheckTelemetry, type GptCheckResult } from "./gpt-checks";
import { buildGptFallbackPrompt } from "./gpt-fallback";
import {
  labelLockVerified,
  gptBanVerdictWords,
  smallPanelPolicy,
  gptTemplateVersion,
} from "./engine-selector";
import { smallPanels } from "../provider/reference-packing/reference-allocation";

export interface GptDeps {
  chat: (
    messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>,
    purpose: string,
  ) => Promise<string>;
}

export interface GptEngineResult {
  ok: boolean;
  /** The master prompt to send, when ok. */
  prompt?: string;
  /** How the prompt was produced. `fallback` means the director failed twice. */
  source?: "director" | "repair" | "fallback";
  /** The director's own account of what it chose. Logged and stored, never sent. */
  decisions?: string;
  warnings: string[];
  checks?: GptCheckResult;
  reason?: string;
  llmCalls: number;
  copy_original: string[];
  copy_final: string[];
  templates?: LoadedTemplates;
  brief?: CompiledGptBrief;
  /** Panels the brief refused to label-lock. */
  unsafePanels: CompiledGptBrief["unsafePanels"];
  /** Set when the run was refused before any model call. */
  refusal?: { code: string; message_vi: string };
}

/** Four tags. `decisions` is the one this dialect adds over the Gemini engine's set. */
export interface GptReply {
  decisions: string;
  copy_final: string[];
  warnings: string[];
  image_prompt: string;
}

const nfc = (s: unknown): string => String(s ?? "").normalize("NFC");

/**
 * Tolerant tag parsing, the same policy as `tags.ts`.
 *
 * A missing closing tag is recoverable — take the rest of the reply — because the one
 * thing worse than a slightly ragged prompt is paying for a second call over a `</` the
 * model forgot.
 */
export function parseGptReply(raw: string): GptReply {
  const text = nfc(raw || "");
  const pick = (tag: string): string => {
    const open = text.indexOf(`<${tag}>`);
    if (open < 0) return "";
    const from = open + tag.length + 2;
    const close = text.indexOf(`</${tag}>`, from);
    return (close < 0 ? text.slice(from) : text.slice(from, close)).trim();
  };
  const lines = (tag: string): string[] =>
    pick(tag)
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*\d.)\]]+\s*/, "").trim())
      .filter(Boolean);

  return {
    decisions: pick("decisions"),
    copy_final: lines("copy_final"),
    warnings: lines("warnings"),
    image_prompt: pick("image_prompt"),
  };
}

export function buildGptMessages(
  input: GptBriefInput,
  version = gptTemplateVersion(),
): { system: string; user: { role: "user"; content: string }; templates: LoadedTemplates; brief: CompiledGptBrief } {
  const hasCopy = input.copy.some((c) => nfc(c).trim());
  const templates = loadTemplates(input.assetType, version, "gpt-image", hasCopy);
  const brief = compileGptBrief(input);

  const playbook = fillSlots(templates.playbook, {
    ASPECT_RATIO: input.aspectRatio,
    LAYOUT: layoutFor(input.aspectRatio),
  });

  const slots = {
    ...brief.slots,
    PLAYBOOK: playbook,
    GOLD_EXAMPLE: templates.goldExample
      ? templates.goldExample
      : "  (no gold example for this asset type yet)",
  };

  return {
    system: templates.system,
    user: { role: "user", content: fillSlots(templates.request, slots) },
    templates,
    brief,
  };
}

/**
 * Why a payload is refused before anything is paid for.
 *
 * Mirrors the allocator's own refusal: a Vietnamese sentence that names the limit and
 * tells the user what to do, rather than a silent degradation.
 */
export function labelLockRefusal(
  input: GptBriefInput,
): { code: string; message_vi: string } | null {
  if (labelLockVerified()) return null;
  // Default policy is to render and warn, not to refuse — see `smallPanelPolicy`. The
  // brief already forbids label-locking these panels and the checks enforce it, so the
  // honest thing is to let the render happen and say what the risk is.
  if (smallPanelPolicy() !== "refuse") return null;
  if (!input.allocation) return null;
  const floor = input.minPanelLongestSidePx ?? 512;
  const small = smallPanels(input.allocation, floor);
  if (small.length === 0) return null;

  // Only a payload that actually needs a label read is at risk. A product whose wording
  // is already in the product facts can be described from them.
  const smallest = Math.min(...small.map((s) => s.longestSidePx));
  return {
    code: "PANEL_BELOW_IDENTITY_FLOOR",
    message_vi:
      `Model hiện tại cần mỗi ảnh sản phẩm rộng ít nhất ${floor}px để giữ đúng chữ trên nhãn. ` +
      `Với số ảnh bạn gửi, ${small.length} ô bị thu xuống còn ${smallest}px — chưa xác minh được ` +
      `là nhãn vẫn đọc đúng ở kích thước này. Hãy gửi ít ảnh sản phẩm hơn (tối đa 4 ảnh mỗi lần) ` +
      `hoặc tách thành nhiều lần tạo.`,
  };
}

export async function buildGptPrompt(input: GptBriefInput, deps: GptDeps): Promise<GptEngineResult> {
  const copy_original = input.copy.map(nfc).filter((c) => c.trim());

  // ── The 512px gate, before any spend ───────────────────────────────────
  const refusal = labelLockRefusal(input);
  // On the default "warn" policy the render proceeds, loudly. The number is the thing
  // worth seeing: 466px against a 512px floor is a judgement a person can make from the
  // finished image, and they can only make it if they were told.
  const smallNow = input.allocation
    ? smallPanels(input.allocation, input.minPanelLongestSidePx ?? 512)
    : [];
  if (!refusal && smallNow.length > 0 && !labelLockVerified()) {
    const smallest = Math.min(...smallNow.map((s) => s.longestSidePx));
    console.warn(
      `[PROMPT_GPT][SMALL_PANEL] ${smallNow.length} product panel(s) are below the ` +
        `${input.minPanelLongestSidePx ?? 512}px identity floor (smallest ${smallest}px). ` +
        `The brief forbids label-locking them and the checks enforce it, but a label on ` +
        `those products may still come back wrong. Set GPT_SMALL_PANEL_POLICY=refuse to ` +
        `reject these payloads instead.`,
    );
  }
  if (refusal) {
    return {
      ok: false,
      refusal,
      reason: refusal.code,
      warnings: [refusal.message_vi],
      llmCalls: 0,
      copy_original,
      copy_final: copy_original,
      unsafePanels: smallPanels(input.allocation!, input.minPanelLongestSidePx ?? 512).map((s) => ({
        slot: s.slot,
        label: s.label,
        longestSidePx: s.longestSidePx,
      })),
    };
  }

  let built: ReturnType<typeof buildGptMessages>;
  try {
    built = buildGptMessages(input);
  } catch (e) {
    return {
      ok: false,
      reason: `the GPT templates did not load: ${(e as Error).message.slice(0, 160)}`,
      warnings: [],
      llmCalls: 0,
      copy_original,
      copy_final: copy_original,
      unsafePanels: [],
    };
  }

  const { system, user, templates, brief } = built;
  const referenceCount = input.allocation ? input.allocation.slots.length : input.references.length;
  const bounds = gptLengthBounds(input);
  const checkOptions = {
    copy: copy_original,
    referenceCount,
    aspectRatio: input.aspectRatio,
    minChars: bounds.minChars,
    maxChars: bounds.maxChars,
    unsafePanels: brief.unsafePanels,
    banVerdictWords: gptBanVerdictWords(),
    // The second rule set, dormant unless the sheet wrote the brief. Everything it needs
    // comes from the sheet, so a check can only ever fire against a prompt that had the
    // information to pass it — a check that refuses what the brief never asked for is
    // just a repair call with extra steps.
    ...(input.artDirector && input.sheet && input.printRule
      ? {
          sheet: input.sheet,
          density: input.density ?? ("words_only" as const),
          printRuleBranch: input.printRule.branch,
        }
      : {}),
  };

  // The code-built prompt is checked against its own ceiling. See `gptFallbackMaxChars`:
  // the director's word budget is a discipline for a writer, and this one is not a writer.
  const fallbackCheckOptions = { ...checkOptions, maxChars: gptFallbackMaxChars(input) };

  const base = {
    warnings: [...brief.warnings],
    llmCalls: 0,
    copy_original,
    copy_final: copy_original,
    templates,
    brief,
    unsafePanels: brief.unsafePanels,
  };

  const messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [
    { role: "system", content: system },
    user,
  ];

  let raw: string;
  try {
    raw = await deps.chat(messages, "prompt_gpt_director");
  } catch (e) {
    // The director never answered. A code-built prompt is the right answer here: it is
    // correct, it is cheap, and it is not Gemini dialect.
    const prompt = buildGptFallbackPrompt(input, templates.playbook);
    const checks = runGptChecks(prompt, fallbackCheckOptions);
    return {
      ...base,
      ok: true,
      prompt,
      source: "fallback",
      checks,
      llmCalls: 1,
      warnings: [...base.warnings, `the director call failed (${(e as Error).message.slice(0, 120)}); the prompt was built in code`],
    };
  }

  let reply = parseGptReply(raw);
  let checks = runGptChecks(reply.image_prompt, checkOptions);
  let source: GptEngineResult["source"] = "director";
  let calls = 1;

  // One repair, then stop. A second repair is a third call.
  if (!reply.image_prompt || !checks.ok) {
    const failures = [
      ...(reply.image_prompt ? [] : ["the <image_prompt> tag was missing or empty"]),
      ...checks.failures.map((f) => f.message),
    ];
    try {
      const repaired = await deps.chat(
        [
          ...messages,
          { role: "assistant", content: raw },
          {
            role: "user",
            content:
              "The master prompt failed these checks:\n" +
              failures.map((f) => `- ${f}`).join("\n") +
              "\n\nRewrite it so every one of them passes. Keep everything that was already " +
              "right. Answer with the same four tags and nothing else.",
          },
        ],
        "prompt_gpt_repair",
      );
      calls = 2;
      const reparsed = parseGptReply(repaired);
      if (reparsed.image_prompt) {
        const recheck = runGptChecks(reparsed.image_prompt, checkOptions);
        // Keep the repair only if it is actually better.
        if (recheck.failures.length <= checks.failures.length) {
          reply = reparsed;
          checks = recheck;
          source = "repair";
        }
      }
    } catch {
      calls = 2;
    }
  }

  if (!reply.image_prompt || !checks.ok) {
    const prompt = buildGptFallbackPrompt(input, templates.playbook);
    const fallbackChecks = runGptChecks(prompt, fallbackCheckOptions);
    return {
      ...base,
      ok: true,
      prompt,
      source: "fallback",
      decisions: reply.decisions,
      checks: fallbackChecks,
      llmCalls: calls,
      warnings: [
        ...base.warnings,
        ...reply.warnings,
        `the director's prompt failed ${checks.failures.length} check(s) after one repair; the prompt was built in code`,
      ],
    };
  }

  return {
    ...base,
    ok: true,
    prompt: reply.image_prompt,
    source,
    decisions: reply.decisions,
    checks,
    llmCalls: calls,
    copy_final: reply.copy_final.length ? reply.copy_final : copy_original,
    warnings: [...base.warnings, ...reply.warnings],
  };
}

/** Counts, codes and sizes. Never the prompt, never the client's copy. */
export function gptEngineTelemetry(r: GptEngineResult | null | undefined) {
  if (!r) return { gpt_engine: false };
  return {
    gpt_engine: true,
    ok: r.ok,
    source: r.source || null,
    llm_calls: r.llmCalls,
    prompt_chars: r.prompt ? r.prompt.length : 0,
    unsafe_panels: r.unsafePanels.length,
    refused: r.refusal ? r.refusal.code : null,
    warnings: r.warnings.length,
    ...gptCheckTelemetry(r.checks),
  };
}
