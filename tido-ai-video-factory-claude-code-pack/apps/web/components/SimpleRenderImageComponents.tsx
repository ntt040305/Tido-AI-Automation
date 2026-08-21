"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  Sparkles,
  Image as ImageIcon,
  AlertCircle,
  Download,
  RotateCcw,
} from "lucide-react";
import { Button } from "./UI";

export interface SimpleRenderResultState {
  status: "idle" | "loading" | "success" | "error";
  imageUrl?: string;
  generationId?: string;
  useCase?: string;
  aspectRatio?: string;
  errorCode?: string;
  errorMessage?: string;
}

// ── 1. SIMPLE MIXED REFERENCE UPLOAD COMPONENT ────────────────────
export function SimpleProductUpload({
  files,
  previews,
  onFilesAdd,
  onFileRemove,
  onClearAll,
  error,
  maxFiles = 10,
}: {
  files: File[];
  previews: string[];
  onFilesAdd: (newFiles: File[]) => void;
  onFileRemove: (index: number) => void;
  onClearAll: () => void;
  error?: string;
  maxFiles?: number;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      const allowedCount = maxFiles - files.length;
      if (allowedCount <= 0) return;
      onFilesAdd(selectedFiles.slice(0, allowedCount));
      e.target.value = "";
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      if (droppedFiles.length > 0) {
        const allowedCount = maxFiles - files.length;
        if (allowedCount <= 0) return;
        onFilesAdd(droppedFiles.slice(0, allowedCount));
      }
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  return (
    <div className="form-group">
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[13.5px] font-semibold text-text">
          Ảnh tham khảo / Sản phẩm
        </label>
        {files.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[12px] text-text3 hover:text-accent transition-colors outline-none cursor-pointer"
          >
            Xóa tất cả ({files.length})
          </button>
        )}
      </div>

      <p className="text-[12.5px] text-text2 mb-3 leading-relaxed">
        Tải lên ảnh sản phẩm, logo, hoặc hình ảnh tham khảo phong cách. Hệ thống sẽ tự động phân tích.
      </p>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Drag & Drop Box */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => {
          if (files.length < maxFiles) {
            fileInputRef.current?.click();
          }
        }}
        className={`relative border-2 border-dashed rounded-DEFAULT p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
          isDragOver
            ? "border-accent bg-accent/5"
            : error
            ? "border-accent/60 bg-surface2"
            : files.length >= maxFiles
            ? "border-borderStrong bg-surface2/40 cursor-not-allowed opacity-75"
            : "border-borderStrong hover:border-text2 bg-surface2/60 hover:bg-surface2"
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-surface3 flex items-center justify-center mb-2.5 text-text2">
          <Upload size={18} strokeWidth={1.8} />
        </div>
        <div className="text-[13.5px] font-medium text-text mb-1">
          {files.length >= maxFiles
            ? `Đã đạt giới hạn tối đa ${maxFiles} ảnh`
            : "Kéo thả ảnh vào đây"}
        </div>
        {files.length < maxFiles && (
          <div className="text-[12.5px] text-text2 mb-2.5">
            hoặc <span className="text-text font-medium underline underline-offset-2">chọn ảnh từ máy</span>
          </div>
        )}
        <span className="font-mono text-[11px] text-text3 uppercase tracking-wider">
          PNG, JPG, WEBP (Tối đa {maxFiles} ảnh)
        </span>
      </div>

      {/* Validation error */}
      {error && (
        <div className="flex items-center gap-1.5 text-[12px] text-accent mt-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Uploaded Thumbnails Grid */}
      {previews.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 mt-3.5">
          {previews.map((src, idx) => (
            <div
              key={idx}
              className="relative aspect-square bg-surface border border-borderStrong rounded-DEFAULT overflow-hidden group shadow-sm"
            >
              <img
                src={src}
                alt={`Reference ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileRemove(idx);
                  }}
                  className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center hover:scale-105 transition-transform cursor-pointer outline-none shadow-md"
                  title="Xóa ảnh"
                >
                  <X size={14} />
                </button>
              </div>
              <span className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-sm text-[9.5px] font-mono text-text px-1.5 py-0.5 rounded">
                #{idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 2. CONCEPT INPUT WITH CHARACTER COUNTER & WARNINGS ────────────
