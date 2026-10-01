"use client";

import React from "react";
import {
  Download,
  FileJson,
  Sparkles,
  Smartphone,
  Square,
  Monitor,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { VmcButton, VmcTallyDot, VmcBadge } from "@/components/vmc";
import {
  Asset,
  AssetType,
  ASSET_TYPES,
  CampaignResponse,
  DIMENSION_LABEL,
  SAMPLE_BRIEF,
  SOURCE_LABEL,
} from "./types";
import { downloadExportMetadata, downloadRenderedAsset } from "./download-asset";

export interface CampaignRenderDeckProps {
  loading: boolean;
  result: CampaignResponse | null;
  activeTab: AssetType;
  setActiveTab: (tab: AssetType) => void;
  renders: Record<
    string,
    {
      loading: boolean;
      url?: string;
      error?: string;
      ms?: number;
      filename?: string;
      downloadError?: string;
      exportMetadata?: any;
    }
  >;
  onRenderAsset: (asset: Asset) => void;
  form: typeof SAMPLE_BRIEF;
  assetTypes: AssetType[];
  files: File[];
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-border/60 last:border-b-0">
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-telemetry mb-0.5">
        {label}
      </div>
      <div className="text-[13px] text-text font-sans leading-relaxed">{children}</div>
    </div>
  );
}

