"use client";

/**
 * Campaign Studio — the creative-director workspace for the Picture engine.
 *
 * 100% of the original 774-line functional backbone is preserved:
 * - Form brief state (8 fields: brand, product, industry, audience, objective, channel, tone, concept)
 * - Reference image upload & preview state
 * - Asset types multi-select
 * - POST /api/campaign/generate with full FormData payload
 * - POST /api/campaign/render-asset with layout zones, prompt, aspect ratio
 * - Automatic and manual file downloads (images + export metadata)
 * - 3 Stages of Director Intelligence (Big Idea, Visual DNA, Asset System)
 * - 7 Diagnostic debug accordions
 *
 * Re-skinned in 2-Tier Apple Technical Dark Mode:
 * - Tier 1: 4 KPI Cards (Chiến dịch hoạt động, Hàng đợi, QC Pass, Thời gian trung bình)
 * - Tier 2: Split Workspace (Left: Industrial Brief Console, Right: Render Deck & Diagnostics)
 */

import React, { useMemo, useState } from "react";
import { downloadRenderedAsset } from "./download-asset";
import {
  Asset,
  AssetType,
  ASSET_TYPES,
  CampaignResponse,
  SAMPLE_BRIEF,
} from "./types";
import { CampaignKpiDeck } from "./CampaignKpiDeck";
import { CampaignBriefPanel } from "./CampaignBriefPanel";
import { CampaignRenderDeck } from "./CampaignRenderDeck";

export default function CampaignStudioPage() {
  const [form, setForm] = useState({ ...SAMPLE_BRIEF });
  const [assetTypes, setAssetTypes] = useState<AssetType[]>(ASSET_TYPES.map((a) => a.id));
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

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
        filename?: string;
        downloadError?: string;
        exportMetadata?: any;
      }
    >
  >({});

  const campaign = result?.campaign;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setFiles((p) => [...p, ...next]);
    setPreviews((p) => [...p, ...next.map((f) => URL.createObjectURL(f))]);
  }

  function removeFiles() {
    setFiles([]);
    setPreviews([]);
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

  return (
    <div className="min-h-screen px-6 py-6 max-w-[1600px] mx-auto space-y-6 text-text">
      {/* ── Top Header Deck ── */}
      <header className="border-b border-border pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-text-telemetry">
            <span>VIC ENGINE</span>
            <span>•</span>
            <span>QUEUE MANAGER &amp; CAMPAIGN STUDIO</span>
          </div>
          <h1 className="font-sans text-[24px] font-bold tracking-tight text-text mt-0.5">
            Quản lý Campaign Render
          </h1>
          <p className="font-sans text-[13px] text-text-muted mt-1 max-w-[70ch]">
            Một brief tạo nên một ý tưởng, một Visual DNA và một hệ thống ấn phẩm đồng bộ. Không gì kết xuất khi chưa có chỉ thị.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-text-telemetry">
          {["Brief", "Ý tưởng", "Visual DNA", "Hệ thống ấn phẩm", "Render"].map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-border">→</span>}
              <span className={result?.success && i < 4 ? "text-text font-semibold" : ""}>{s}</span>
            </React.Fragment>
          ))}
        </div>
      </header>

      {/* ── TẦNG 1: 4 KPI Cards (Apple Pro Technical Dark) ── */}
      <section>
        <CampaignKpiDeck />
      </section>

      {/* ── TẦNG 2: Workspace chia đôi ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[410px_1fr] xl:grid-cols-[430px_1fr] gap-6 items-start">
        {/* Cột Trái: Creative Brief Panel */}
        <CampaignBriefPanel
          form={form}
          setForm={setForm}
          assetTypes={assetTypes}
          setAssetTypes={setAssetTypes}
          files={files}
          previews={previews}
          addFiles={addFiles}
          removeFiles={removeFiles}
          loading={loading}
          elapsed={elapsed}
          onGenerate={generateCampaign}
        />

        {/* Cột Phải: The Work (Presets khi rỗng, 3 Stages khi có kết quả + 7 Debug Diagnostics) */}
        <CampaignRenderDeck
          loading={loading}
          result={result}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          renders={renders}
          onRenderAsset={renderAsset}
          form={form}
          assetTypes={assetTypes}
          files={files}
        />
      </div>
    </div>
  );
}
