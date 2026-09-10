"use client";

/**
 * Campaign Studio — the creative-director workspace for the Picture engine.
 *
 * The order of this page is the argument it makes. A brief produces an IDEA
 * first, then a visual direction, and only then a set of assets. Asset type,
 * aspect ratio and rendering are consequences of that thinking, not the starting
 * point — which is exactly how the older /render-image page works and why it
 * behaves like an image generator rather than a studio.
 *
 * Every decision on this page is shown with its provenance: where it came from,
 * how confident the system is, and whether the client locked it. That is what
 * makes it reviewable by a person who has to defend the work to a client.
 *
 * UI copy is Vietnamese; identifiers, API fields, asset-type keys and every
 * value returned by the pipeline stay untouched. Format names (Poster, Banner,
 * Social Ad, Product Hero, Thumbnail) are kept as-is because that is what
 * Vietnamese agencies call them in practice.
 *
 * Backend untouched — this reads /api/campaign/generate and /api/campaign/render-asset.
 */

import React, { useMemo, useRef, useState } from "react";
import { downloadExportMetadata, downloadRenderedAsset } from "./download-asset";

type AssetType = "poster" | "banner" | "social_ad" | "product_hero" | "thumbnail";

const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: "poster", label: "Poster" },
  { id: "banner", label: "Banner" },
  { id: "social_ad", label: "Social Ad" },
  { id: "product_hero", label: "Product Hero" },
  { id: "thumbnail", label: "Thumbnail" },
];

interface ArtDecision {
  dimension: string;
  value: string;
  source: string;
  confidence: number;
  specificity: string;
  score: number;
  client_locked: boolean;
  qualifiers?: string[];
}

interface Asset {
  asset_type: AssetType;
  use_case: string;
  aspect_ratio: string;
  asset_goal: string;
  layout_logic: {
    eye_flow: string;
    negative_space_strategy: string;
    safe_margin_percent: number;
    zones: { role: string; x: number; y: number; width: number; height: number }[];
  };
  visual_priority: { element: string; importance: number; role: string }[];
  prompt_plan: {
    campaign_dna_applied: string[];
    asset_adaptations: string[];
    art_direction_sources: Record<string, string>;
    art_direction_decisions: ArtDecision[];
    knowledge_blocks: string[];
    client_locked_dimensions: string[];
  };
  final_prompt?: string;
  prompt_chars: number;
  warnings: string[];
  error?: { code: string; message: string };
}

interface CampaignResponse {
  success: boolean;
  campaign?: any;
  strategy?: any;
  assets?: Asset[];
  delivery?: { package_root: string; file_count: number };
  diagnostics?: any;
  error?: { code: string; message: string };
}

/** Sample brief, so the workspace opens in a working state rather than empty. */
const SAMPLE = {
  brand: "Skin1004",
  product: "Tone Brightening Capsule Ampoule",
  industry: "beauty_skincare",
  audience: "Phụ nữ 25-40 tuổi",
  objective: "Ra mắt dòng skincare cao cấp",
  channel: "instagram",
  tone: "Skincare Hàn Quốc cao cấp",
  concept:
    "Chai ampoule làm chủ thể trên nền sạch, ánh sáng chếch dịu, cảm giác skincare Hàn Quốc cao cấp và tĩnh tại.",
};

/** Field order follows the brief a person actually fills in, top to bottom. */
const BRIEF_FIELDS: { key: keyof typeof SAMPLE; label: string; textarea?: boolean; hint?: string }[] = [
  { key: "brand", label: "Thương hiệu" },
  { key: "product", label: "Sản phẩm / dịch vụ" },
  { key: "industry", label: "Ngành hàng" },
  { key: "audience", label: "Đối tượng mục tiêu" },
  { key: "objective", label: "Mục tiêu chiến dịch" },
  { key: "channel", label: "Kênh / nền tảng" },
  { key: "tone", label: "Tông thương hiệu" },
  {
    key: "concept",
    label: "Định hướng sáng tạo",
    textarea: true,
    hint: "Bất kỳ yêu cầu cụ thể nào: góc máy, ánh sáng, bối cảnh. Yêu cầu đã nêu rõ sẽ được khoá và không lớp nào ghi đè được.",
  },
];

