"use client";

import React from "react";
import {
  CreativeIntelligence,
  CreativeReason,
  VisionAnalysis,
  DesignDecisionResult,
  DesignDecision,
} from "../../types/picture-engine.types";
import { Sparkles, ChevronRight, AlertCircle, Wand2, Eye, ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * What the AI decided, said the way a creative director would say it.
 *
 * Five sections, in the order a person actually asks the questions: what did
 * you understand, what did you choose, how did you build it, what else did you
 * look at, and what do you think of the result.
 *
 * Two rules, both learned the expensive way in this product.
 *
 * NOTHING WITHOUT A SOURCE. Every block renders only when the backend actually
 * decided it. There are no fallbacks, no "AI is thinking…" filler and no
 * placeholder copy. A confident-looking panel over absent data is the failure
 * this codebase has already corrected twice — once for a hardcoded 94/100
 * quality badge, once for placeholder brief text that was being locked in as
 * user intent.
 *
 * NO INTERNAL VOCABULARY. A user never reads "blueprint", "Layout Geometry" or
 * "Prompt Compiler". The depth is there for a designer; the words are not.
 *
 * Progressive disclosure: a beginner sees three sentences. A designer opens the
 * craft reasoning and reads the same decisions with their sources.
 */

export interface CreativeDirectionPanelProps {
  intelligence: CreativeIntelligence | null;
  /**
   * What a model saw in the finished render, when one looked.
   *
   * Kept separate from `intelligence` on purpose. The intelligence is what the
   * system INTENDED; this is what it OBSERVED, and the panel says which is
   * which. Presenting a reasoned guess in the same voice as an observation is
   * the one thing this component must not do.
   */
  vision?: VisionAnalysis | null;
  /**
   * What the design reasoning changed after looking, and what it left alone.
   *
   * This is the section that explains an improvement rather than announcing
   * one. "The image got better" is a claim; "the headline went from 2 to 2.7
   * because it was not acting as the first anchor" is an account.
   */
  decisions?: DesignDecisionResult | null;
  /**
   * Folds the AI's own suggestions back into the brief for the next render.
   *
   * Deliberately not a "fix it" button. It edits the visible concept text the
   * user owns, so they see exactly what changed and can undo it — rather than
   * a hidden correction applied somewhere they cannot inspect.
   */
  onApplySuggestions?: (suggestions: string[]) => void;
}

/** One heading, in the user's language. */
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="text-[11px] font-mono text-text3 uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        <span>{title}</span>
      </span>
      {children}
    </div>
  );
}

/** A decision with its source, revealed on request rather than by default. */
function ReasonBlock({ label, reason }: { label: string; reason?: CreativeReason }) {
  if (!reason?.what) return null;
  return (
    <div className="space-y-1">
      <span className="text-[10.5px] font-mono text-text3 uppercase tracking-wider">{label}</span>
      <p className="text-[12.5px] text-text2 leading-relaxed">{reason.what}</p>
      {reason.why && (
        <p className="text-[11px] text-text3/80 italic leading-relaxed border-l border-border pl-2.5">
          {reason.why}
        </p>
      )}
    </div>
  );
}

