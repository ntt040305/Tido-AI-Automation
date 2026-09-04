"use client";

import React, { useState } from "react";
import {
  CreativeBrief,
  AssetType,
  AspectRatioType,
  MarketingContext,
  SalesContext,
  CreativeDirection,
  BrandIdentity,
} from "../../types/picture-engine.types";
import { AssetTypeSelector } from "./AssetTypeSelector";
import { BrandIdentityUploader } from "./BrandIdentityUploader";
import { Sparkles, FileText, Package, Ratio, Lightbulb } from "lucide-react";

export interface CreativeBriefPanelProps {
  brief: CreativeBrief;
  canGenerate: boolean;
  isGenerating: boolean;
  onUpdateAssetType: (type: AssetType) => void;
  onUpdateCreativeConcept?: (concept: string) => void;
  onUpdateAssetConfiguration?: (config: {
    asset_type?: AssetType;
    target_product_count?: number | "multiple";
    aspect_ratio?: AspectRatioType;
  }) => void;
  onUpdateMarketingContext: (updates: Partial<MarketingContext>) => void;
  onUpdateSalesContext: (updates: Partial<SalesContext>) => void;
  onUpdateCreativeDirection: (updates: Partial<CreativeDirection>) => void;
  onUpdateBrandIdentity: (updates: Partial<BrandIdentity>) => void;
  onGenerate: () => void;
}