function Stage({
  n,
  title,
  sub,
  children,
}: {
  n: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-[2px] overflow-hidden select-none">
      <div className="px-5 py-3 border-b border-border flex items-baseline gap-2.5 bg-surface2/30">
        <span className="font-mono text-[11px] text-text-telemetry font-bold tracking-wider">{n}</span>
        <h2 className="text-[14px] font-bold text-text font-sans">{title}</h2>
        {sub && <span className="text-[11px] text-text-muted font-sans ml-auto">{sub}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Debug({ n, title, data }: { n: number; title: string; data: unknown }) {
  return (
    <details className="border border-border rounded-[2px] bg-surface group select-none">
      <summary className="cursor-pointer px-3.5 py-2 text-[12px] font-mono text-text-muted hover:text-text select-none flex items-center gap-2">
        <span className="text-[10.5px] text-text-telemetry">{String(n).padStart(2, "0")}</span>
        <span>{title}</span>
      </summary>
      <pre className="px-3.5 pb-3 text-[11px] font-mono leading-relaxed text-text-telemetry overflow-auto max-h-[380px] whitespace-pre-wrap break-words border-t border-border/40 pt-2 bg-surface2/30">
        {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

export function CampaignRenderDeck({
  loading,
  result,
  activeTab,
  setActiveTab,
  renders,
  onRenderAsset,
  form,
  assetTypes,
  files,
}: CampaignRenderDeckProps) {
  const campaign = result?.campaign;
  const dna = campaign?.visual_dna;
  const activeAsset = result?.assets?.find((a) => a.asset_type === activeTab);

  return (
    <div className="space-y-5 min-w-0">
      {/* ── State 1: Empty / Waiting ── */}
      {!result && !loading && (
        <div className="space-y-4">
          <div className="border border-dashed border-border rounded-[2px] p-8 text-center bg-surface select-none">
            <span className="font-mono text-[11px] text-text-telemetry uppercase tracking-wider block mb-1">
              CAMPAIGN INTELLIGENCE WORKSPACE
            </span>
            <p className="text-[14px] font-sans font-medium text-text">
              Brief tạo ra ý tưởng trước khi tạo ra hình ảnh.
            </p>
            <p className="text-[12px] font-sans text-text-muted mt-1">
              Điền brief bên trái và bấm &quot;Tạo chiến dịch&quot; để kích hoạt Director Brain.
            </p>
          </div>

          {/* Format Presets Shelf */}
          <div className="space-y-2.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry block">
              PRESET ĐỊNH DẠNG CHUẨN SẴN SÀNG
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-surface border border-border p-3.5 rounded-[2px] flex items-center gap-3">
                <div className="w-10 h-12 bg-surface2 border border-border rounded-[2px] flex flex-col items-center justify-center text-text shrink-0">
                  <span className="font-mono text-[10px] font-bold">9:16</span>
                  <Smartphone size={14} className="mt-0.5 text-text-telemetry" />
                </div>
                <div className="flex flex-col">
                  <span className="font-sans text-[12.5px] font-semibold text-text">TikTok &amp; Reels</span>
                  <span className="font-mono text-[10.5px] text-text-telemetry mt-0.5">1080 × 1920 px</span>
                </div>
              </div>

              <div className="bg-surface border border-border p-3.5 rounded-[2px] flex items-center gap-3">
                <div className="w-10 h-12 bg-surface2 border border-border rounded-[2px] flex flex-col items-center justify-center text-text shrink-0">
                  <span className="font-mono text-[10px] font-bold">1:1</span>
                  <Square size={14} className="mt-0.5 text-text-telemetry" />
                </div>
                <div className="flex flex-col">
                  <span className="font-sans text-[12.5px] font-semibold text-text">Sàn TMĐT</span>
                  <span className="font-mono text-[10.5px] text-text-telemetry mt-0.5">2048 × 2048 px</span>
                </div>
              </div>

              <div className="bg-surface border border-border p-3.5 rounded-[2px] flex items-center gap-3">
                <div className="w-10 h-12 bg-surface2 border border-border rounded-[2px] flex flex-col items-center justify-center text-text shrink-0">
                  <span className="font-mono text-[10px] font-bold">16:9</span>
                  <Monitor size={14} className="mt-0.5 text-text-telemetry" />
                </div>
                <div className="flex flex-col">
                  <span className="font-sans text-[12.5px] font-semibold text-text">Quảng Cáo Ngang</span>
                  <span className="font-mono text-[10.5px] text-text-telemetry mt-0.5">3840 × 2160 px</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── State 2: Loading ── */}
      {loading && (
        <div className="border border-border rounded-[2px] p-12 text-center bg-surface select-none space-y-3">
          <RefreshCw size={24} className="animate-spin mx-auto text-text" />
          <p className="text-[13.5px] font-sans text-text font-medium">
            Đang đọc brief, hình thành ý tưởng và điều chỉnh cho {assetTypes.length} định dạng…
          </p>
          <span className="font-mono text-[11px] text-text-telemetry block">
            AI DIRECTOR STRATEGY ENGINE IN PROGRESS
          </span>
        </div>
      )}

      {/* ── State 3: Error ── */}
      {result && !result.success && (
        <div className="border border-tally-live bg-surface2 rounded-[2px] p-4 space-y-1">
          <div className="flex items-center gap-2 text-tally-live font-mono text-[12px] font-bold">
            <AlertCircle size={15} />
            <span>{result.error?.code || "CAMPAIGN_ERROR"}</span>
          </div>
          <p className="text-[13px] font-sans text-text">{result.error?.message}</p>
        </div>
      )}

      {/* ── State 4: Results Rendered (3 Stages + Debug) ── */}
      {result?.success && campaign && (
        <>
          {/* ── STAGE 01: Ý TƯỞNG CHIẾN DỊCH ── */}
          <Stage
            n="01"
            title="Ý tưởng chiến dịch"
            sub={
              campaign.provenance?.strategy_source === "MARKETING_BRAIN"
                ? "Có lập luận chiến lược"
                : "Suy ra từ brief — thiếu lớp chiến lược"
            }
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-telemetry mb-1">
              Ý TƯỞNG LỚN (BIG IDEA)
            </p>
            <p className="text-[17px] font-sans font-bold text-text mb-4 leading-snug">
              {campaign.big_idea}
            </p>
            <div className="divide-y divide-border/60">
              <Pair label="Tên chiến dịch">{campaign.campaign_name}</Pair>
              <Pair label="Thông điệp cốt lõi">{campaign.core_message}</Pair>
              <Pair label="Insight khách hàng">
                {campaign.consumer_insight || (
                  <span className="text-tally-warning font-sans">
                    Chưa có insight — lớp chiến lược không khả dụng, ý tưởng diễn đạt lại brief.
                  </span>
                )}
              </Pair>
              {campaign.emotional_response && (
                <Pair label="Cảm xúc mong muốn">{campaign.emotional_response}</Pair>
              )}
            </div>
          </Stage>

          {/* ── STAGE 02: VISUAL DNA ── */}
          <Stage n="02" title="Visual DNA" sub="Áp dụng đồng bộ cho mọi ấn phẩm trong bộ">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 divide-y md:divide-y-0 divide-border/60">
              <Pair label="Tông cảm xúc">{dna?.mood}</Pair>
              <Pair label="Nguyên tắc màu sắc">{dna?.colour_logic}</Pair>
              <Pair label="Nguyên tắc ánh sáng">{dna?.lighting_logic}</Pair>
              <Pair label="Nguyên tắc bố cục">{dna?.composition_logic}</Pair>
              <Pair label="Nguyên tắc chữ (Typography)">{dna?.typography_logic}</Pair>
              <Pair label="Cách thể hiện sản phẩm">{dna?.product_presentation}</Pair>
            </div>
          </Stage>

          {/* ── STAGE 03: HỆ THỐNG ẤN PHẨM ── */}
          <section className="bg-surface border border-border rounded-[2px] overflow-hidden select-none">
            <div className="px-5 py-3 border-b border-border flex items-baseline gap-2.5 bg-surface2/30">
              <span className="font-mono text-[11px] text-text-telemetry font-bold tracking-wider">03</span>
              <h2 className="text-[14px] font-bold text-text font-sans">Hệ thống ấn phẩm</h2>
              <span className="text-[11px] text-text-muted font-sans ml-auto">
                Một ý tưởng, {result.assets?.length} nhiệm vụ thương mại
              </span>
            </div>

            {/* Asset Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-border px-4 pt-2.5 bg-surface2/40">
              {(result.assets || []).map((a) => {
                const isActive = activeTab === a.asset_type;
                const label = ASSET_TYPES.find((t) => t.id === a.asset_type)?.label || a.asset_type;

                return (
                  <button
                    key={a.asset_type}
                    type="button"
                    onClick={() => setActiveTab(a.asset_type)}
                    className={`px-3 py-2 text-[12.5px] font-sans border-b-2 -mb-px transition-colors cursor-pointer outline-none ${
                      isActive
                        ? "border-text text-text font-bold"
                        : "border-transparent text-text-muted hover:text-text"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-text-telemetry">{a.aspect_ratio}</span>
                    {a.error && <span className="text-tally-live ml-1">✕</span>}
                  </button>
                );
              })}
            </div>

            {/* Active Asset Work View */}
            {activeAsset && (
              <div className="p-5 space-y-5">
                {activeAsset.error ? (
                  <p className="text-[12.5px] font-mono text-tally-live">
                    {activeAsset.error.code} — {activeAsset.error.message}
                  </p>
                ) : (
                  <>
                    <Pair label="Mục tiêu ấn phẩm">{activeAsset.asset_goal}</Pair>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Layout Logic */}
                      <div className="space-y-1.5 bg-surface2/40 p-3.5 rounded-[2px] border border-border">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-text-telemetry">
                          LOGIC DÀN TRANG
                        </p>
                        <div className="text-[12px] font-sans text-text space-y-1 leading-relaxed">
                          <div>
                            Hướng đọc mắt:{" "}
                            <span className="font-mono text-text font-semibold">
                              {activeAsset.layout_logic.eye_flow.replace(/_/g, " ")}
                            </span>
                          </div>
                          <div>
                            Lề an toàn:{" "}
                            <span className="font-mono text-text font-semibold">
                              {activeAsset.layout_logic.safe_margin_percent}%
                            </span>{" "}
                            · Vùng {activeAsset.layout_logic.zones.map((z) => z.role).join(", ")}
                          </div>
                          <p className="text-text-muted pt-1">
                            {activeAsset.layout_logic.negative_space_strategy}
                          </p>
                        </div>
                      </div>

                      {/* Attention Budget */}
                      <div className="space-y-2 bg-surface2/40 p-3.5 rounded-[2px] border border-border">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-text-telemetry">
                          NGÂN SÁCH CHÚ Ý (ATTENTION BUDGET)
                        </p>
                        <div className="space-y-1.5">
                          {activeAsset.visual_priority.map((p) => (
                            <div key={p.element} className="flex items-center gap-2">
                              <span className="font-mono text-[10px] w-[75px] uppercase text-text-muted truncate">
                                {p.element}
                              </span>
                              <div className="flex-1 h-1.5 bg-surface3 rounded-[1px] overflow-hidden">
                                <div
                                  className="h-full bg-text rounded-[1px]"
                                  style={{ width: `${p.importance}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10.5px] text-text-telemetry w-6 text-right">
                                {p.importance}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Art Direction Decisions Table */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-text-telemetry">
                        QUYẾT ĐỊNH CHỈ ĐẠO NGHỆ THUẬT
                      </p>
                      <div className="border border-border rounded-[2px] divide-y divide-border overflow-hidden">
                        {activeAsset.prompt_plan.art_direction_decisions.map((d) => (
                          <div key={d.dimension} className="px-3 py-2 bg-surface2/30">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                              <span className="text-[12px] font-bold text-text w-[90px] font-sans">
                                {DIMENSION_LABEL[d.dimension] || d.dimension}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[2px] border border-border bg-surface2 text-text-muted">
                                {SOURCE_LABEL[d.source] || d.source}
                              </span>
                              {d.client_locked && (
                                <span className="text-[10px] font-mono text-tally-success">
                                  🔒 Đã khoá
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-text-telemetry ml-auto">
                                {d.specificity} · Tin cậy {d.confidence.toFixed(2)} · Điểm {d.score.toFixed(3)}
                              </span>
                            </div>
                            <p className="text-[12.5px] font-sans text-text-muted leading-relaxed">
                              {d.value}
                            </p>
                            {d.qualifiers && d.qualifiers.length > 0 && (
                              <p className="text-[11px] font-mono text-text-telemetry mt-0.5">
                                Ghi chú tông: {d.qualifiers.join("; ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Render Area */}
                    <div className="pt-2 border-t border-border space-y-3">
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <VmcButton
                          type="button"
                          variant="primary"
                          size="md"
                          isLoading={renders[activeAsset.asset_type]?.loading}
                          disabled={renders[activeAsset.asset_type]?.loading}
                          onClick={() => onRenderAsset(activeAsset)}
                          icon={<Sparkles size={14} />}
                        >
                          {renders[activeAsset.asset_type]?.loading
                            ? "Đang render…"
                            : `Render ${
                                ASSET_TYPES.find((t) => t.id === activeAsset.asset_type)?.label ||
                                activeAsset.asset_type
                              } này`}
                        </VmcButton>

                        <span className="text-[11px] font-mono text-text-telemetry">
                          Một lượt gọi provider · {activeAsset.aspect_ratio} · Tự động tải về
                        </span>

                        {renders[activeAsset.asset_type]?.ms && (
                          <span className="text-[11px] font-mono text-text-muted">
                            {((renders[activeAsset.asset_type]!.ms || 0) / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>

                      {renders[activeAsset.asset_type]?.error && (
                        <p className="text-[12px] font-mono text-tally-live">
                          {renders[activeAsset.asset_type]?.error}
                        </p>
                      )}

                      {renders[activeAsset.asset_type]?.url && (
                        <div className="space-y-3 pt-1">
                          <div className="relative rounded-[2px] overflow-hidden border border-border bg-surface-container-lowest max-w-[440px]">
                            <img
                              src={renders[activeAsset.asset_type]!.url}
                              alt={activeAsset.asset_type}
                              className="w-full h-auto object-cover"
                            />
                          </div>

                          {renders[activeAsset.asset_type]?.downloadError ? (
                            <p className="text-[11.5px] font-sans text-tally-warning">
                              Ảnh đã render xong nhưng chưa tải về được:{" "}
                              {renders[activeAsset.asset_type]?.downloadError}.
                            </p>
                          ) : (
                            <p className="text-[11.5px] font-sans text-tally-success flex items-center gap-1.5">
                              <CheckCircle2 size={13} />
                              <span>Đã tải về file: {renders[activeAsset.asset_type]?.filename}</span>
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            <VmcButton
                              type="button"
                              variant="outline"
                              size="sm"
                              icon={<Download size={13} />}
                              onClick={() =>
                                downloadRenderedAsset(
                                  renders[activeAsset.asset_type]!.url!,
                                  renders[activeAsset.asset_type]!.filename || "campaign-asset.png"
                                )
                              }
                            >
                              Tải lại ảnh
                            </VmcButton>

                            {renders[activeAsset.asset_type]?.exportMetadata && (
                              <VmcButton
                                type="button"
                                variant="outline"
                                size="sm"
                                icon={<FileJson size={13} />}
                                onClick={() =>
                                  downloadExportMetadata(
                                    renders[activeAsset.asset_type]!.exportMetadata,
                                    renders[activeAsset.asset_type]!.filename || "campaign-asset.png"
                                  )
                                }
                              >
                                Tải metadata (.json)
                              </VmcButton>
                            )}
                          </div>

                          {renders[activeAsset.asset_type]?.exportMetadata && (
                            <details className="border border-border rounded-[2px] bg-surface2/30">
                              <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-mono text-text-muted hover:text-text select-none">
                                Metadata xuất file — kích thước, thiết lập render, vùng layer
                              </summary>
                              <pre className="px-3 pb-3 text-[10.5px] font-mono leading-relaxed text-text-telemetry overflow-auto max-h-[300px] whitespace-pre-wrap break-words border-t border-border/40 pt-2">
                                {JSON.stringify(renders[activeAsset.asset_type]?.exportMetadata, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Final Prompt View */}
                    <details className="border border-border rounded-[2px] bg-surface2/30">
                      <summary className="cursor-pointer px-3 py-2 text-[11.5px] font-mono text-text-muted hover:text-text select-none">
                        Prompt cuối — đúng nội dung gửi tới model ({activeAsset.prompt_chars.toLocaleString()} ký tự)
                      </summary>
                      <pre className="px-3 pb-3 text-[11px] font-mono leading-relaxed text-text-telemetry overflow-auto max-h-[380px] whitespace-pre-wrap break-words border-t border-border/40 pt-2">
                        {activeAsset.final_prompt || "(không được trả về)"}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── 7 DEBUG ACCORDIONS ── */}
          <div className="space-y-2 pt-1 select-none">
            <h3 className="text-[12px] font-mono uppercase tracking-wider text-text-telemetry font-semibold">
              KIỂM TRA PIPELINE (DIAGNOSTICS)
            </h3>
            <Debug n={1} title="Brief" data={{ ...form, assetTypes, referenceCount: files.length }} />
            <Debug n={2} title="Bộ dựng chiến dịch" data={campaign} />
            <Debug n={3} title="Lập luận marketing" data={result.strategy || "(lớp chiến lược không khả dụng)"} />
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
  );
}