/** Display names for the resolver's authority tiers. Keys are the API values. */
const SOURCE_LABEL: Record<string, string> = {
  USER: "Khách hàng",
  REFERENCE: "Ảnh tham chiếu",
  STRATEGY: "Chiến lược chiến dịch",
  KNOWLEDGE: "Kiến thức chuyên môn",
  ASSET_DEFAULT: "Mặc định định dạng",
};

/** Display names for art-direction dimensions. Keys are the API values. */
const DIMENSION_LABEL: Record<string, string> = {
  camera: "Góc máy",
  lighting: "Ánh sáng",
  composition: "Bố cục",
  colour: "Màu sắc",
  environment: "Bối cảnh",
  materials: "Chất liệu",
  atmosphere: "Không khí",
};

// ── Local presentational helpers ─────────────────────────────────────────
function Debug({ n, title, data }: { n: number; title: string; data: unknown }) {
  return (
    <details className="border border-border rounded-DEFAULT bg-surface group">
      <summary className="cursor-pointer px-3 py-2 text-[12px] text-text2 hover:text-text select-none flex items-center gap-2">
        <span className="font-mono text-[10.5px] text-text3">{String(n).padStart(2, "0")}</span>
        {title}
      </summary>
      <pre className="px-3 pb-3 text-[11px] leading-relaxed text-text2 overflow-auto max-h-[420px] whitespace-pre-wrap break-words">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

function Stage({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-baseline gap-3">
        <span className="font-mono text-[11px] text-accent tracking-widest">{n}</span>
        <h2 className="text-[14px] font-semibold text-text">{title}</h2>
        {sub && <span className="text-[11.5px] text-text3 ml-auto">{sub}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-border/50 last:border-b-0">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3 mb-1">{label}</div>
      <div className="text-[13.5px] text-text leading-relaxed">{children}</div>
    </div>
  );
}

export default function CampaignStudioPage() {
  const [form, setForm] = useState({ ...SAMPLE });
  const [assetTypes, setAssetTypes] = useState<AssetType[]>(ASSET_TYPES.map((a) => a.id));
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [result, setResult] = useState<CampaignResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AssetType>("poster");
  const [renders, setRenders] = useState<
    Record<
      string,
      {
        loading: boolean;
        url?: string;
        error?: string;
        ms?: number;
        /** Name the file was saved under, shown so the user can find it on disk. */
        filename?: string;
        /** Set only when the automatic save failed; the preview still stands. */
        downloadError?: string;
        exportMetadata?: any;
      }
    >
  >({});

  const activeAsset = useMemo(() => result?.assets?.find((a) => a.asset_type === activeTab), [result, activeTab]);
  const campaign = result?.campaign;
  const dna = campaign?.visual_dna;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((p) => [...p, ...next]);
    setPreviews((p) => [...p, ...next.map((f) => URL.createObjectURL(f))]);
  }

  async function generateCampaign() {
    setLoading(true);
    setResult(null);
    setRenders({});
    setElapsed(null);
    const t0 = Date.now();
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v?.trim() && fd.append(k, v.trim()));
      fd.append("assetTypes", assetTypes.join(","));
      fd.append("dryRun", "true");
      fd.append("includePrompts", "true");
      files.forEach((f) => fd.append("images", f, f.name));

      const res = await fetch("/api/campaign/generate", { method: "POST", body: fd });
      const data: CampaignResponse = await res.json();
      setResult(data);
      if (data.assets?.length) setActiveTab(data.assets[0].asset_type);
    } catch (err: unknown) {
      setResult({
        success: false,
        error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      setElapsed(Date.now() - t0);
      setLoading(false);
    }
  }

  async function renderAsset(asset: Asset) {
    if (!asset.final_prompt) return;
    const key = asset.asset_type;
    setRenders((r) => ({ ...r, [key]: { loading: true } }));
    const t0 = Date.now();
    try {
      const fd = new FormData();
      fd.append("prompt", asset.final_prompt);
      fd.append("aspectRatio", asset.aspect_ratio);
      fd.append("assetType", asset.asset_type);
      fd.append("campaignId", campaign?.campaign_id || "campaign");
      // Context the render itself does not need, but the export record does.
      fd.append("assetLabel", ASSET_TYPES.find((t) => t.id === asset.asset_type)?.label || asset.asset_type);
      fd.append("useCase", asset.use_case || "");
      fd.append("assetGoal", asset.asset_goal || "");
      fd.append("campaignName", campaign?.campaign_name || "");
      fd.append("brand", form.brand || "");
      fd.append("layoutZones", JSON.stringify(asset.layout_logic?.zones || []));
      files.forEach((f) => fd.append("images", f, f.name));
      const res = await fetch("/api/campaign/render-asset", { method: "POST", body: fd });
      const data = await res.json();

      if (!data.success) {
        setRenders((r) => ({
          ...r,
          [key]: { loading: false, error: `${data.error?.code}: ${data.error?.message}`, ms: Date.now() - t0 },
        }));
        return;
      }

      // Show the preview first, then save. The picture appearing is the result;
      // the download is a convenience that must not hold it up or replace it.
      setRenders((r) => ({
        ...r,
        [key]: {
          loading: false,
          url: data.image_url,
          ms: Date.now() - t0,
          filename: data.download_filename,
          exportMetadata: data.export_metadata,
        },
      }));

      const saved = await downloadRenderedAsset(data.image_url, data.download_filename);
      if (!saved.ok) {
        setRenders((r) => ({ ...r, [key]: { ...r[key], downloadError: saved.error } }));
      }
    } catch (err: unknown) {
      setRenders((r) => ({
        ...r,
        [key]: { loading: false, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  const inputCls =
    "w-full bg-surface2 border border-borderStrong rounded-DEFAULT px-3 py-2 text-[13px] text-text placeholder:text-text3 focus:border-accent";

  return (
    <div className="min-h-screen px-6 py-8 max-w-[1500px] mx-auto space-y-6">
      <header className="border-b border-borderStrong pb-4">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-accent">Studio Chiến Dịch</p>
        <h1 className="text-[27px] font-bold tracking-tight mt-1">Giám đốc Sáng tạo AI</h1>
        <p className="text-[13px] text-text2 mt-1.5 max-w-[70ch]">
          Một brief trở thành một ý tưởng, một định hướng thị giác và một hệ thống ấn phẩm đồng bộ. Không có gì được
          render cho tới khi bạn yêu cầu.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] font-mono text-text3">
          {["Brief", "Ý tưởng", "Visual DNA", "Hệ thống ấn phẩm", "Render"].map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-borderStrong">→</span>}
              <span className={result?.success && i < 4 ? "text-text2" : ""}>{s}</span>
            </React.Fragment>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[390px_1fr] gap-6 items-start">
        {/* ═══ LEFT — CREATIVE BRIEF ═══ */}
        <aside className="lg:sticky lg:top-6 bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-[14px] font-semibold">Brief sáng tạo</h2>
            <p className="text-[11.5px] text-text3 mt-0.5">
              Ô nào bỏ trống sẽ được giữ trống — hệ thống không tự bịa thêm thông tin.
            </p>
          </div>

          <div className="p-5 space-y-3">
            {BRIEF_FIELDS.map((f) => (
              <label key={f.key} className="block space-y-1">
                <span className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3">{f.label}</span>
                {f.textarea ? (
                  <textarea
                    rows={4}
                    className={`${inputCls} resize-y leading-relaxed`}
                    value={form[f.key]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    className={inputCls}
                    value={form[f.key]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  />
                )}
                {f.hint && <span className="block text-[10.5px] text-text3 leading-snug">{f.hint}</span>}
              </label>
            ))}

            {/* Reference upload */}
            <div className="space-y-1 pt-1">
              <span className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3">Ảnh tham chiếu</span>
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
                className="w-full border border-dashed border-borderStrong rounded-DEFAULT py-3 text-[12px] text-text2 hover:border-text2 hover:text-text transition-colors"
              >
                {files.length
                  ? `${files.length} ảnh tham chiếu — thêm ảnh`
                  : "Ảnh sản phẩm, logo hoặc ảnh tham chiếu phong cách"}
              </button>
              {previews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1 items-center">
                  {previews.map((src, i) => (
                    <img key={i} src={src} alt="" className="w-11 h-11 object-cover rounded border border-borderStrong" />
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setPreviews([]);
                    }}
                    className="text-[11px] text-text3 hover:text-accent underline"
                  >
                    xoá hết
                  </button>
                </div>
              )}
              {files.length === 0 && (
                <span className="block text-[10.5px] text-warn leading-snug">
                  Không có ảnh sản phẩm, bản render sẽ không được khoá nhận diện theo sản phẩm thật của bạn.
                </span>
              )}
            </div>

            {/* Asset selection */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3">
                Ấn phẩm cần sản xuất
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ASSET_TYPES.map((a) => {
                  const on = assetTypes.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAssetTypes((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                      className={`px-2.5 py-1 rounded-pill text-[11.5px] border transition-colors ${
                        on ? "border-accent text-text bg-accentDim" : "border-borderStrong text-text3 hover:text-text2"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={loading || !form.brand.trim() || !form.product.trim() || assetTypes.length === 0}
              onClick={generateCampaign}
              className="w-full py-2.5 mt-1 rounded-DEFAULT bg-accent text-white font-semibold text-[13.5px] disabled:opacity-40 hover:bg-accent/90 transition-colors"
            >
              {loading ? "Đang dựng chiến dịch…" : "Tạo chiến dịch"}
            </button>
            {elapsed !== null && (
              <p className="text-[11px] font-mono text-text3 text-center">
                {(elapsed / 1000).toFixed(1)}s · chỉ lập kế hoạch, chưa render
              </p>
            )}
          </div>
        </aside>

        {/* ═══ RIGHT — THE WORK ═══ */}
        <div className="space-y-5 min-w-0">
          {!result && !loading && (
            <div className="border border-dashed border-borderStrong rounded-lg p-12 text-center">
              <p className="text-[14px] text-text2">Brief tạo ra ý tưởng trước khi tạo ra hình ảnh.</p>
              <p className="text-[12.5px] text-text3 mt-1">Điền brief và bấm tạo chiến dịch để xem ý tưởng.</p>
            </div>
          )}

          {loading && (
            <div className="border border-border rounded-lg p-12 text-center bg-surface">
              <p className="text-[13.5px] text-text2">
                Đang đọc brief, hình thành ý tưởng và điều chỉnh cho {assetTypes.length} định dạng…
              </p>
            </div>
          )}

          {result && !result.success && (
            <div className="border border-accent/40 bg-accentDim/40 rounded-lg p-4">
              <p className="text-[12px] font-mono text-accent">{result.error?.code}</p>
              <p className="text-[13.5px] text-text mt-1">{result.error?.message}</p>
            </div>
          )}

          {result?.success && campaign && (
            <>
              {/* ── 1. CAMPAIGN CONCEPT ── */}
              <Stage
                n="01"
                title="Ý tưởng chiến dịch"
                sub={
                  campaign.provenance?.strategy_source === "MARKETING_BRAIN"
                    ? "có lập luận chiến lược"
                    : "suy ra từ brief — thiếu lớp chiến lược"
                }
              >
                <p className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3 mb-1.5">Ý tưởng lớn</p>
                <p className="text-[19px] leading-snug font-semibold text-text mb-4 max-w-[62ch]">{campaign.big_idea}</p>
                <Pair label="Tên chiến dịch">{campaign.campaign_name}</Pair>
                <Pair label="Thông điệp cốt lõi">{campaign.core_message}</Pair>
                <Pair label="Insight khách hàng">
                  {campaign.consumer_insight || (
                    <span className="text-warn">
                      Chưa có insight — lớp chiến lược không khả dụng, nên ý tưởng chỉ diễn đạt lại brief.
                    </span>
                  )}
                </Pair>
                {campaign.emotional_response && (
                  <Pair label="Cảm xúc mong muốn">{campaign.emotional_response}</Pair>
                )}
              </Stage>

              {/* ── 2. VISUAL DNA ── */}
              <Stage n="02" title="Visual DNA" sub="áp dụng cho mọi ấn phẩm trong bộ">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                  <Pair label="Tông cảm xúc">{dna?.mood}</Pair>
                  <Pair label="Nguyên tắc màu sắc">{dna?.colour_logic}</Pair>
                  <Pair label="Nguyên tắc ánh sáng">{dna?.lighting_logic}</Pair>
                  <Pair label="Nguyên tắc bố cục">{dna?.composition_logic}</Pair>
                  <Pair label="Nguyên tắc chữ">{dna?.typography_logic}</Pair>
                  <Pair label="Cách thể hiện sản phẩm">{dna?.product_presentation}</Pair>
                </div>
              </Stage>

              {/* ── 3. ASSET SYSTEM ── */}
              <section className="bg-surface border border-border rounded-lg overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-accent tracking-widest">03</span>
                  <h2 className="text-[14px] font-semibold">Hệ thống ấn phẩm</h2>
                  <span className="text-[11.5px] text-text3 ml-auto">
                    một ý tưởng, {result.assets?.length} nhiệm vụ thương mại
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 border-b border-border px-4 pt-3 bg-surface2/40">
                  {(result.assets || []).map((a) => (
                    <button
                      key={a.asset_type}
                      type="button"
                      onClick={() => setActiveTab(a.asset_type)}
                      className={`px-3 py-2 text-[12.5px] border-b-2 -mb-px transition-colors ${
                        activeTab === a.asset_type
                          ? "border-accent text-text"
                          : "border-transparent text-text3 hover:text-text2"
                      }`}
                    >
                      {ASSET_TYPES.find((t) => t.id === a.asset_type)?.label || a.asset_type}
                      <span className="ml-1.5 font-mono text-[10px] text-text3">{a.aspect_ratio}</span>
                      {a.error && <span className="text-accent"> ✕</span>}
                    </button>
                  ))}
                </div>

                {activeAsset && (
                  <div className="p-5 space-y-5">
                    {activeAsset.error ? (
                      <p className="text-[13px] text-accent">
                        {activeAsset.error.code} — {activeAsset.error.message}
                      </p>
                    ) : (
                      <>
                        <Pair label="Mục tiêu ấn phẩm">{activeAsset.asset_goal}</Pair>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* Layout logic */}
                          <div>
                            <p className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3 mb-2">
                              Logic dàn trang
                            </p>
                            <div className="text-[12.5px] text-text2 space-y-1.5 leading-relaxed">
                              <div>
                                Hướng đọc{" "}
                                <span className="font-mono text-text">
                                  {activeAsset.layout_logic.eye_flow.replace(/_/g, " ")}
                                </span>
                              </div>
                              <div>
                                Lề an toàn{" "}
                                <span className="font-mono text-text">
                                  {activeAsset.layout_logic.safe_margin_percent}%
                                </span>{" "}
                                · vùng {activeAsset.layout_logic.zones.map((z) => z.role).join(", ")}
                              </div>
                              <p>{activeAsset.layout_logic.negative_space_strategy}</p>
                            </div>
                          </div>

                          {/* Attention budget */}
                          <div>
                            <p className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3 mb-2">
                              Ngân sách chú ý
                            </p>
                            <div className="space-y-1.5">
                              {activeAsset.visual_priority.map((p) => (
                                <div key={p.element} className="flex items-center gap-2">
                                  <span className="font-mono text-[10.5px] w-[74px] uppercase text-text2 shrink-0">
                                    {p.element}
                                  </span>
                                  <div className="flex-1 h-2 bg-surface2 rounded-full overflow-hidden">
                                    <div className="h-full bg-accent rounded-full" style={{ width: `${p.importance}%` }} />
                                  </div>
                                  <span className="font-mono text-[10.5px] text-text3 w-6 text-right">
                                    {p.importance}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Art direction decisions */}
                        <div>
                          <p className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-text3 mb-2">
                            Quyết định chỉ đạo nghệ thuật
                          </p>
                          <div className="border border-border rounded-DEFAULT divide-y divide-border overflow-hidden">
                            {activeAsset.prompt_plan.art_direction_decisions.map((d) => (
                              <div key={d.dimension} className="px-3 py-2.5 bg-surface2/30">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                                  <span className="text-[12px] font-semibold text-text w-[92px]">
                                    {DIMENSION_LABEL[d.dimension] || d.dimension}
                                  </span>
                                  <span
                                    className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded border ${
                                      d.client_locked
                                        ? "text-ok border-ok/40 bg-okDim"
                                        : d.source === "USER"
                                        ? "text-ok/80 border-ok/25"
                                        : "text-text3 border-borderStrong"
                                    }`}
                                  >
                                    {SOURCE_LABEL[d.source] || d.source}
                                  </span>
                                  {d.client_locked && (
                                    <span
                                      className="text-[10.5px] font-mono text-ok"
                                      title="Khoá bởi khách hàng — không lớp nào ghi đè được"
                                    >
                                      🔒 đã khoá
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono text-text3 ml-auto tabular-nums">
                                    {d.specificity} · tin cậy {d.confidence.toFixed(2)} · điểm {d.score.toFixed(3)}
                                  </span>
                                </div>
                                <p className="text-[12.5px] text-text2 leading-relaxed">{d.value}</p>
                                {d.qualifiers && d.qualifiers.length > 0 && (
                                  <p className="text-[11px] text-text3 mt-1">
                                    ghi chú tông từ khách hàng: {d.qualifiers.join("; ")}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Render */}
                        <div className="pt-1 border-t border-border space-y-3">
                          <div className="flex flex-wrap items-center gap-3 pt-3">
                            <button
                              type="button"
                              disabled={renders[activeAsset.asset_type]?.loading}
                              onClick={() => renderAsset(activeAsset)}
                              className="px-4 py-2 rounded-DEFAULT bg-surface3 border border-borderStrong text-[13px] hover:border-accent disabled:opacity-40 transition-colors"
                            >
                              {renders[activeAsset.asset_type]?.loading
                                ? "Đang render…"
                                : `Render ${ASSET_TYPES.find((t) => t.id === activeAsset.asset_type)?.label} này`}
                            </button>
                            <span className="text-[11px] text-text3">
                              Một lượt gọi provider · {activeAsset.aspect_ratio} · file tự động tải về
                            </span>
                            {renders[activeAsset.asset_type]?.ms && (
                              <span className="text-[11px] font-mono text-text3">
                                {((renders[activeAsset.asset_type]!.ms || 0) / 1000).toFixed(1)}s
                              </span>
                            )}
                          </div>
                          {renders[activeAsset.asset_type]?.error && (
                            <p className="text-[12px] text-accent">{renders[activeAsset.asset_type]?.error}</p>
                          )}
                          {renders[activeAsset.asset_type]?.url && (
                            <div className="space-y-2">
                              <img
                                src={renders[activeAsset.asset_type]!.url}
                                alt={activeAsset.asset_type}
                                className="max-w-[440px] w-full rounded-DEFAULT border border-borderStrong"
                              />

                              {renders[activeAsset.asset_type]?.downloadError ? (
                                <p className="text-[11.5px] text-warn">
                                  Ảnh đã render xong nhưng chưa tải về được:{" "}
                                  {renders[activeAsset.asset_type]?.downloadError}. Dùng nút bên dưới để tải thủ công.
                                </p>
                              ) : (
                                <p className="text-[11.5px] text-ok">
                                  Đã tải về{" "}
                                  <span className="font-mono text-text2">
                                    {renders[activeAsset.asset_type]?.filename}
                                  </span>
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadRenderedAsset(
                                      renders[activeAsset.asset_type]!.url!,
                                      renders[activeAsset.asset_type]!.filename || "campaign-asset.png"
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-DEFAULT border border-borderStrong text-[12px] text-text2 hover:border-accent hover:text-text transition-colors"
                                >
                                  Tải lại ảnh
                                </button>
                                {renders[activeAsset.asset_type]?.exportMetadata && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadExportMetadata(
                                        renders[activeAsset.asset_type]!.exportMetadata,
                                        renders[activeAsset.asset_type]!.filename || "campaign-asset.png"
                                      )
                                    }
                                    className="px-3 py-1.5 rounded-DEFAULT border border-borderStrong text-[12px] text-text2 hover:border-accent hover:text-text transition-colors"
                                  >
                                    Tải metadata xuất file (.json)
                                  </button>
                                )}
                              </div>

                              {renders[activeAsset.asset_type]?.exportMetadata && (
                                <details className="border border-border rounded-DEFAULT bg-surface2/30">
                                  <summary className="cursor-pointer px-3 py-2 text-[12px] text-text2 hover:text-text select-none">
                                    Metadata xuất file — kích thước, thiết lập render, vùng layer
                                  </summary>
                                  <pre className="px-3 pb-3 text-[11px] leading-relaxed text-text2 overflow-auto max-h-[360px] whitespace-pre-wrap break-words">
                                    {JSON.stringify(renders[activeAsset.asset_type]?.exportMetadata, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          )}
                        </div>

                        <details className="border border-border rounded-DEFAULT bg-surface2/30">
                          <summary className="cursor-pointer px-3 py-2 text-[12px] text-text2 hover:text-text select-none">
                            Prompt cuối — đúng nội dung gửi tới model ({activeAsset.prompt_chars.toLocaleString()} ký tự)
                          </summary>
                          <pre className="px-3 pb-3 text-[11px] leading-relaxed text-text2 overflow-auto max-h-[460px] whitespace-pre-wrap break-words">
                            {activeAsset.final_prompt || "(không được trả về)"}
                          </pre>
                        </details>
                      </>
                    )}
                  </div>
                )}
              </section>

              {/* ── DEBUG ── */}
              <div className="space-y-2 pt-1">
                <h2 className="text-[13px] font-semibold text-text2">Kiểm tra pipeline</h2>
                <Debug n={1} title="Brief" data={{ ...form, assetTypes, referenceCount: files.length }} />
                <Debug n={2} title="Bộ dựng chiến dịch" data={campaign} />
                <Debug
                  n={3}
                  title="Lập luận marketing"
                  data={result.strategy || "(lớp chiến lược không khả dụng)"}
                />
                <Debug
                  n={4}
                  title="Bộ giải quyết chỉ đạo nghệ thuật"
                  data={Object.fromEntries(
                    (result.assets || []).map((a) => [a.asset_type, a.prompt_plan.art_direction_decisions])
                  )}
                />
                <Debug
                  n={5}
                  title="Điều chỉnh theo ấn phẩm"
                  data={(result.assets || []).map((a) => ({
                    asset_type: a.asset_type,
                    aspect_ratio: a.aspect_ratio,
                    asset_goal: a.asset_goal,
                    adaptations: a.prompt_plan.asset_adaptations,
                    layout: a.layout_logic,
                    visual_priority: a.visual_priority,
                    knowledge_blocks: a.prompt_plan.knowledge_blocks,
                    prompt_chars: a.prompt_chars,
                    warnings: a.warnings,
                  }))}
                />
                <Debug n={6} title="Chẩn đoán" data={result.diagnostics} />
                <Debug n={7} title="Bàn giao" data={result.delivery || "(không có)"} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
