"use client";

import React, { useRef } from "react";
import { Upload, X, AlertTriangle, Sparkles } from "lucide-react";
import { VmcButton } from "@/components/vmc";
import { AssetType, ASSET_TYPES, BRIEF_FIELDS, SAMPLE_BRIEF } from "./types";

export interface CampaignBriefPanelProps {
  form: typeof SAMPLE_BRIEF;
  setForm: React.Dispatch<React.SetStateAction<typeof SAMPLE_BRIEF>>;
  assetTypes: AssetType[];
  setAssetTypes: React.Dispatch<React.SetStateAction<AssetType[]>>;
  files: File[];
  previews: string[];
  addFiles: (list: FileList | null) => void;
  removeFiles: () => void;
  loading: boolean;
  elapsed: number | null;
  onGenerate: () => void;
}

export function CampaignBriefPanel({
  form,
  setForm,
  assetTypes,
  setAssetTypes,
  files,
  previews,
  addFiles,
  removeFiles,
  loading,
  elapsed,
  onGenerate,
}: CampaignBriefPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const inputCls =
    "w-full bg-surface2 border border-border rounded-[2px] px-3 py-2 text-[13px] font-sans text-text placeholder:text-text-telemetry focus:outline-none focus:border-borderStrong transition-colors";

  return (
    <aside className="bg-surface border border-border rounded-[2px] p-5 shadow-card select-none space-y-4">
      {/* Panel Top Title */}
      <div className="pb-3 border-b border-border">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-telemetry font-semibold">
          INPUT PARAMETERS
        </span>
        <h2 className="text-[16px] font-bold text-text tracking-tight font-sans mt-0.5">
          Brief Sáng Tạo
        </h2>
        <p className="text-[11.5px] text-text-muted mt-0.5 font-sans">
          Ô nào bỏ trống sẽ được giữ trống — hệ thống không tự bịa thêm thông tin.
        </p>
      </div>

      <div className="space-y-3">
        {BRIEF_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="block text-[10.5px] font-mono uppercase tracking-wider text-text-telemetry">
              {f.label}
            </label>
            {f.textarea ? (
              <textarea
                rows={4}
                className={`${inputCls} resize-none leading-relaxed`}
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder="Nhập yêu cầu sáng tạo cụ thể..."
              />
            ) : (
              <input
                className={inputCls}
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder={`Nhập ${f.label.toLowerCase()}...`}
              />
            )}
            {f.hint && (
              <span className="block text-[10px] text-text-telemetry font-sans leading-tight">
                {f.hint}
              </span>
            )}
          </div>
        ))}

        {/* Reference upload */}
        <div className="space-y-1.5 pt-1">
          <span className="block text-[10.5px] font-mono uppercase tracking-wider text-text-telemetry">
            ẢNH SẢN PHẨM &amp; THAM CHIẾU
          </span>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-border hover:border-borderStrong rounded-[2px] py-3 px-3 text-[12px] font-sans text-text-muted hover:text-text bg-surface2/60 transition-colors flex items-center justify-center gap-2 cursor-pointer outline-none"
          >
            <Upload size={14} />
            <span>
              {files.length
                ? `${files.length} ảnh tham chiếu — tải thêm ảnh`
                : "Ảnh sản phẩm, logo hoặc ảnh tham chiếu phong cách"}
            </span>
          </button>

          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 items-center">
              {previews.map((src, i) => (
                <div key={i} className="relative w-11 h-11 rounded-[2px] border border-border overflow-hidden group">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              <button
                type="button"
                onClick={removeFiles}
                className="text-[11px] font-mono text-tally-live hover:underline cursor-pointer ml-1"
              >
                Xoá hết
              </button>
            </div>
          )}

          {files.length === 0 && (
            <div className="flex items-start gap-1.5 text-[11px] text-tally-warning font-sans leading-snug pt-0.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Không có ảnh sản phẩm, bản render sẽ không được khoá nhận diện theo sản phẩm thật của bạn.
              </span>
            </div>
          )}
        </div>

        {/* Asset selection */}
        <div className="space-y-1.5 pt-1">
          <span className="block text-[10.5px] font-mono uppercase tracking-wider text-text-telemetry">
            ẤN PHẨM CẦN SẢN XUẤT
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ASSET_TYPES.map((a) => {
              const on = assetTypes.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setAssetTypes((p) =>
                      on ? p.filter((x) => x !== a.id) : [...p, a.id]
                    )
                  }
                  className={`px-2.5 py-1 rounded-[2px] text-[11.5px] border font-sans transition-colors cursor-pointer outline-none ${
                    on
                      ? "border-borderStrong text-text bg-surface3 font-semibold"
                      : "border-border text-text-muted hover:text-text hover:border-borderStrong bg-surface2"
                  }`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA Button */}
        <div className="pt-2">
          <VmcButton
            type="button"
            variant="primary"
            size="lg"
            isLoading={loading}
            disabled={loading || !form.brand.trim() || !form.product.trim() || assetTypes.length === 0}
            onClick={onGenerate}
            className="w-full"
            icon={<Sparkles size={16} />}
          >
            {loading ? "Đang dựng chiến dịch…" : "Tạo chiến dịch"}
          </VmcButton>

          {elapsed !== null && (
            <p className="text-[10.5px] font-mono text-text-telemetry text-center pt-2">
              {(elapsed / 1000).toFixed(1)}s · chỉ lập kế hoạch, chưa render
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
