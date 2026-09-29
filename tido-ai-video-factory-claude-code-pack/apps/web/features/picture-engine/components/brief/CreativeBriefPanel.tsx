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
import { VisualDirectionControlPanel } from "@/components/VisualDirectionControlPanel";
import { BrandIdentityUploader } from "./BrandIdentityUploader";
import { BrandKitPanel } from "./BrandKitPanel";
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
  onUpdateContentMessage: (value: string) => void;
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
  onUpdateMarketingContext,
  onUpdateCreativeDirection,
  onUpdateContentMessage,
  onUpdateBrandIdentity,
  onGenerate,
}: CreativeBriefPanelProps) {
  const currentConcept = brief.creative_concept || brief.user_notes || "";
  const currentProductCount = brief.creative_direction?.target_product_count ?? 1;
  const currentAspectRatio = brief.creative_direction?.aspect_ratio ?? "4:5";
  const currentIndustry = brief.marketing_context?.industry || "";

  const [isProfessionalizing, setIsProfessionalizing] = useState(false);
  const [professionalResult, setProfessionalResult] = useState<{
    originalConcept: string;
    professionalConcept: string;
    /**
     * The thinking behind the polished paragraph, when the model produced it.
     *
     * A single improved paragraph reads well and teaches nothing — the user
     * sees that their idea got better but not what was decided, so they cannot
     * keep the angle and drop the styling. Fields the model had no basis for
     * are absent, never blank rows.
     */
    brief?: {
      audience?: string;
      emotion?: string;
      creative_angle?: string;
      visual_story?: string;
      visual_direction?: string;
      execution_reasoning?: string;
    };
  } | null>(null);

  const INDUSTRY_OPTIONS: Array<{ id: string; label: string; icon: string }> = [
    { id: "beauty_skincare", label: "Làm đẹp & Skincare", icon: "✨" },
    { id: "food_beverage", label: "Ẩm thực & F&B", icon: "🍽️" },
    { id: "coffee_tea", label: "Cà phê & Trà", icon: "☕" },
    { id: "fashion_apparel", label: "Thời trang & Phụ kiện", icon: "👗" },
    { id: "electronics_tech", label: "Công nghệ & Điện tử", icon: "⚡" },
    { id: "fmcg", label: "Hàng tiêu dùng (FMCG)", icon: "📦" },
    { id: "home_lifestyle", label: "Nhà cửa & Đời sống", icon: "🏡" },
    { id: "other", label: "Khác / Đa ngành", icon: "🌐" },
  ];

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
          ...(data.brief ? { brief: data.brief } : {}),
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

      {/* 0. Industry / Category Context */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
            <span aria-hidden>🏢</span>
            <span>Ngành hàng & Lĩnh vực (Industry Context)</span>
          </label>
          <span className="text-[11px] text-text3 font-medium">
            Ngữ cảnh thị trường, không áp đặt phong cách
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {INDUSTRY_OPTIONS.map((opt) => {
            const isActive = currentIndustry === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onUpdateMarketingContext({ industry: opt.id })}
                className={`py-2 px-3 rounded-xl border text-[12.5px] font-medium transition-all cursor-pointer outline-none flex items-center gap-2 ${
                  isActive
                    ? "bg-accent/15 border-accent text-white shadow-sm ring-1 ring-accent/40 font-semibold"
                    : "bg-surface2/60 border-borderStrong text-text2 hover:bg-surface2 hover:text-text"
                }`}
              >
                <span>{opt.icon}</span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
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

      {/* 4b. Brand Kit (Phase 5.4) */}
      <BrandKitPanel
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

              {/* The reasoning, when there is any.
                  Rendered row by row so an absent field simply does not
                  appear — a labelled empty row would read as a system that
                  decided nothing, which is worse than saying less. */}
              {professionalResult.brief &&
                Object.keys(professionalResult.brief).length > 0 && (
                  <div className="pt-1 space-y-2">
                    {(
                      [
                        ["audience", "Người xem"],
                        ["emotion", "Cảm xúc"],
                        ["creative_angle", "Góc sáng tạo"],
                        ["visual_story", "Câu chuyện hình ảnh"],
                        ["visual_direction", "Hướng hình ảnh"],
                        ["execution_reasoning", "Vì sao chọn cách này"],
                      ] as const
                    ).map(([key, label]) => {
                      const value = professionalResult.brief?.[key];
                      if (!value) return null;
                      return (
                        <div key={key} className="flex gap-2.5">
                          <span className="text-[10.5px] font-mono text-text3 uppercase tracking-wider shrink-0 w-[92px] pt-[2px]">
                            {label}
                          </span>
                          <p className="text-[12px] text-text2 leading-relaxed flex-1">
                            {value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                [ Áp dụng ý tưởng ]
              </button>
              <button
                type="button"
                onClick={() => setProfessionalResult(null)}
                className="py-2 px-3 bg-surface2 hover:bg-surface2/80 text-text2 font-semibold text-[12px] rounded-lg transition-all border border-border cursor-pointer"
              >
                [ Giữ ý tưởng ban đầu ]
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content Message.
          Sits between the concept and the visual direction because that is the
          order the questions actually come in: what the campaign is, then what
          the image has to say, then how it should look. Optional — a user who
          wants no text simply leaves it empty, and a user who wants text no
          longer has to bury it inside their creative brief. */}
      <div className="space-y-2">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <span aria-hidden>📝</span>
          <span>Nội dung muốn xuất hiện trên ảnh</span>
          <span className="text-text3 font-normal">(Optional)</span>
        </label>
        <p className="text-[11.5px] text-text3 leading-relaxed">
          Nhập chính xác chữ bạn muốn xuất hiện trên ảnh, mỗi dòng một nội dung. AI chỉ quyết định
          cách trình bày, giữ nguyên từng chữ bạn nhập. Nếu để trống, ảnh sẽ không có chữ.
        </p>
        <textarea
          value={brief.content_message || ""}
          onChange={(e) => onUpdateContentMessage(e.target.value)}
          rows={3}
          placeholder={[
            "Khai trương giảm 20%",
            "Mua 2 tặng 1",
            "Ưu đãi tháng này",
            "Ra mắt sản phẩm mới",
            "Địa chỉ / Website / Hotline",
          ].join("\n")}
          className="w-full bg-surface2/60 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 leading-relaxed focus:border-text2 outline-none resize-y placeholder:text-text3/70"
        />
      </div>

      {/* Visual Direction Plan — Phase 4.1.5.
          Last, deliberately. The AI has read the assets, the concept and the
          format by this point, so it can show what it intends to do rather than
          asking the user to specify it up front. */}
      <VisualDirectionControlPanel
        value={brief.creative_direction?.visual_controls || {}}
        onChange={(next) => onUpdateCreativeDirection({ visual_controls: next })}
        concept={brief.creative_concept || brief.user_notes || ""}
        assetType={brief.asset_type}
      />

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