export function CreativeDirectionPanel({
  intelligence,
  vision,
  decisions,
  onApplySuggestions,
}: CreativeDirectionPanelProps) {
  // No render at all rather than an empty frame. A panel that appears with
  // nothing in it reads as a failure; a panel that is absent reads as "not yet".
  const sawImage = Boolean(vision?.analyzed_image);
  const allDecisions = [
    ...(decisions?.typography_decisions || []),
    ...(decisions?.layout_decisions || []),
  ];
  if (!sawImage && !allDecisions.length && (!intelligence || Object.keys(intelligence).length === 0)) {
    return null;
  }

  // Visual strategy is deliberately excluded: it has its own visible section
  // above, and counting it here would open an empty drawer on a render where
  // it was the only craft decision made.
  const hasCraft =
    intelligence?.typography_reasoning ||
    intelligence?.composition_reasoning ||
    intelligence?.layout_reasoning;

  const otherConcepts = (intelligence?.concepts || []).filter((c) => !c.selected);
  // What was actually seen outranks what was merely reasoned. When a model
  // looked at the render, its findings are the ones worth a user's attention;
  // the pre-render critique is a prediction about an image that now exists.
  const observed = sawImage
    ? [
        ...(vision!.issues || []),
        ...(vision!.typography_problems || []),
        ...(vision!.layout_problems || []),
        ...(vision!.product_accuracy || []),
      ].map((n) => n.what).filter(Boolean)
    : [];
  const feedback = observed.length ? observed : intelligence?.critic_feedback || [];
  const suggestions = sawImage
    ? (vision!.improvement_actions || []).map((a) => a.action).filter(Boolean)
    : intelligence?.improvement_suggestions || [];
  // Whether the review can be believed at all.
  //
  // `analyzed_image` says a call was made; the critique's verdict says it came
  // back with something. A failed vision call used to score a flawless 10/10
  // because an area with no findings scored 10, so "never looked" and "looked and
  // found nothing" rendered identically. They are now different on screen.
  const reviewUnverified = sawImage && vision!.typography_critique?.verdict === "unverified";

  // Shown only when a model actually looked, AND the look produced something.
  // Manufacturing praise to balance the criticism would be fabrication in the
  // friendly direction; printing ticks for a review that never happened is the
  // same fabrication with a stronger claim attached.
  const strengths = sawImage && !reviewUnverified ? (vision!.strengths || []).map((s) => s.what).filter(Boolean) : [];

  return (
    <div className="space-y-5">
      {/* ── 1. What the AI understood ──────────────────────────────────── */}
      {intelligence?.creative_summary && (
        <Section icon={<Sparkles size={12} className="text-aiGlow" />} title="AI hiểu sản phẩm">
          <p className="text-[12.5px] text-text leading-relaxed p-3 bg-surface2/60 border border-borderStrong rounded-xl">
            {intelligence?.creative_summary}
          </p>
        </Section>
      )}

      {/* ── 2. The direction it chose ──────────────────────────────────── */}
      {intelligence?.selected_direction && (
        <Section icon={<Sparkles size={12} className="text-aiGlow" />} title="Hướng sáng tạo">
          <div className="p-3.5 bg-aiGlow/10 border border-aiGlow/30 rounded-xl space-y-2">
            <p className="text-[13px] text-white font-semibold leading-relaxed">
              {intelligence?.selected_direction}
            </p>
            {intelligence?.reasoning && (
              <p className="text-[11.5px] text-text2/90 italic leading-relaxed">
                {intelligence?.reasoning}
              </p>
            )}
            {intelligence?.audience_insight?.what && (
              <p className="text-[11.5px] text-text2 leading-relaxed border-l border-aiGlow/30 pl-2.5">
                <span className="text-text3">Người xem: </span>
                {intelligence?.audience_insight?.what}
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── 3. The world the picture lives in ──────────────────────────── */}
      {/* Visible rather than folded away with the craft detail. It is the
          decision a non-designer can actually picture, and it is the one that
          explains most of what they are looking at. */}
      {intelligence?.visual_strategy?.what && (
        <Section icon={<Sparkles size={12} className="text-aiGlow" />} title="Thế giới hình ảnh">
          <div className="p-3 bg-surface2/60 border border-borderStrong rounded-xl space-y-1.5">
            <p className="text-[12.5px] text-text2 leading-relaxed">
              {intelligence?.visual_strategy?.what}
            </p>
            {intelligence?.visual_strategy.why && (
              <p className="text-[11px] text-text3/80 italic leading-relaxed border-l border-border pl-2.5">
                {intelligence?.visual_strategy.why}
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── 4. How it was built, closed by default ─────────────────────── */}
      {hasCraft && (
        <details className="group">
          <summary className="text-[11.5px] text-text3 hover:text-text2 cursor-pointer list-none select-none flex items-center gap-1">
            <ChevronRight size={13} className="transition-transform group-open:rotate-90 shrink-0" />
            <span>Quyết định thiết kế</span>
          </summary>
          <div className="mt-3 p-3.5 bg-surface2/60 border border-borderStrong rounded-xl space-y-3.5">
            <ReasonBlock label="Bố cục" reason={intelligence?.composition_reasoning} />
            <ReasonBlock label="Chữ" reason={intelligence?.typography_reasoning} />
            <ReasonBlock label="Dàn trang" reason={intelligence?.layout_reasoning} />
          </div>
        </details>
      )}

      {/* ── 4. What else it looked at ──────────────────────────────────── */}
      {/* The director develops several routes and keeps one. These were being
          discarded before anything could see them. Closed by default: the AI
          has already chosen, and a beginner is never asked to re-decide. */}
      {otherConcepts.length > 0 && (
        <details className="group">
          <summary className="text-[11.5px] text-text3 hover:text-text2 cursor-pointer list-none select-none flex items-center gap-1">
            <ChevronRight size={13} className="transition-transform group-open:rotate-90 shrink-0" />
            <span>AI đã cân nhắc ({otherConcepts.length})</span>
          </summary>
          <div className="mt-3 space-y-2">
            {otherConcepts.map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                className="p-3 bg-surface2/40 border border-border rounded-xl space-y-1"
              >
                <p className="text-[12.5px] text-text2 font-medium leading-relaxed">{c.name}</p>
                <p className="text-[11px] text-text3 leading-relaxed">{c.reason}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ── 5. What it changed after looking ───────────────────────────── */}
      {/* The section that turns "the AI improved it" into an account a
          designer can check. Each row is a problem it saw and the change it
          made, with the actual values where they exist.

          Decisions it declined are shown too, dimmed. A system that only
          reports what it did looks more certain than it is, and "considered,
          not confident enough" is genuinely useful to a professional. */}
      {allDecisions.length > 0 && (
        <details className="group" open>
          <summary className="text-[11px] font-mono text-text3 uppercase tracking-wider cursor-pointer list-none select-none flex items-center gap-1.5">
            <ChevronRight size={13} className="transition-transform group-open:rotate-90 shrink-0" />
            <Sparkles size={12} className="text-aiGlow" />
            <span>AI đã điều chỉnh ({allDecisions.filter((d) => d.applied).length})</span>
          </summary>

          <div className="mt-3 space-y-2">
            {allDecisions.map((d: DesignDecision, i: number) => (
              <div
                key={`d-${i}`}
                className={`p-3 rounded-xl border space-y-1.5 ${
                  d.applied
                    ? "bg-surface2/60 border-borderStrong"
                    : "bg-surface2/25 border-border opacity-60"
                }`}
              >
                <div className="flex items-start gap-2">
                  {d.applied ? (
                    <CheckCircle2 size={12} className="text-aiGlow mt-[3px] shrink-0" />
                  ) : (
                    <AlertCircle size={12} className="text-text3 mt-[3px] shrink-0" />
                  )}
                  <div className="flex-1 space-y-1">
                    {/* Before → after, as one line a person can scan. */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                      <span className="text-text3 line-through decoration-text3/40">{d.problem}</span>
                      <ArrowRight size={11} className="text-aiGlow shrink-0" />
                      <span className="text-text font-medium">{d.decision}</span>
                    </div>
                    <p className="text-[11px] text-text3/85 italic leading-relaxed">{d.reason}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-[20px]">
                  <span className="text-[10px] font-mono text-text3 uppercase tracking-wider">
                    {d.role || d.zone}
                  </span>
                  {d.from !== undefined && d.to !== undefined && d.from !== d.to && (
                    <span className="text-[10px] font-mono text-aiGlow/80">
                      {d.from} → {d.to}
                    </span>
                  )}
                  {!d.applied && (
                    <span className="text-[10px] font-mono text-text3/70">chưa đủ chắc chắn</span>
                  )}
                </div>
              </div>
            ))}

            {/* What it deliberately did not touch. The protection is the
                point of the whole layer, so it is shown rather than assumed. */}
            {decisions?.protected_elements && decisions.protected_elements.length > 0 && (
              <p className="text-[10.5px] text-text3/70 leading-relaxed pt-0.5">
                Giữ nguyên: {decisions.protected_elements.join(", ")}.
              </p>
            )}
          </div>
        </details>
      )}

      {/* ── 6. What it thinks of the result ────────────────────────────── */}
      {/* Shown, not buried. A system that only reports success teaches nobody
          anything, and the critic's findings are the most actionable output it
          produces. */}
      {(feedback.length > 0 || suggestions.length > 0 || strengths.length > 0 || reviewUnverified) && (
        <Section
          icon={sawImage ? <Eye size={12} className="text-amber-400" /> : <AlertCircle size={12} className="text-amber-400" />}
          title="AI đánh giá kết quả"
        >
          <div className="p-3 bg-amber-500/[0.07] border border-amber-500/25 rounded-xl space-y-2.5">
            {/* Says which it is. "I looked at this" and "I expect this" are
                different claims, and a reader who cannot tell them apart will
                act on a guess as though it were a measurement. */}
            <p className="text-[10.5px] text-amber-200/70 font-mono uppercase tracking-wider">
              {reviewUnverified
                ? "Chưa kiểm tra được"
                : sawImage
                  ? "Đã xem ảnh vừa tạo"
                  : "Dựa trên kế hoạch, chưa xem ảnh"}
            </p>

            {/* No number, no tick. The check did not complete, and the only
                honest thing to report is that it did not complete. */}
            {reviewUnverified && (
              <p className="text-[12px] text-text2 leading-relaxed">
                Chưa kiểm tra được chất lượng chữ trên ảnh lần này. Ảnh vẫn dùng được, nhưng hệ
                thống không xác nhận được phần chữ — bạn nên tự xem lại.
              </p>
            )}
            {strengths.length > 0 && (
              <div className="space-y-1">
                {strengths.map((t, i) => (
                  <p key={`st-${i}`} className="text-[12px] text-emerald-300/90 leading-relaxed">
                    ✓ {t}
                  </p>
                ))}
              </div>
            )}

            {feedback.length > 0 && strengths.length > 0 && <div className="h-px bg-amber-500/20" />}

            {feedback.map((f, i) => (
              <p key={`f-${i}`} className="text-[12px] text-text2 leading-relaxed">
                {f}
              </p>
            ))}

            {suggestions.length > 0 && (
              <div className="space-y-1.5 pt-0.5">
                {feedback.length > 0 && <div className="h-px bg-amber-500/20" />}
                {suggestions.map((s, i) => (
                  <p key={`s-${i}`} className="text-[11.5px] text-text2/90 leading-relaxed">
                    → {s}
                  </p>
                ))}

                {onApplySuggestions && (
                  <button
                    type="button"
                    onClick={() => onApplySuggestions(suggestions)}
                    className="mt-1.5 w-full py-2 px-3 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold text-[12px] rounded-lg transition-all border border-amber-500/40 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Wand2 size={13} />
                    <span>Cải thiện theo góp ý</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Where the system stopped ───────────────────────────────────── */}
      {/* Absence made visible. The engine refuses to invent what nothing
          established, and the interface has to show that rather than imply
          everything was decided. */}
      {intelligence?.undecided && intelligence?.undecided.length > 0 && (
        <p className="text-[10.5px] text-text3/70 italic leading-relaxed">
          Chưa quyết định: {intelligence?.undecided.join(", ")}.
        </p>
      )}
    </div>
  );
}
