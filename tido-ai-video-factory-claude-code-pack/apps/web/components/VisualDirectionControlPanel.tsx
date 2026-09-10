"use client";

import { useMemo, useState } from "react";
import { VisualDirectionPlanner, SOURCE_LABELS } from "../lib/image-engine/director/VisualDirectionPlanner";
import {
  AUTO,
  AUTO_HELP,
  ControlKey,
  VISUAL_CONTROLS,
  VisualDirectionControls,
} from "../lib/image-engine/director/visual-controls.types";

/**
 * CIOS Phase 4.1.5 (revised) — the Creative Director's recommendation, shown last.
 *
 * What changed and why
 * -------------------
 * The first version put six empty dropdowns near the top of the form, before the
 * user had finished describing what they wanted. That asks a person to make six
 * craft decisions as a precondition for using the product, which is backwards:
 * most users cannot answer "what lens?" and should never be asked.
 *
 * This version sits at the end, after assets, concept and format are in, and
 * arrives already filled in. The AI has read the brief and proposes a plan; the
 * panel shows what it intends to do, labelled with where each decision came
 * from; the user changes anything they disagree with. Nothing is required of
 * them.
 *
 * Why the plan is computed here rather than fetched
 * ------------------------------------------------
 * `VisualDirectionPlanner` is deterministic on (concept, format), so the browser
 * and the server derive the same plan from the same inputs without a round trip
 * and without the suggestions travelling in the request. Only genuine overrides
 * are stored. The consequence that matters: what the user reads here is what the
 * renderer is told — a panel that displayed one plan while the server used
 * another would be worse than showing nothing, because it would look like it
 * worked.
 */

const SOURCE_STYLE: Record<string, string> = {
  user_selected: "text-accent border-accent/40 bg-accent/10",
  concept_detected: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  ai_suggested: "text-text3 border-borderStrong bg-surface2/60",
  default: "text-text3 border-borderStrong bg-surface2/40",
};

export function VisualDirectionControlPanel({
  value,
  onChange,
  concept,
  assetType,
}: {
  value: VisualDirectionControls;
  onChange: (next: VisualDirectionControls) => void;
  /** The concept the user typed. Drives the suggestions. */
  concept?: string;
  /** The output format the user chose. Drives camera and composition. */
  assetType?: string;
}) {
  const [open, setOpen] = useState(false);

  // Recomputed whenever the brief changes, so the plan always reflects what the
  // user has actually entered rather than what they had entered when the panel
  // first rendered.
  const plan = useMemo(
    () => VisualDirectionPlanner.plan({ concept, assetType }),
    [concept, assetType]
  );

  const setControl = (key: ControlKey, option: string) => {
    const next = { ...value };
    if (option === AUTO) next[key] = AUTO;
    else next[key] = option;
    onChange(next);
  };

  const useSuggestion = (key: ControlKey) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  const overrides = VISUAL_CONTROLS.filter((c) => value[c.key]).length;

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-surface2/60 border border-borderStrong rounded-xl px-4 py-3 cursor-pointer outline-none hover:border-text2 transition-colors"
      >
        <span className="text-[13.5px] font-semibold text-text flex items-center gap-2">
          <span>Hướng dẫn hình ảnh</span>
          <span className="text-text3 font-normal">(Tuỳ chỉnh)</span>
          {overrides > 0 && (
            <span className="font-mono text-[11px] text-accent">{overrides} đã chỉnh</span>
          )}
        </span>
        <span className="text-text3 text-[12px] font-mono">{open ? "Thu gọn" : "Xem & chỉnh"}</span>
      </button>

      {!open && (
        <p className="text-[11.5px] text-text3 leading-relaxed px-1">
          AI đã lên phương án hình ảnh cho bạn. Mở ra để xem hoặc chỉnh sửa — không bắt buộc.
        </p>
      )}

      {open && (
        <div className="space-y-3.5 border border-borderStrong rounded-xl p-4 bg-surface2/30">
          <p className="text-[11.5px] text-text3 leading-relaxed">
            Đây là phương án AI đề xuất dựa trên concept và định dạng bạn đã nhập. Bạn có thể giữ
            nguyên hoặc đổi bất kỳ mục nào. {AUTO_HELP}
          </p>

          {VISUAL_CONTROLS.map((control) => {
            const suggested = plan[control.key];
            const override = value[control.key];

            // What the control currently resolves to, and why. The badge is the
            // transparency requirement: a user should never wonder whether a
            // value came from them, from their words, or from the machine.
            const isAuto = override === AUTO;
            const current = isAuto ? AUTO : override || suggested?.option || AUTO;
            const source = isAuto
              ? "default"
              : override
                ? "user_selected"
                : suggested?.source || "default";
            const sourceLabel = SOURCE_LABELS[source] || "Tự chọn";
            const optionLabel =
              current === AUTO
                ? "Tự chọn — AI quyết định khi tạo ảnh"
                : control.options.find((o) => o.id === current)?.label || "Tự chọn";

            return (
              <div key={control.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[12.5px] font-semibold text-text flex items-center gap-1.5">
                    <span aria-hidden>{control.icon}</span>
                    <span>{control.label}</span>
                  </label>
                  <span
                    className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full border ${
                      SOURCE_STYLE[source] || SOURCE_STYLE.default
                    }`}
                  >
                    {sourceLabel}
                  </span>
                </div>

                <p className="text-[11px] text-text2">{optionLabel}</p>

                <select
                  value={current}
                  onChange={(e) => setControl(control.key, e.target.value)}
                  className="w-full bg-surface2 border border-borderStrong text-text rounded-lg text-[13px] px-3 py-2 focus:border-text2 outline-none cursor-pointer"
                >
                  <option value={AUTO}>Tự chọn — để AI quyết định</option>
                  {control.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {suggested?.option === option.id ? "  ·  AI đề xuất" : ""}
                    </option>
                  ))}
                </select>

                {override && suggested && override !== suggested.option && (
                  <button
                    type="button"
                    onClick={() => useSuggestion(control.key)}
                    className="text-[11px] text-text3 hover:text-text underline cursor-pointer outline-none"
                  >
                    Dùng lại đề xuất của AI ({suggested.label})
                  </button>
                )}
              </div>
            );
          })}

          {overrides > 0 && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="text-[11.5px] text-text3 hover:text-text underline cursor-pointer outline-none"
            >
              Đặt lại tất cả về đề xuất của AI
            </button>
          )}
        </div>
      )}
    </div>
  );
}