export function CreativeBriefPanel({
  brief,
  canGenerate,
  isGenerating,
  onUpdateAssetType,
  onUpdateCreativeConcept,
  onUpdateAssetConfiguration,
  onUpdateCreativeDirection,
  onUpdateBrandIdentity,
  onGenerate,
}: CreativeBriefPanelProps) {
  const currentConcept = brief.creative_concept || brief.user_notes || "";
  const currentProductCount = brief.creative_direction?.target_product_count ?? 1;
  const currentAspectRatio = brief.creative_direction?.aspect_ratio ?? "4:5";

  const [isProfessionalizing, setIsProfessionalizing] = useState(false);
  const [professionalResult, setProfessionalResult] = useState<{
    originalConcept: string;
    professionalConcept: string;
  } | null>(null);

  const PRODUCT_COUNT_OPTIONS: Array<{ label: string; value: number | "multiple" }> = [
    { label: "1 sản phẩm", value: 1 },
    { label: "2 sản phẩm", value: 2 },
    { label: "3 sản phẩm", value: 3 },
    { label: "Nhiều sản phẩm", value: "multiple" },
  ];

  const ASPECT_RATIO_OPTIONS: AspectRatioType[] = ["1:1", "4:5", "9:16", "16:9"];

  const handleConceptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (professionalResult) {
      setProfessionalResult(null);
    }
    if (onUpdateCreativeConcept) {
      onUpdateCreativeConcept(val);
    } else {
      onUpdateCreativeDirection({ composition_layout: val });
    }
  };

  const handleProductCountSelect = (val: number | "multiple") => {
    if (onUpdateAssetConfiguration) {
      onUpdateAssetConfiguration({ target_product_count: val });
    } else {
      onUpdateCreativeDirection({
        target_product_count: typeof val === "number" ? val : 4,
      });
    }
  };

  const handleAspectRatioSelect = (ratio: AspectRatioType) => {
    if (onUpdateAssetConfiguration) {
      onUpdateAssetConfiguration({ aspect_ratio: ratio });
    } else {
      onUpdateCreativeDirection({ aspect_ratio: ratio });
    }
  };

  const handleProfessionalize = async () => {
    if (!currentConcept || !currentConcept.trim() || isProfessionalizing) return;

    setProfessionalResult(null);
    setIsProfessionalizing(true);
    try {
      const refImages = brief.brand_identity?.product_assets?.map((a) => a.file_url) || [];
      const res = await fetch("/api/image/concept-professionalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: currentConcept,
          outputType: brief.asset_type,
          images: refImages,
          brandName: brief.brand_identity?.brand_name || undefined,
        }),
      });
      const data = await res.json();
      if (data.professionalConcept) {
        setProfessionalResult({
          originalConcept: data.originalConcept || currentConcept,
          professionalConcept: data.professionalConcept,
        });
      }
    } catch (err) {
      console.error("Concept professionalize request failed:", err);
    } finally {
      setIsProfessionalizing(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6 text-left">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/80">
        <div>
          <div className="text-[11px] font-mono text-accent uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <FileText size={13} />
            <span>AI COMMERCIAL VISUAL STUDIO</span>
          </div>
          <h2 className="text-[18px] font-bold text-text tracking-tight mt-0.5">
            Yêu cầu Sản xuất Visual AI
          </h2>
        </div>
      </div>

      {/* 1. Asset Type Selector */}
      <AssetTypeSelector
        selected={brief.asset_type}
        onChange={(type) => {
          if (onUpdateAssetConfiguration) {
            onUpdateAssetConfiguration({ asset_type: type });
          } else {
            onUpdateAssetType(type);
          }
        }}
      />

      {/* 2. Product Count */}
      <div className="space-y-2.5">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <Package size={15} className="text-accent" />
          <span>Số lượng sản phẩm trong ảnh</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRODUCT_COUNT_OPTIONS.map((opt) => {
            const isActive =
              opt.value === "multiple"
                ? typeof currentProductCount === "number" && currentProductCount > 3
                : currentProductCount === opt.value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => handleProductCountSelect(opt.value)}
                className={`py-2.5 px-3 rounded-xl border text-[13px] font-semibold transition-all cursor-pointer outline-none ${
                  isActive
                    ? "bg-accent/15 border-accent text-white shadow-sm ring-1 ring-accent/40"
                    : "bg-surface2/60 border-borderStrong text-text2 hover:bg-surface2 hover:text-text"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Aspect Ratio */}
      <div className="space-y-2.5">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <Ratio size={15} className="text-accent" />
          <span>Tỷ lệ khung hình (Aspect Ratio)</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ASPECT_RATIO_OPTIONS.map((ratio) => {
            const isActive = currentAspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => handleAspectRatioSelect(ratio)}
                className={`py-2.5 px-3 rounded-xl border text-[13px] font-mono font-semibold transition-all cursor-pointer outline-none ${
                  isActive
                    ? "bg-accent/15 border-accent text-white shadow-sm ring-1 ring-accent/40"
                    : "bg-surface2/60 border-borderStrong text-text2 hover:bg-surface2 hover:text-text"
                }`}
              >
                {ratio}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Reference Uploads */}
      <BrandIdentityUploader
        brandIdentity={brief.brand_identity}
        onChange={onUpdateBrandIdentity}
      />

      {/* 5. Creative Concept (Large Textarea) */}
      <div className="space-y-2.5">
        <label className="text-[13.5px] font-semibold text-text flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Lightbulb size={15} className="text-amber-400" />
            <span>Ý tưởng Creative Commercial (Concept)</span>
          </span>
          <span className="text-[11px] font-mono text-amber-400 font-normal">
            Quan trọng nhất
          </span>
        </label>
        <textarea
          rows={5}
          value={currentConcept}
          onChange={handleConceptChange}
          placeholder="Mô tả ý tưởng của bạn: Góc máy, ánh sáng, môi trường, cảm xúc, màu sắc, phong cách... (Ví dụ: Chai serum cao cấp đặt trên bàn đá cẩm thạch trong khu vườn Nhật Bản lúc bình minh, ống kính macro 85mm, ánh nắng sớm ấm áp, sương mờ dịu nhẹ...)"
          className="w-full p-4 bg-surface2/70 border border-borderStrong focus:border-accent focus:ring-1 focus:ring-accent rounded-xl text-[13.5px] text-text placeholder:text-text3/60 transition-all resize-none outline-none leading-relaxed"
        />

        {/* Concept Professionalizer Button & Note */}
        <div className="pt-1.5 space-y-2">
          <button
            type="button"
            disabled={!currentConcept.trim() || isGenerating || isProfessionalizing}
            onClick={handleProfessionalize}
            className="w-full py-2.5 px-4 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 font-semibold text-[13px] rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer outline-none active:scale-[0.99]"
          >
            {isProfessionalizing ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
                <span>Đang phát triển ý tưởng quảng cáo...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} className="text-amber-400" />
                <span>✨ Chuyên nghiệp hóa ý tưởng</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-text3/70 italic text-center leading-tight">
            AI sẽ giúp phát triển ý tưởng quảng cáo chuyên nghiệp hơn. Có thể phát sinh phí sử dụng AI nâng cao.
          </p>
        </div>

        {/* Professional Concept Comparison UI */}
        {professionalResult && (
          <div className="mt-3 p-4 bg-surface/90 border border-amber-500/40 rounded-xl space-y-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-[12px] font-bold text-amber-400 flex items-center gap-1.5">
                <Sparkles size={14} />
                <span>Gợi ý Concept Quảng Cáo Chuyên Nghiệp</span>
              </span>
              <button
                type="button"
                onClick={() => setProfessionalResult(null)}
                className="text-[11px] text-text3 hover:text-text cursor-pointer"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="space-y-2 text-[12.5px] leading-relaxed">
              <div>
                <span className="font-semibold text-text3 block text-[11px] uppercase tracking-wider">
                  Ý tưởng ban đầu:
                </span>
                <p className="text-text2/90 italic bg-surface2/50 p-2.5 rounded-lg border border-border/50">
                  {professionalResult.originalConcept}
                </p>
              </div>

              <div>
                <span className="font-semibold text-amber-300 block text-[11px] uppercase tracking-wider">
                  Ý tưởng chuyên nghiệp:
                </span>
                <p className="text-text font-medium bg-amber-500/10 p-3 rounded-lg border border-amber-500/30">
                  {professionalResult.professionalConcept}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (onUpdateCreativeConcept) {
                    onUpdateCreativeConcept(professionalResult.professionalConcept);
                  } else {
                    onUpdateCreativeDirection({ composition_layout: professionalResult.professionalConcept });
                  }
                  setProfessionalResult(null);
                }}
                className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-[12px] rounded-lg transition-all shadow-md cursor-pointer"
              >
                [ Dùng ý tưởng này ]
              </button>
              <button
                type="button"
                onClick={() => setProfessionalResult(null)}
                className="py-2 px-3 bg-surface2 hover:bg-surface2/80 text-text2 font-semibold text-[12px] rounded-lg transition-all border border-border cursor-pointer"
              >
                [ Chỉnh sửa ]
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submit CTA */}
      <div className="pt-2 border-t border-border/80">
        <button
          type="button"
          disabled={!canGenerate || isGenerating}
          onClick={onGenerate}
          className="w-full py-4 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-accent/25 flex items-center justify-center gap-2 cursor-pointer outline-none active:scale-[0.99]"
        >
          {isGenerating ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>AI ĐANG TẠO COMMERCIAL VISUAL...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} className="animate-pulse" />
              <span>TẠO visual AI COMMERCIAL</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