export function SimpleConceptInput({
  concept,
  onChange,
  error,
}: {
  concept: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  const charCount = concept.length;

  let warningMessage: string | null = null;
  let counterColor = "text-text3";
  let isOverLimit = false;

  if (charCount > 1000) {
    isOverLimit = true;
    warningMessage = `Concept vượt quá giới hạn 1000 ký tự (hiện tại: ${charCount} ký tự). Vui lòng rút gọn trước khi tạo ảnh.`;
    counterColor = "text-accent font-semibold";
  } else if (charCount > 800) {
    warningMessage = "Concept đang khá dài. Bạn có thể rút gọn để hệ thống tập trung tốt hơn.";
    counterColor = "text-amber-400 font-semibold";
  } else if (charCount > 600) {
    warningMessage = "Concept hơi dài. Hãy ưu tiên những yêu cầu quan trọng nhất.";
    counterColor = "text-amber-300 font-medium";
  }

  return (
    <div className="form-group">
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[13.5px] font-semibold text-text">
          Concept <span className="text-accent">*</span>
        </label>
        <span className={`text-[12px] font-mono ${counterColor}`}>
          {charCount} / 1000
        </span>
      </div>

      <textarea
        rows={4}
        value={concept}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Ví dụ: Poster mùa hè fantasy cho hai ly nước, hai sản phẩm bay giữa mây, title "HÈ BAY LÊN".'
        className={`w-full bg-surface2 border rounded-DEFAULT text-text placeholder:text-text3 text-[13.5px] px-3.5 py-2.5 focus:border-text2 outline-none transition-colors leading-relaxed ${
          isOverLimit || error
            ? "border-accent"
            : charCount > 600
            ? "border-amber-500/60"
            : "border-borderStrong"
        }`}
      />

      <p className="text-[12px] text-text2 mt-1.5">
        Mô tả phong cách, bối cảnh, tiêu đề chữ hoặc tên sản phẩm mong muốn. AI sẽ tự động phân tích và xử lý.
      </p>

      {/* Warning State */}
      {warningMessage && (
        <div
          className={`flex items-start gap-1.5 text-[12px] mt-2 p-2 rounded border ${
            isOverLimit
              ? "bg-accent/10 border-accent/30 text-accent font-medium"
              : charCount > 800
              ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
              : "bg-amber-500/5 border-amber-500/20 text-amber-300/90"
          }`}
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* Form Error */}
      {error && !isOverLimit && (
        <p className="text-[12px] text-accent mt-1.5 flex items-center gap-1">
          <AlertCircle size={13} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// ── 3. USE CASE SELECTOR ───────────────────────────────────────────
export const SIMPLE_USE_CASES = [
  "Poster",
  "Social Post",
  "Banner",
  "Menu",
  "E-commerce",
  "Thumbnail",
  "Khác",
];

export function SimpleUseCaseSelector({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="form-group">
      <label className="block text-[13.5px] font-semibold text-text mb-1.5">
        Mục đích sử dụng
      </label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface2 border border-borderStrong text-text rounded-DEFAULT text-[13.5px] px-3.5 py-2.5 focus:border-text2 outline-none cursor-pointer"
      >
        {SIMPLE_USE_CASES.map((uc) => (
          <option key={uc} value={uc}>
            {uc}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── 4. ASPECT RATIO VISUAL SELECTOR ───────────────────────────────
export function SimpleAspectRatioSelector({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (ratio: string) => void;
}) {
  const RATIOS = ["1:1", "3:4", "9:16"];

  return (
    <div className="form-group">
      <label className="block text-[13.5px] font-semibold text-text mb-2">
        Tỷ lệ ảnh
      </label>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {RATIOS.map((r) => {
          const isActive = selected === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              className={`py-2 px-3 rounded-pill border font-mono text-[12.5px] transition-all cursor-pointer outline-none text-center ${
                isActive
                  ? "bg-text text-bg border-text font-semibold shadow-sm"
                  : "bg-transparent text-text2 border-borderStrong hover:text-text hover:border-text2"
              }`}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 5. SIMPLE PREVIEW & RESULT COMPONENT ──────────────────────────
export function SimpleRenderPreview({
  aspectRatio,
  state,
  onReset,
  onRenderAgain,
}: {
  aspectRatio: string;
  state: SimpleRenderResultState;
  onReset?: () => void;
  onRenderAgain?: () => void;
}) {
  const getAspectRatioClass = (r: string) => {
    switch (r) {
      case "1:1":
        return "aspect-square max-w-[440px]";
      case "4:5":
        return "aspect-[4/5] max-w-[390px]";
      case "3:4":
        return "aspect-[3/4] max-w-[390px]";
      case "9:16":
        return "aspect-[9/16] max-w-[310px]";
      case "16:9":
        return "aspect-[16/9] max-w-[500px]";
      case "4:3":
        return "aspect-[4/3] max-w-[460px]";
      default:
        return "aspect-[4/5] max-w-[390px]";
    }
  };

  async function handleDownload(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!state.imageUrl) return;

    try {
      const downloadTargetUrl = state.generationId
        ? `/api/image/generated/${state.generationId}?download=1`
        : state.imageUrl;

      const res = await fetch(downloadTargetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `tido-${state.generationId || "render"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      console.error("[SIMPLE UI][DOWNLOAD ERROR]", err);
      const downloadTargetUrl = state.generationId
        ? `/api/image/generated/${state.generationId}?download=1`
        : state.imageUrl;
      const a = document.createElement("a");
      a.href = downloadTargetUrl;
      a.download = `tido-${state.generationId || "render"}.png`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  // Error message mapper
  function getFriendlyErrorMessage(code?: string, rawMsg?: string): string {
    switch (code) {
      case "VALIDATION_FAILED":
      case "INPUT_INVALID":
        return "Thông tin nhập chưa hợp lệ. Vui lòng kiểm tra lại concept và ảnh đã tải lên.";
      case "NO_PRODUCT_REFERENCE":
        return "Chưa xác định được sản phẩm trong hình ảnh đã tải lên. Vui lòng tải lên ảnh sản phẩm rõ ràng.";
      case "INTERPRETATION_FAILED":
        return "Hệ thống chưa phân tích được yêu cầu. Vui lòng kiểm tra concept và ảnh.";
      case "PROMPT_BUDGET_EXCEEDED":
        return "Yêu cầu hiện quá phức tạp. Hãy rút gọn concept một chút.";
      case "EXACT_COPY_FAILED":
        return "Không thể đảm bảo chính xác nội dung chữ trong concept. Vui lòng kiểm tra lại.";
      case "PROVIDER_TIMEOUT":
        return "Quá trình tạo ảnh mất quá nhiều thời gian. Bạn có thể thử tạo lại.";
      case "PROVIDER_UPSTREAM_ERROR":
        return "Dịch vụ tạo ảnh đang gặp sự cố. Vui lòng thử lại sau.";
      case "GENERATION_FAILED":
      default:
        return rawMsg || "Không thể tạo ảnh lúc này. Vui lòng thử lại sau.";
    }
  }

  return (
    <div className="bg-surface border border-border rounded-DEFAULT p-6 shadow-card h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-text">Kết quả render</h2>
            <span className="text-[11px] font-mono text-text3 bg-surface2 px-2 py-0.5 rounded border border-border">
              {aspectRatio}
            </span>
          </div>
          {state.status !== "idle" && (
            <button
              type="button"
              onClick={onReset}
              className="text-[12px] text-text3 hover:text-text flex items-center gap-1 transition-colors outline-none cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Đặt lại</span>
            </button>
          )}
        </div>

        {/* Dynamic Aspect-Ratio Preview Container */}
        <div className="flex items-center justify-center min-h-[380px] w-full py-4">
          <div
            className={`w-full ${getAspectRatioClass(
              aspectRatio
            )} bg-bg border border-borderStrong rounded-lg overflow-hidden flex flex-col items-center justify-center p-6 text-center transition-all duration-300 relative shadow-inner`}
          >
            {/* STATE: IDLE */}
            {state.status === "idle" && (
              <div className="flex flex-col items-center justify-center animate-[fade-in_0.2s_ease]">
                <div className="w-12 h-12 rounded-full bg-surface2 border border-borderStrong flex items-center justify-center text-text3 mb-3">
                  <ImageIcon size={22} strokeWidth={1.5} />
                </div>
                <div className="text-[14px] font-medium text-text mb-1">
                  Chưa có ảnh được tạo
                </div>
                <div className="text-[12.5px] text-text2 max-w-[240px] leading-relaxed">
                  Tải lên ảnh tham khảo, nhập concept và nhấn <strong className="text-text">TẠO ẢNH</strong>.
                </div>
              </div>
            )}

            {/* STATE: LOADING */}
            {state.status === "loading" && (
              <div className="flex flex-col items-center justify-center animate-[fade-in_0.2s_ease]">
                <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
                <div className="text-[14px] font-semibold text-text mb-1 flex items-center gap-1.5">
                  <span>Đang tạo hình ảnh...</span>
                  <Sparkles size={14} className="text-accent animate-pulse" />
                </div>
                <div className="text-[12.5px] text-text2 max-w-[240px] leading-relaxed mt-1">
                  Hệ thống đang phân tích yêu cầu và tổng hợp hình ảnh...
                </div>
              </div>
            )}

            {/* STATE: ERROR */}
            {state.status === "error" && (
              <div className="flex flex-col items-center justify-center p-4 animate-[fade-in_0.2s_ease]">
                <div className="w-11 h-11 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center mb-3">
                  <AlertCircle size={22} />
                </div>
                <div className="text-[14px] font-semibold text-text mb-1.5">
                  Không thể tạo ảnh
                </div>
                <div className="bg-surface2/80 border border-borderStrong rounded-DEFAULT p-3 text-[12.5px] text-text2 leading-relaxed text-center mb-4 w-full">
                  <p className="text-[12.5px] text-accent">
                    {getFriendlyErrorMessage(state.errorCode, state.errorMessage)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRenderAgain}
                  className="text-[13px] font-medium text-text hover:text-accent flex items-center gap-1.5 underline underline-offset-4 cursor-pointer outline-none"
                >
                  <RotateCcw size={14} />
                  <span>Tạo lại</span>
                </button>
              </div>
            )}

            {/* STATE: SUCCESS */}
            {state.status === "success" && state.imageUrl && (
              <div className="relative w-full h-full group">
                <img
                  src={state.imageUrl}
                  alt="Generated result"
                  className="w-full h-full object-cover rounded-md"
                  onError={() => {
                    console.error("[SIMPLE UI][IMAGE LOAD ERROR]", {
                      generationId: state.generationId,
                      imageUrl: state.imageUrl,
                    });
                  }}
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-4">
                  <Button size="sm" variant="primary" onClick={handleDownload}>
                    <Download size={14} />
                    <span>Tải xuống</span>
                  </Button>

                  {onRenderAgain && (
                    <button
                      type="button"
                      onClick={onRenderAgain}
                      className="inline-flex items-center gap-1.5 bg-surface/90 hover:bg-surface text-text border border-borderStrong px-3.5 py-1.5 rounded-pill text-[12.5px] font-medium transition-colors cursor-pointer outline-none"
                    >
                      <RotateCcw size={13} />
                      <span>Tạo lại</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer for Success state */}
      {state.status === "success" && (
        <div className="mt-4 pt-4 border-t border-border/80 flex items-center justify-between gap-3">
          <Button size="sm" variant="primary" onClick={handleDownload} className="flex-1 py-2.5">
            <Download size={15} />
            <span>Tải xuống</span>
          </Button>

          {onRenderAgain && (
            <Button size="sm" variant="ghost" onClick={onRenderAgain} className="flex-1 py-2.5">
              <RotateCcw size={15} />
              <span>Tạo lại</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
