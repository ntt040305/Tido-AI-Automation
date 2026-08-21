"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Download,
  RotateCcw,
  Minus,
  Layers,
  FileText,
} from "lucide-react";
import { Button, Chip } from "./UI";

export interface CopyItem {
  id: string;
  type: string;
  text: string;
}

export interface RenderResultState {
  status: "idle" | "loading" | "success" | "error" | "notice";
  imageUrl?: string;
  model?: string;
  message?: string;
  generationId?: string;
  durationMs?: number;
  costVnd?: number;
  balanceVnd?: number;
  errorDetails?: any;
}

// ── 1. PRODUCT REFERENCE UPLOAD COMPONENT ────────────────────────
export function ProductUpload({
  files,
  previews,
  onFilesAdd,
  onFileRemove,
  onClearAll,
  error,
}: {
  files: File[];
  previews: string[];
  onFilesAdd: (newFiles: File[]) => void;
  onFileRemove: (index: number) => void;
  onClearAll: () => void;
  error?: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      onFilesAdd(selectedFiles);
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
        onFilesAdd(droppedFiles);
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
        <label className="block text-[13px] font-medium text-text2">
          Ảnh sản phẩm <span className="text-accent">*</span>
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

      <p className="text-[12px] text-text3 mb-2.5">
        Một hoặc nhiều ảnh. Chỉ một ảnh sản phẩm vẫn được hỗ trợ.
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
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-DEFAULT p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragOver
            ? "border-accent bg-accent/5"
            : error
              ? "border-accent/60 bg-surface2"
              : "border-borderStrong hover:border-text2 bg-surface2/60 hover:bg-surface2"
          }`}
      >
        <div className="w-10 h-10 rounded-full bg-surface3 flex items-center justify-center mb-3 text-text2">
          <Upload size={18} strokeWidth={1.8} />
        </div>
        <div className="text-[13.5px] font-medium text-text mb-1">
          Kéo thả ảnh vào đây
        </div>
        <div className="text-[12.5px] text-text2 mb-3">
          hoặc <span className="text-text font-medium underline underline-offset-2">chọn ảnh từ máy</span>
        </div>
        <span className="font-mono text-[11px] text-text3 uppercase tracking-wider">
          PNG, JPG, WEBP
        </span>
      </div>

      {/* Validation error */}
      {error && (
        <div className="flex items-center gap-1.5 text-[12px] text-accent mt-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Uploaded Thumbnail List */}
      {previews.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 mt-3.5">
          {previews.map((src, idx) => (
            <div
              key={idx}
              className="relative aspect-square bg-surface border border-borderStrong rounded-DEFAULT overflow-hidden group shadow-sm"
            >
              <img
                src={src}
                alt={`Product ref ${idx + 1}`}
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

// ── 2. EXACT COPY BUILDER COMPONENT ─────────────────────────────
const COPY_TYPES = [
  "Headline",
  "Subheadline",
  "Tên sản phẩm",
  "Giá",
  "CTA",
  "Khác",
];

export function CopyBuilder({
  items,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
}: {
  items: CopyItem[];
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onUpdateItem: (id: string, field: "type" | "text", val: string) => void;
}) {
  return (
    <div className="form-group">
      <div className="flex items-center justify-between mb-1">
        <label className="block text-[13px] font-medium text-text2">
          Nội dung chữ
        </label>
        <span className="text-[12px] font-mono text-text3">
          {items.length} dòng
        </span>
      </div>
      <p className="text-[12px] text-text3 mb-3">
        Nội dung sẽ được yêu cầu giữ nguyên khi render.
      </p>

      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.id} className="flex gap-2 items-center">
            <select
              value={item.type}
              onChange={(e) => onUpdateItem(item.id, "type", e.target.value)}
              className="bg-surface2 border border-borderStrong text-text rounded-DEFAULT text-[12.5px] px-2.5 py-2 focus:border-text2 outline-none cursor-pointer w-[130px] shrink-0"
            >
              {COPY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={item.text}
              onChange={(e) => onUpdateItem(item.id, "text", e.target.value)}
              placeholder={`Nhập ${item.type.toLowerCase()}...`}
              className="bg-surface2 border border-borderStrong text-text placeholder:text-text3 rounded-DEFAULT text-[13.5px] px-3 py-2 flex-1 focus:border-text2 outline-none min-w-0"
            />

            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveItem(item.id)}
                className="w-8 h-8 rounded-DEFAULT flex items-center justify-center text-text3 hover:text-accent hover:bg-accent/10 transition-colors outline-none cursor-pointer shrink-0"
                title="Xóa dòng"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-text2 hover:text-text py-1 px-2 -ml-2 rounded hover:bg-surface2 transition-colors cursor-pointer outline-none"
        >
          <Plus size={14} />
          <span>Thêm nội dung</span>
        </button>
      </div>
    </div>
  );
}

// ── 3. ASPECT RATIO SELECTOR COMPONENT ──────────────────────────
export function AspectRatioSelector({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (ratio: string) => void;
}) {
  const RATIOS = ["1:1", "4:5", "9:16", "16:9"];

  return (
    <div className="form-group">
      <label className="block text-[13px] font-medium text-text2 mb-2">
        Tỷ lệ ảnh
      </label>
      <div className="flex gap-2">
        {RATIOS.map((r) => {
          const isActive = selected === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              className={`flex-1 py-2 px-3 rounded-pill border font-mono text-[12.5px] transition-all cursor-pointer outline-none text-center ${isActive
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

// ── 4. SYSTEM INFO TESTER PANEL (COLLAPSIBLE) ───────────────────
export function SystemInfoPanel({
  files = [],
  brief = "",
  brandName = "",
  brandInfo = "",
  productCount = 1,
  copyItems = [],
  hardRequirements = "",
  useCase = "",
}: {
  files?: File[];
  brief?: string;
  brandName?: string;
  brandInfo?: string;
  productCount?: number;
  copyItems?: CopyItem[];
  hardRequirements?: string;
  useCase?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [routerResult, setRouterResult] = useState<any | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Stage 3 Knowledge Retrieval State
  const [knowledgePackage, setKnowledgePackage] = useState<any | null>(null);
  const [isRetrievingKnowledge, setIsRetrievingKnowledge] = useState(false);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const [showRetrievalDetails, setShowRetrievalDetails] = useState(false);
  const [showRejectedKnowledge, setShowRejectedKnowledge] = useState(false);

  // Stage 4B Master Prompt Compiler State
  const [compiledPackage, setCompiledPackage] = useState<any | null>(null);
  const [isCompilingPrompt, setIsCompilingPrompt] = useState<boolean>(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [showPromptInspector, setShowPromptInspector] = useState<boolean>(false);

  // Stage 5 Provider Info State
  const [providerInfo, setProviderInfo] = useState<{
    provider: string;
    providerName: string;
    model: string;
    modelDisplayName: string;
    providerId?: string;
    engine?: string;
  } | null>(null);

  React.useEffect(() => {
    fetch("/api/image/provider")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data) setProviderInfo(data);
      })
      .catch(() => { });
  }, []);

  async function handleCompileMasterPrompt() {
    if (!routerResult?.routing || !knowledgePackage) {
      setCompileError("Vui lòng phân tích đầu vào & tìm Knowledge trước khi tạo Master Prompt.");
      return;
    }

    setCompileError(null);
    setIsCompilingPrompt(true);

    try {
      const validCopy = copyItems.map((c) => ({ text: c.text, type: c.type.toLowerCase() })).filter((c) => c.text.trim());
      const hardReqsList = hardRequirements ? hardRequirements.split("\n").map((r) => r.trim()).filter(Boolean) : [];
      const refList = files.map((_, idx) => `REF_${String(idx + 1).padStart(2, "0")}`);

      const bodyPayload = {
        productReferences: refList,
        brief,
        productCount,
        copyItems: validCopy,
        brandName,
        brandInfo,
        hardRequirements: hardReqsList,
        useCase,
        routingResult: routerResult.routing,
        knowledgePackage,
      };

      const res = await fetch("/api/image/prompt/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (data.success && data.package) {
        setCompiledPackage(data.package);
      } else {
        setCompileError(`[${data.error?.code || "COMPILE_ERROR"}] ${data.error?.message || "Lỗi khi biên dịch Master Prompt."}`);
      }
    } catch (err: any) {
      setCompileError(`Network Error: ${err.message || "Không thể kết nối API Prompt Compiler."}`);
    } finally {
      setIsCompilingPrompt(false);
    }
  }

  async function handleRetrieveKnowledge(targetRoutingInput?: any) {
    const targetRouting = targetRoutingInput || routerResult?.routing;
    if (!targetRouting) {
      setRetrievalError("Vui lòng phân tích đầu vào trước khi tìm Knowledge.");
      return;
    }

    setRetrievalError(null);
    setIsRetrievingKnowledge(true);

    try {
      const res = await fetch("/api/image/knowledge/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing: targetRouting }),
      });

      const data = await res.json();
      const pkg = data.knowledge || data.knowledgePackage;
      if (data.success && pkg) {
        setKnowledgePackage(pkg);
      } else {
        setRetrievalError(data.error?.message || "Lỗi khi tìm Knowledge.");
      }
    } catch (err: any) {
      setRetrievalError(`Network Error: ${err.message || "Không thể kết nối API Retrieval."}`);
    } finally {
      setIsRetrievingKnowledge(false);
    }
  }

  async function handleAnalyzeInput() {
    if (!files || files.length === 0) {
      setAnalysisError("Vui lòng tải lên ít nhất 1 ảnh sản phẩm để chạy Knowledge Router.");
      return;
    }

    setAnalysisError(null);
    setRetrievalError(null);
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("productImages", file);
      });

      if (brief) formData.append("brief", brief);
      if (brandName) formData.append("brandName", brandName);
      if (brandInfo) formData.append("brandInfo", brandInfo);
      if (productCount) formData.append("productCount", String(productCount));
      if (useCase) formData.append("useCase", useCase);
      if (hardRequirements) formData.append("hardRequirements", hardRequirements);

      const validCopy = copyItems.map((c) => `${c.type}: ${c.text}`).filter(Boolean);
      if (validCopy.length > 0) {
        formData.append("copyItems", JSON.stringify(validCopy));
      }

      const res = await fetch("/api/image/router/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setRouterResult(data);
      if (!data.success && data.error) {
        setAnalysisError(`[${data.error.code}] ${data.error.message}`);
      } else if (data.success && data.routing) {
        // Automatically run Stage 3 Knowledge Retrieval upon successful router analysis
        await handleRetrieveKnowledge(data.routing);
      }
    } catch (err: any) {
      setAnalysisError(`Network Error: ${err.message || "Không thể kết nối API Router."}`);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="border border-border/80 rounded-DEFAULT bg-surface2/30 overflow-hidden mt-6">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface2/60 transition-colors cursor-pointer outline-none"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown size={15} className="text-text3" />
          ) : (
            <ChevronRight size={15} className="text-text3" />
          )}
          <span className="text-[13px] font-medium text-text2">
            Thông tin hệ thống
          </span>
          <span className="text-[10px] font-mono uppercase bg-accent/15 text-accent border border-accent/30 px-1.5 py-0.5 rounded font-semibold">
            Tester
          </span>
        </div>
        <span className="text-[11.5px] text-text3 font-mono">
          {isOpen ? "Thu gọn" : "Chi tiết"}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 py-3.5 border-t border-border/60 space-y-4 bg-surface2/20">
          {/* Group 1: Knowledge Routing */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text">Knowledge Routing</span>
                {routerResult?.routing?.routing_mode && (
                  <span className="text-[10.5px] font-mono font-semibold px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                    {routerResult.routing.routing_mode}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleAnalyzeInput}
                disabled={isAnalyzing}
                className="text-[11.5px] font-medium bg-surface3 hover:bg-surface3/80 text-text px-2.5 py-1 rounded border border-borderStrong transition-colors cursor-pointer outline-none flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                    <span>Đang phân tích...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-accent" />
                    <span>Phân tích đầu vào</span>
                  </>
                )}
              </button>
            </div>

            {analysisError && (
              <div className="p-2.5 rounded bg-accent/10 border border-accent/30 text-[12px] text-accent flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}

            {!routerResult && !analysisError && (
              <div className="text-[12px] italic text-text3/70 bg-surface2/50 p-2.5 rounded border border-border/50 flex items-center justify-between">
                <span>Chưa có dữ liệu routing. Tải ảnh & nhấn "Phân tích đầu vào" để chạy Gemini 3.6 Flash.</span>
              </div>
            )}

            {routerResult?.success && routerResult.routing && (
              <div className="space-y-3 bg-surface p-3 rounded border border-borderStrong text-[12px]">
                {/* Meta info */}
                <div className="flex items-center justify-between text-[11px] font-mono text-text3 pb-2 border-b border-border/50">
                  <span>Model: {routerResult.meta?.model}</span>
                  <span>Duration: {routerResult.meta?.durationMs}ms</span>
                </div>

                {/* Summary */}
                <div className="text-text2 leading-relaxed">
                  <span className="font-medium text-text">Routing Summary: </span>
                  {routerResult.routing.routing_summary}
                </div>

                {/* Products Breakdown */}
                {routerResult.routing.products?.map((prod: any, idx: number) => (
                  <div key={prod.product_id || idx} className="pt-2 border-t border-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-accent text-[11.5px]">
                        [{prod.product_id}] Refs: {prod.reference_ids?.join(", ")}
                      </span>
                      <span className="text-[10.5px] font-mono text-text3">
                        Rel Conf: {Math.round((prod.reference_relationship_confidence || 1) * 100)}%
                      </span>
                    </div>

                    <p className="text-[11.5px] text-text2 italic">{prod.summary}</p>

                    {/* Classification Badges Grid */}
                    <div className="space-y-1.5 pt-1">
                      {/* Materials */}
                      {prod.materials?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10.5px] font-mono text-text3 shrink-0">Vật liệu:</span>
                          {prod.materials.map((m: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface2 border border-border text-[11px] text-text font-medium">
                              <span>{m.value}</span>
                              <span className="font-mono text-[9.5px] text-accent font-semibold">{Math.round(m.confidence * 100)}%</span>
                              <span className="font-mono text-[8.5px] text-text3">({m.evidence_type})</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Contents */}
                      {prod.contents?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10.5px] font-mono text-text3 shrink-0">Chất chứa:</span>
                          {prod.contents.map((c: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface2 border border-border text-[11px] text-text font-medium">
                              <span>{c.value}</span>
                              <span className="font-mono text-[9.5px] text-accent font-semibold">{Math.round(c.confidence * 100)}%</span>
                              <span className="font-mono text-[8.5px] text-text3">({c.evidence_type})</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Surface Properties */}
                      {prod.surface_properties?.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10.5px] font-mono text-text3 shrink-0">Bề mặt:</span>
                          {prod.surface_properties.map((p: any, i: number) => (
                            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface2 border border-border text-[11px] text-text font-medium">
                              <span>{p.value}</span>
                              <span className="font-mono text-[9.5px] text-accent font-semibold">{Math.round(p.confidence * 100)}%</span>
                              <span className="font-mono text-[8.5px] text-text3">({p.evidence_type})</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Visual Challenges */}
                    {prod.visual_challenges?.length > 0 && (
                      <div className="pt-1.5">
                        <div className="text-[11px] font-medium text-text mb-1">
                          Thách thức thị giác (Nhu cầu Knowledge):
                        </div>
                        <ul className="space-y-1 text-[11px] text-text2">
                          {prod.visual_challenges.map((vc: any, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 bg-surface2/40 p-1.5 rounded border border-border/40">
                              {vc.id && (
                                <span className="font-mono text-[9.5px] font-semibold text-accent bg-accent/10 px-1 py-0.5 rounded shrink-0">
                                  {vc.id}
                                </span>
                              )}
                              <div className="flex-1">
                                <span>{vc.description || vc.value}</span>
                                {typeof vc.confidence === "number" && (
                                  <span className="text-[10px] font-mono text-accent font-semibold ml-1.5">
                                    ({Math.round(vc.confidence * 100)}%)
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Unknowns */}
                    {prod.unknowns?.length > 0 && (
                      <div className="pt-1.5">
                        <div className="text-[11px] font-medium text-amber-400 mb-1">
                          Điểm chưa rõ / Cần kiểm chứng:
                        </div>
                        <div className="space-y-1">
                          {prod.unknowns.map((unk: any, i: number) => (
                            <div key={i} className="text-[11px] bg-amber-500/10 p-1.5 rounded border border-amber-500/20 text-text2 flex items-start justify-between gap-2">
                              <div>
                                <span className="font-semibold text-amber-200">
                                  {typeof unk === "string" ? unk : unk.subject}:{" "}
                                </span>
                                <span className="text-text3">
                                  {typeof unk === "string" ? "" : unk.reason}
                                </span>
                              </div>
                              {typeof unk === "object" && unk.importance && (
                                <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${unk.importance === "HIGH" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                    unk.importance === "MEDIUM" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                                      "bg-surface3 text-text3"
                                  }`}>
                                  {unk.importance}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Retrieval Queries Debug */}
                    {prod.retrieval_queries?.length > 0 && (
                      <div className="pt-1.5 border-t border-border/30">
                        <div className="flex items-center justify-between text-[10.5px] font-mono text-text3 mb-1">
                          <span>Retrieval Queries (Chưa tìm Knowledge - Stage 3)</span>
                          <span className="bg-surface2 px-1.5 py-0.5 rounded border border-border">{prod.retrieval_queries.length} queries</span>
                        </div>
                        <div className="space-y-1">
                          {prod.retrieval_queries.map((q: any, i: number) => (
                            <div key={i} className="font-mono text-[10px] bg-surface2/60 p-1.5 rounded border border-border/40 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-text font-medium">"{typeof q === "string" ? q : q.query}"</span>
                                {typeof q === "object" && q.importance && (
                                  <span className={`text-[8.5px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${q.importance === "PRIMARY" ? "bg-accent/20 text-accent border border-accent/40" : "bg-surface3 text-text3"
                                    }`}>
                                    {q.importance}
                                  </span>
                                )}
                              </div>
                              {typeof q === "object" && q.reason && (
                                <p className="text-text3 italic text-[9.5px]">Reason: {q.reason}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Collapsible Raw JSON */}
                <div className="pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="text-[11px] font-mono text-accent hover:underline cursor-pointer outline-none"
                  >
                    {showRawJson ? "Ẩn JSON Routing" : "Xem JSON Routing"}
                  </button>

                  {showRawJson && (
                    <pre className="mt-2 p-2.5 bg-black/80 text-emerald-400 font-mono text-[10px] rounded overflow-x-auto max-h-[260px] leading-relaxed border border-border">
                      {JSON.stringify(routerResult.routing, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Group 2: Selected Knowledge (Stage 3 Active) */}
          <div className="space-y-2.5 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text">Selected Knowledge</span>
                {knowledgePackage?.retrieval_mode && (
                  <span className="text-[10.5px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {knowledgePackage.retrieval_mode}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRetrieveKnowledge()}
                disabled={isRetrievingKnowledge || !routerResult?.routing}
                className="text-[11.5px] font-medium bg-surface3 hover:bg-surface3/80 text-text px-2.5 py-1 rounded border border-borderStrong transition-colors cursor-pointer outline-none flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRetrievingKnowledge ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                    <span>Đang tìm...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-emerald-400" />
                    <span>Tìm Knowledge</span>
                  </>
                )}
              </button>
            </div>

            {retrievalError && (
              <div className="p-2.5 rounded bg-accent/10 border border-accent/30 text-[12px] text-accent flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{retrievalError}</span>
              </div>
            )}

            {!knowledgePackage && !retrievalError && (
              <div className="text-[12px] italic text-text3/70 bg-surface2/50 p-2.5 rounded border border-border/50">
                Chưa có dữ liệu Knowledge. Chạy "Phân tích đầu vào" hoặc nhấn "Tìm Knowledge" để kích hoạt Smart Retrieval Engine.
              </div>
            )}

            {knowledgePackage && (
              <div className="space-y-3 bg-surface p-3 rounded border border-borderStrong text-[12px]">
                {/* Stats Header */}
                <div className="flex items-center justify-between text-[11px] font-mono text-text3 pb-2 border-b border-border/50">
                  <span>Selected: {knowledgePackage.stats?.selected_blocks} blocks ({knowledgePackage.stats?.estimated_tokens} tokens)</span>
                  <span>Duration: {knowledgePackage.stats?.duration_ms}ms</span>
                </div>

                {/* Warnings if any */}
                {knowledgePackage.warnings?.length > 0 && (
                  <div className="space-y-1">
                    {knowledgePackage.warnings.map((w: string, i: number) => (
                      <div key={i} className="text-[10.5px] font-mono bg-amber-500/10 text-amber-300 p-1.5 rounded border border-amber-500/30 flex items-center gap-1.5">
                        <AlertCircle size={12} className="shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Blocks List */}
                <div className="space-y-2">
                  {[...(knowledgePackage.universal_blocks || []), ...(knowledgePackage.selected_blocks || [])].map((block: any) => {
                    if (!block) return null;
                    return (
                      <div key={block.id || block.title} className="p-2.5 rounded bg-surface2/60 border border-border/60 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded ${block.selection_tier === "UNIVERSAL" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" :
                                block.selection_tier === "PRIMARY" ? "bg-accent/20 text-accent border border-accent/40" :
                                  block.selection_tier === "DEPENDENCY" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                                    "bg-surface3 text-text3 border border-border"
                              }`}>
                              {block.selection_tier}
                            </span>
                            <span className="font-semibold text-text text-[12px]">{block.title}</span>
                            <span className="font-mono text-[10px] text-text3">({block.id})</span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-emerald-400">
                            {Math.round((block.final_score || 0) * 100)}%
                          </span>
                        </div>

                        {/* Selection Reasons */}
                        {block.selection_reasons?.length > 0 && (
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-text2 pl-1">
                            {block.selection_reasons.map((reason: string, rIdx: number) => (
                              <li key={rIdx}>{reason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Collapsible Score Details */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShowRetrievalDetails(!showRetrievalDetails)}
                    className="font-mono text-emerald-400 hover:underline cursor-pointer outline-none"
                  >
                    {showRetrievalDetails ? "Ẩn chi tiết Score" : "Chi tiết Retrieval"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRejectedKnowledge(!showRejectedKnowledge)}
                    className="font-mono text-text3 hover:underline cursor-pointer outline-none"
                  >
                    {showRejectedKnowledge ? "Ẩn đã bỏ qua" : `Knowledge đã bỏ qua (${knowledgePackage.rejected_candidates?.length || 0})`}
                  </button>
                </div>

                {/* Score Breakdown Panel */}
                {showRetrievalDetails && (
                  <div className="mt-2 p-2.5 bg-black/60 font-mono text-[10px] rounded border border-border/60 space-y-2">
                    {[...(knowledgePackage.universal_blocks || []), ...(knowledgePackage.selected_blocks || [])].map((b: any) => {
                      if (!b) return null;
                      return (
                        <div key={b.id || b.title} className="space-y-0.5 pb-1 border-b border-border/30 last:border-0">
                          <div className="font-semibold text-emerald-300">{b.id} — Final: {b.final_score}</div>
                          <div className="grid grid-cols-2 gap-x-2 text-text3">
                            <span>Metadata: {b.scores?.metadata}</span>
                            <span>Semantic: {b.scores?.semantic}</span>
                            <span>Confidence: {b.scores?.signal_confidence}</span>
                            <span>Info Value: {b.scores?.information_value}</span>
                            <span>Priority: {b.scores?.priority}</span>
                            <span>Query Imp: {b.scores?.query_importance}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Rejected Candidates Audit Panel */}
                {showRejectedKnowledge && knowledgePackage.rejected_candidates?.length > 0 && (
                  <div className="mt-2 p-2.5 bg-black/60 text-[10.5px] rounded border border-border/60 space-y-1.5">
                    {knowledgePackage.rejected_candidates.map((rej: any, idx: number) => (
                      <div key={idx} className="flex items-start justify-between gap-2 border-b border-border/30 pb-1 last:border-0">
                        <div>
                          <span className="font-mono font-semibold text-text">{rej.id}: </span>
                          <span className="text-text3">{rej.reason}</span>
                        </div>
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface3 text-amber-300 shrink-0">
                          {rej.reason_code}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Group 3: Master Prompt V2 (Stage 4B Active) */}
          <div className="space-y-2.5 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text">Master Prompt V2</span>
                {compiledPackage?.template?.version && (
                  <span className="text-[10.5px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    v{compiledPackage.template.version}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleCompileMasterPrompt}
                disabled={isCompilingPrompt || !routerResult?.routing || !knowledgePackage}
                className="text-[11.5px] font-medium bg-surface3 hover:bg-surface3/80 text-text px-2.5 py-1 rounded border border-borderStrong transition-colors cursor-pointer outline-none flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCompilingPrompt ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                    <span>Đang tạo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-purple-400" />
                    <span>Tạo Master Prompt</span>
                  </>
                )}
              </button>
            </div>

            {compileError && (
              <div className="p-2.5 rounded bg-accent/10 border border-accent/30 text-[12px] text-accent flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{compileError}</span>
              </div>
            )}

            {!compiledPackage && !compileError && (
              <div className="text-[12px] italic text-text3/70 bg-surface2/50 p-2.5 rounded border border-border/50">
                Chưa có Master Prompt. Nhấn "Tạo Master Prompt" để tổng hợp tri thức & ràng buộc thành prompt hoàn chỉnh.
              </div>
            )}

            {compiledPackage && (
              <div className="space-y-3 bg-surface p-3 rounded border border-borderStrong text-[12px]">
                {/* Stats Header */}
                <div className="flex items-center justify-between text-[11px] font-mono text-text3 pb-2 border-b border-border/50">
                  <span>Tokens: {compiledPackage.stats?.estimated_prompt_tokens} tokens ({compiledPackage.stats?.prompt_characters} chars)</span>
                  <span>Hash: {compiledPackage.template?.hash}</span>
                </div>

                {/* Warnings if any */}
                {compiledPackage.compiler_warnings?.length > 0 && (
                  <div className="space-y-1">
                    {compiledPackage.compiler_warnings.map((w: string, i: number) => (
                      <div key={i} className="text-[10.5px] font-mono bg-amber-500/10 text-amber-300 p-1.5 rounded border border-amber-500/30 flex items-center gap-1.5">
                        <AlertCircle size={12} className="shrink-0" />
                        <span>[WARNING] {w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary Counters */}
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono">
                  <div className="bg-surface2/60 p-1.5 rounded border border-border/50">
                    <div className="text-text3 text-[9.5px]">Universal Core</div>
                    <div className="font-semibold text-purple-300">{compiledPackage.knowledge?.universal_block_ids?.length || 0} blocks</div>
                  </div>
                  <div className="bg-surface2/60 p-1.5 rounded border border-border/50">
                    <div className="text-text3 text-[9.5px]">Specialist</div>
                    <div className="font-semibold text-emerald-400">{compiledPackage.knowledge?.specialist_block_ids?.length || 0} blocks</div>
                  </div>
                  <div className="bg-surface2/60 p-1.5 rounded border border-border/50">
                    <div className="text-text3 text-[9.5px]">Exact Copy</div>
                    <div className="font-semibold text-accent">{copyItems.filter(c => c.text.trim()).length} items</div>
                  </div>
                </div>

                {/* Collapsible Inspector Toggle */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShowPromptInspector(!showPromptInspector)}
                    className="font-mono text-purple-400 hover:underline cursor-pointer outline-none flex items-center gap-1"
                  >
                    <FileText size={13} />
                    <span>{showPromptInspector ? "Ẩn Master Prompt" : "Xem Master Prompt"}</span>
                  </button>
                </div>

                {/* Prompt Inspector Drawer */}
                {showPromptInspector && (
                  <div className="mt-2 p-3 bg-black/90 text-slate-200 font-mono text-[11px] rounded border border-purple-500/40 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-text3 pb-1 border-b border-border/40">
                      <span>COMPILED MASTER PROMPT (V2.0.0)</span>
                      <span>Duration: {compiledPackage.stats?.compile_duration_ms}ms</span>
                    </div>
                    <pre className="p-2.5 bg-black/60 text-slate-100 text-[10.5px] rounded overflow-x-auto max-h-[380px] leading-relaxed whitespace-pre-wrap font-sans border border-border/40">
                      {compiledPackage.compiled_prompt}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Group 4: Image Generation (Stage 5 Active) */}
          <div className="space-y-2.5 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text">Image Generation</span>
                <span className="text-[10.5px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {providerInfo?.providerId || providerInfo?.model || "flow-nano-banana-2"}
                </span>
              </div>
              <span className="text-[11px] font-mono text-text3">{providerInfo?.engine || providerInfo?.modelDisplayName || "Flow · Nano Banana 2"}</span>
            </div>

            <div className="space-y-2 bg-surface p-3 rounded border border-borderStrong text-[12px]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono text-text2">
                <div className="flex justify-between">
                  <span className="text-text3">Provider:</span>
                  <span className="font-semibold text-text">{providerInfo?.providerName || "ImgStudio"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text3">Engine:</span>
                  <span className="font-semibold text-text">{providerInfo?.engine || "Flow · Nano Banana 2"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text3">Provider ID:</span>
                  <span className="font-semibold text-text">{providerInfo?.providerId || providerInfo?.model || "flow-nano-banana-2"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text3">Prompt Status:</span>
                  {compiledPackage ? (
                    <span className="font-semibold text-emerald-400">Current</span>
                  ) : (
                    <span className="font-semibold text-amber-300">Uncompiled</span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-text3">References:</span>
                  <span className="font-semibold text-text">{files.length} images</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text3">Output:</span>
                  <span className="font-semibold text-text">1K · standard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. RIGHT PANEL OUTPUT PREVIEW COMPONENT ──────────────────────
export function RenderPreview({
  aspectRatio,
  state,
  onReset,
}: {
  aspectRatio: string;
  state: RenderResultState;
  onReset?: () => void;
}) {
  // Map aspect ratio to tailwind ratio or style
  const getAspectRatioClass = (r: string) => {
    switch (r) {
      case "1:1":
        return "aspect-square max-w-[440px]";
      case "4:5":
        return "aspect-[4/5] max-w-[390px]";
      case "9:16":
        return "aspect-[9/16] max-w-[310px]";
      case "16:9":
        return "aspect-[16/9] max-w-[500px]";
      default:
        return "aspect-[4/5] max-w-[390px]";
    }
  };

  function handleDownload() {
    if (!state.imageUrl) return;
    const a = document.createElement("a");
    a.href = state.imageUrl;
    a.download = `rendered_${state.generationId || "image"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="bg-surface border border-border rounded-DEFAULT p-6 shadow-card h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold text-text">Kết quả</h2>
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

        {/* Dynamic Aspect-Ratio Aware Preview Box */}
        <div className="flex items-center justify-center min-h-[380px] w-full py-4">
          <div
            className={`w-full ${getAspectRatioClass(
              aspectRatio
            )} bg-bg border border-borderStrong rounded-lg overflow-hidden flex flex-col items-center justify-center p-6 text-center transition-all duration-300 relative shadow-inner`}
          >
            {/* STATE: IDLE (EMPTY) */}
            {state.status === "idle" && (
              <div className="flex flex-col items-center justify-center animate-[fade-in_0.2s_ease]">
                <div className="w-12 h-12 rounded-full bg-surface2 border border-borderStrong flex items-center justify-center text-text3 mb-3">
                  <ImageIcon size={22} strokeWidth={1.5} />
                </div>
                <div className="text-[14px] font-medium text-text mb-1">
                  Chưa có ảnh được render
                </div>
                <div className="text-[12.5px] text-text2 max-w-[240px] leading-relaxed">
                  Tải ảnh sản phẩm và nhập concept để bắt đầu.
                </div>
              </div>
            )}

            {/* STATE: LOADING */}
            {state.status === "loading" && (
              <div className="flex flex-col items-center justify-center animate-[fade-in_0.2s_ease]">
                <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
                <div className="text-[14px] font-medium text-text mb-1 flex items-center gap-1.5">
                  <span>Đang tạo ảnh với Nano Banana 2...</span>
                  <Sparkles size={14} className="text-accent animate-pulse" />
                </div>
                <div className="text-[12px] text-text2 max-w-[220px] leading-relaxed">
                  Tổng hợp thông tin tri thức & tạo visual thương hiệu...
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
                  Render Thất Bại
                </div>
                <div className="bg-surface2/80 border border-borderStrong rounded-DEFAULT p-3 text-[12.5px] text-text2 leading-relaxed text-left mb-3 w-full space-y-1">
                  <p className="text-[12px] font-mono text-accent">
                    {state.message || "Đã xảy ra lỗi trong quá trình tạo ảnh."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onReset}
                  className="text-[12px] text-text2 hover:text-text underline cursor-pointer outline-none"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* STATE: NOTICE */}
            {state.status === "notice" && (
              <div className="flex flex-col items-center justify-center p-4 animate-[fade-in_0.2s_ease]">
                <div className="w-11 h-11 rounded-full bg-accent/15 border border-accent/30 text-accent flex items-center justify-center mb-3">
                  <Sparkles size={20} />
                </div>
                <div className="text-[14px] font-semibold text-text mb-1.5">
                  Thông tin đã hợp lệ!
                </div>
                <div className="bg-surface2/80 border border-borderStrong rounded-DEFAULT p-3 text-[12.5px] text-text2 leading-relaxed text-left mb-3 w-full">
                  <div className="font-medium text-text mb-1 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-ok shrink-0" />
                    <span>{state.message}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onReset}
                  className="text-[12px] text-text2 hover:text-text underline cursor-pointer outline-none"
                >
                  Thử lại với brief khác
                </button>
              </div>
            )}

            {/* STATE: SUCCESS */}
            {state.status === "success" && state.imageUrl && (
              <div className="relative w-full h-full group">
                <img
                  src={state.imageUrl}
                  alt="Generated visual"
                  className="w-full h-full object-cover rounded-md"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-3">
                  <Button size="sm" variant="primary" onClick={handleDownload}>
                    <Download size={14} />
                    <span>Tải xuống</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result Metadata Architecture */}
      <div className="mt-4 pt-4 border-t border-border/80 flex items-center justify-between text-[12px] text-text3 font-mono flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Model: {state.model || "flow-nano-banana-2"}</span>
        </div>
        <div className="flex items-center gap-3">
          {state.costVnd !== undefined && (
            <span className="text-emerald-400 font-semibold">Cost: {state.costVnd.toLocaleString("vi-VN")}đ</span>
          )}
          {state.balanceVnd !== undefined && (
            <span className="text-text2">Balance: {state.balanceVnd.toLocaleString("vi-VN")}đ</span>
          )}
          {state.durationMs ? (
            <span>Time: {state.durationMs}ms</span>
          ) : (
            <span>Target: Commercial Visual</span>
          )}
        </div>
      </div>
    </div>
  );
}
