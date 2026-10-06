"use client";

import React, { useMemo } from "react";
import { Wand2 } from "lucide-react";

import {
  inferCreativeApproach,
  APPROACH_LEVELS,
  APPROACH_SOURCE_LABEL_VI,
  AUTO_LABEL_VI,
  LEVEL_HINT_VI,
  LEVEL_LABEL_VI,
  type ApproachChoice,
} from "@/lib/image-engine/director/CreativeApproach";
import type { CampaignObjective } from "../../types/picture-engine.types";

const AUTO: ApproachChoice = "auto";

/**
 * The same badge palette the visual controls use
 * (`components/VisualDirectionControlPanel.tsx:40-45`), so a source badge means
 * the same thing wherever it appears on this screen.
 */
const SOURCE_STYLE: Record<string, string> = {
  user_selected: "text-accent border-accent/40 bg-accent/10",
  concept_tone: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  brand_style: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  objective: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  default: "text-text3 border-borderStrong bg-surface2/40",
};

export interface CreativeApproachControlProps {
  value?: ApproachChoice;
  onChange: (next: ApproachChoice | undefined) => void;
  concept?: string;
  assetType?: string;
  objective?: CampaignObjective | "";
  /** The on-image text, one entry per string the renderer has to draw. */
  copyStrings?: string[];
  /**
   * `BrandKit.style.preferred`, when the browser knows it.
   *
   * It usually does not: the brief carries only `brand_kit_id`
   * (`picture-engine.types.ts` BrandIdentity), and `BrandKitPanel` keeps the
   * fetched kits in its own state. The server loads the kit
   * (`generate-simple/route.ts:94`) and so sees this signal where the browser
   * cannot. Consequence, recorded rather than hidden: for a brand whose kit says
   * "tối giản" and whose concept says nothing, the badge here reads "Tự chọn ·
   * Cân bằng" while the server will infer restrained. Everything above brand
   * style in the precedence — an explicit choice, the concept's own tone — is
   * identical on both sides.
   */
  brandStylePreferred?: string[];
}

/**
 * "Cách tiếp cận sáng tạo" — how daring the frame should be.
 *
 * Sits directly under the concept rather than inside the collapsed visual-controls
 * block, because it governs the idea while the six controls govern how the idea is
 * photographed: `docs/migration/06-creative-direction-analysis.md` §4 concluded
 * that burying the most consequential decision among six optical settings, in a
 * block that is collapsed by default, understates it.
 */
export function CreativeApproachControl({
  value,
  onChange,
  concept,
  assetType,
  objective,
  copyStrings,
  brandStylePreferred,
}: CreativeApproachControlProps) {
  const current: ApproachChoice = value || AUTO;

  // What the system would decide on its own, shown whether or not the user has
  // chosen — so picking a level never hides the reasoning it replaced.
  const suggestion = useMemo(
    () =>
      inferCreativeApproach({
        choice: AUTO,
        concept,
        assetType,
        objective,
        copyStrings,
        brandStylePreferred,
      }),
    [concept, assetType, objective, copyStrings, brandStylePreferred],
  );

  // What will actually be used, including a ceiling or veto applied to the user's
  // own choice. Legibility beats taste, and the user is told when it does.
  const effective = useMemo(
    () =>
      inferCreativeApproach({
        choice: current,
        concept,
        assetType,
        objective,
        copyStrings,
        brandStylePreferred,
      }),
    [current, concept, assetType, objective, copyStrings, brandStylePreferred],
  );

  const options: { id: ApproachChoice; label: string; hint: string }[] = [
    { id: AUTO, label: `${AUTO_LABEL_VI} (mặc định)`, hint: LEVEL_HINT_VI.auto },
    ...APPROACH_LEVELS.map((level) => ({
      id: level as ApproachChoice,
      label: LEVEL_LABEL_VI[level],
      hint: LEVEL_HINT_VI[level],
    })),
  ];

  const badgeSource = current === AUTO ? effective.source : "user_selected";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5">
          <Wand2 size={13} className="text-ai-gold" />
          <span>CÁCH TIẾP CẬN SÁNG TẠO</span>
        </label>
        <span
          className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full border ${
            SOURCE_STYLE[badgeSource] || SOURCE_STYLE.default
          }`}
        >
          {APPROACH_SOURCE_LABEL_VI[badgeSource]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {options.map((opt) => {
          const isActive = current === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id === AUTO ? undefined : opt.id)}
              className={`text-left px-3 py-2 rounded-[2px] border transition-colors cursor-pointer outline-none ${
                isActive
                  ? "bg-surface3 border-borderStrong text-text"
                  : "bg-surface2 border-border text-text-muted hover:border-borderStrong hover:text-text"
              }`}
            >
              <span className={`block text-[12.5px] font-sans ${isActive ? "font-bold" : ""}`}>
                {opt.label}
              </span>
              <span className="block text-[11px] text-text-telemetry leading-snug mt-0.5">
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* The suggestion, and why. Shown on the auto row so a user who leaves the
          default still knows what the system concluded and from which words. */}
      {current === AUTO && (
        <p className="text-[11.5px] text-text3 leading-relaxed px-1">
          AI gợi ý: <span className="text-text2 font-semibold">{LEVEL_LABEL_VI[suggestion.level]}</span>
          {" — "}
          {suggestion.reason_vi}
        </p>
      )}

      {/* An override the system had to walk back. Never silent: the whole point of
          06's §6 is that a demotion the user cannot see is indistinguishable from
          the system ignoring them. */}
      {effective.adjustments.map((adj) => (
        <p
          key={`${adj.from}-${adj.to}-${adj.reason_vi}`}
          className="text-[11.5px] leading-relaxed px-2 py-1.5 rounded-[2px] border border-amber-500/40 bg-amber-500/10 text-amber-200"
        >
          <span className="font-semibold">AI đã điều chỉnh: </span>
          {LEVEL_LABEL_VI[adj.from]} → {LEVEL_LABEL_VI[adj.to]}. {adj.reason_vi}
        </p>
      ))}

      {/* The existing "reuse the AI suggestion" idiom
          (`VisualDirectionControlPanel.tsx:168-176`). */}
      {current !== AUTO && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-[11px] text-text3 hover:text-text underline cursor-pointer outline-none"
        >
          Dùng lại đề xuất của AI ({LEVEL_LABEL_VI[suggestion.level]})
        </button>
      )}
    </div>
  );
}
