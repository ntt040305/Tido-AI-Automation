"use client";

import React, { useEffect, useState } from "react";
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
import { CreativeApproachControl } from "./CreativeApproachControl";
import { MarketingContextForm } from "./MarketingContextForm";
import { Sparkles, FileText, Package, Ratio, Lightbulb, Check, ChevronDown, Target } from "lucide-react";
import { VmcButton, VmcTallyDot, VmcBadge } from "@/components/vmc";

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
  const currentAspectRatio = brief.creative_direction?.aspect_ratio ?? "1:1";
  const currentIndustry = brief.marketing_context?.industry || "";

  // Split exactly as `SimpleInputAdapterService.ts:311-315` splits it, so the
  // veto the browser shows is computed from the same string count the server will
  // see.
  const contentMessageLines = React.useMemo(
    () =>
      String(brief.content_message || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    [brief.content_message],
  );

  // The selected Brand Kit's preferred styles, lifted out of BrandKitPanel.
  //
  // Step 3 of the creative-approach precedence reads brand style, and the brief
  // carries only `brand_kit_id` — so without this the badge under the control
  // would disagree with the server for any kit whose style says something the
  // concept does not. A preview only: the server recomputes the decision from the
  // kit it loads itself (`generate-simple/route.ts:94`) and never reads this.
  const [brandStylePreferred, setBrandStylePreferred] = useState<string[] | undefined>(undefined);
  const handleBrandStyle = React.useCallback(
    (preferred: string[] | null) => setBrandStylePreferred(preferred || undefined),
    [],
  );

  // Collapsed by default. Objective and audience are worth 0.40 of the route
  // score (`DirectionEvaluator.ts:137-144`) and were unreachable because this
  // panel never mounted the form that writes them — but they are still optional
  // context, and must not become a wall between the user and the render button.
  const [isCampaignContextOpen, setIsCampaignContextOpen] = useState(false);

  const [isProfessionalizing, setIsProfessionalizing] = useState(false);
  const [professionalResult, setProfessionalResult] = useState<{
    originalConcept: string;
    professionalConcept: string;
    brief?: {
      audience?: string;
      emotion?: string;
      creative_angle?: string;
      visual_story?: string;
      visual_direction?: string;
      execution_reasoning?: string;
    };
  } | null>(null);

  const INDUSTRY_OPTIONS: Array<{ id: string; label: string }> = [
    { id: "beauty_skincare", label: "Làm đẹp & Skincare" },
    { id: "food_beverage", label: "Ẩm thực & F&B" },
    { id: "coffee_tea", label: "Cà phê & Trà" },
    { id: "fashion_apparel", label: "Thời trang & Phụ kiện" },
    { id: "electronics_tech", label: "Công nghệ & Điện tử" },
    { id: "fmcg", label: "Hàng tiêu dùng (FMCG)" },
    { id: "home_lifestyle", label: "Nhà cửa & Đời sống" },
    { id: "other", label: "Khác / Đa ngành" },
  ];

  const PRODUCT_COUNT_OPTIONS: Array<{ label: string; value: number | "multiple" }> = [
    { label: "1 sản phẩm", value: 1 },
    { label: "2 sản phẩm", value: 2 },
    { label: "3 sản phẩm", value: 3 },
    { label: "Nhiều sản phẩm", value: "multiple" },
  ];

  const ASPECT_RATIO_OPTIONS: AspectRatioType[] = ["1:1", "9:16", "16:9"];

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

  // With PROMPT_ENGINE=v2 the creative director runs on every render, so this
  // button would pay for a second opinion nobody reads. Asked once, server-side,
  // because the flag lives on the server.
  const [ideationAvailable, setIdeationAvailable] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/image/concept-professionalize")
      .then((r) => (r.ok ? r.json() : { available: true }))
      .then((d) => {
        if (alive && d && typeof d.available === "boolean") setIdeationAvailable(d.available);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
    <div className="bg-surface border border-border rounded-[2px] p-5 shadow-card space-y-5 text-left">
      {/* Panel Top Title */}
      <div className="flex items-center justify-between pb-3.5 border-b border-border">
        <div>
          <div className="text-[10.5px] font-mono text-text-telemetry uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <FileText size={12} />
            <span>AI COMMERCIAL VISUAL STUDIO</span>
          </div>
          <h2 className="text-[16px] font-bold text-text tracking-tight mt-0.5 font-sans">
            Yêu cầu Sản xuất Visual AI
          </h2>
        </div>
      </div>

      {/* 0. Industry / Category Context */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5">
            <span>NGÀNH HÀNG (INDUSTRY CONTEXT)</span>
          </label>
          <span className="text-[10px] text-text-telemetry font-mono">
            Thị trường mục tiêu
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {INDUSTRY_OPTIONS.map((opt) => {
            const isActive = currentIndustry === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onUpdateMarketingContext({ industry: opt.id })}
                className={`px-3 py-1.5 rounded-[2px] border text-[12px] font-sans transition-colors cursor-pointer outline-none ${
                  isActive
                    ? "bg-text text-bg border-text font-semibold"
                    : "bg-surface2 border-border text-text-muted hover:border-borderStrong hover:text-text"
                }`}
              >
                {opt.label}
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
      <div className="space-y-2">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5">
          <Package size={13} />
          <span>SỐ LƯỢNG SẢN PHẨM TRONG ẢNH</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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
                className={`py-2 px-2.5 rounded-[2px] border text-[12px] font-sans transition-colors cursor-pointer outline-none ${
                  isActive
                    ? "bg-surface3 border-borderStrong text-text font-bold"
                    : "bg-surface2 border-border text-text-muted hover:border-borderStrong hover:text-text"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Aspect Ratio */}
      <div className="space-y-2">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5">
          <Ratio size={13} />
          <span>TỶ LỆ KHUNG HÌNH (ASPECT RATIO)</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {ASPECT_RATIO_OPTIONS.map((ratio) => {
            const isActive = currentAspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => handleAspectRatioSelect(ratio)}
                className={`py-2 px-2.5 rounded-[2px] border text-[12px] font-mono font-semibold transition-colors cursor-pointer outline-none ${
                  isActive
                    ? "bg-surface3 border-borderStrong text-text font-bold"
                    : "bg-surface2 border-border text-text-muted hover:border-borderStrong hover:text-text"
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

      {/* 4b. Brand Kit */}
      <BrandKitPanel
        brandIdentity={brief.brand_identity}
        onChange={onUpdateBrandIdentity}
        onSelectedStyleChange={handleBrandStyle}
      />

      {/* 5. Creative Concept (Large Textarea) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5">
            <Lightbulb size={13} className="text-ai-gold" />
            <span>Ý TƯỞNG CREATIVE COMMERCIAL (CONCEPT)</span>
          </label>
          <span className="text-[10px] font-mono text-ai-gold uppercase">
            BẮT BUỘC
          </span>
        </div>
        <textarea
          rows={4}
          value={currentConcept}
          onChange={handleConceptChange}
          placeholder="Mô tả ý tưởng của bạn: Góc máy, ánh sáng, môi trường, cảm xúc, màu sắc, phong cách... (Ví dụ: Chai serum cao cấp đặt trên bệ đá obsidian đen mờ, ánh sáng studio nghệ thuật tương phản cao, góc chụp 85mm...)"
          className="w-full p-3 bg-surface2 border border-border rounded-[2px] text-[13px] font-sans text-text placeholder:text-text-telemetry focus:outline-none focus:border-borderStrong transition-colors resize-none leading-relaxed"
        />

        {/* Concept Professionalizer Button */}
        <div className="pt-1 space-y-1.5" hidden={!ideationAvailable}>
          <button
            type="button"
            disabled={!currentConcept.trim() || isGenerating || isProfessionalizing}
            onClick={handleProfessionalize}
            className="w-full py-2 px-3 bg-surface2 border border-ai-gold/40 hover:bg-surface3 disabled:opacity-40 disabled:cursor-not-allowed text-ai-gold font-sans font-semibold text-[12.5px] rounded-[2px] transition-colors flex items-center justify-center gap-2 cursor-pointer outline-none"
          >
            {isProfessionalizing ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-ai-gold border-t-transparent animate-spin" />
                <span>Đang phát triển ý tưởng quảng cáo chuyên nghiệp...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-ai-gold" />
                <span>Nâng cấp Brief chuyên nghiệp (AI Reasoning)</span>
              </>
            )}
          </button>
          <p className="text-[10.5px] font-mono text-text-telemetry text-center leading-tight">
            AI phân tích 6 chiều sáng tạo và nâng tầm từ khoá prompt.
          </p>
        </div>

        {/* Professional Concept Comparison UI */}
        {professionalResult && (
          <div className="mt-2.5 p-3.5 bg-surface border border-ai-gold/40 rounded-[2px] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-mono text-[11px] font-bold text-ai-gold flex items-center gap-1.5 uppercase">
                <Sparkles size={13} />
                <span>Gợi ý Concept Quảng Cáo Chuyên Nghiệp</span>
              </span>
              <button
                type="button"
                onClick={() => setProfessionalResult(null)}
                className="text-[11px] font-mono text-text-telemetry hover:text-text cursor-pointer"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="space-y-2 text-[12.5px] leading-relaxed">
              <div>
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-telemetry block mb-1">
                  Ý tưởng ban đầu:
                </span>
                <p className="text-text-muted italic bg-surface2 p-2.5 rounded-[2px] border border-border">
                  {professionalResult.originalConcept}
                </p>
              </div>

              <div>
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-ai-gold block mb-1">
                  Ý tưởng chuyên nghiệp đã tối ưu:
                </span>
                <p className="text-text font-medium bg-surface2 p-2.5 rounded-[2px] border border-ai-gold/30">
                  {professionalResult.professionalConcept}
                </p>
              </div>

              {professionalResult.brief &&
                Object.keys(professionalResult.brief).length > 0 && (
                  <div className="pt-1.5 space-y-1.5 border-t border-border">
                    {(
                      [
                        ["audience", "Người xem"],
                        ["emotion", "Cảm xúc"],
                        ["creative_angle", "Góc sáng tạo"],
                        ["visual_story", "Câu chuyện hình ảnh"],
                        ["visual_direction", "Hướng hình ảnh"],
                        ["execution_reasoning", "Lý do lựa chọn"],
                      ] as const
                    ).map(([key, label]) => {
                      const value = professionalResult.brief?.[key];
                      if (!value) return null;
                      return (
                        <div key={key} className="flex gap-2">
                          <span className="font-mono text-[10.5px] text-text-telemetry uppercase tracking-wider shrink-0 w-[95px]">
                            {label}:
                          </span>
                          <p className="text-[12px] text-text-muted leading-relaxed flex-1">
                            {value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <VmcButton
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  if (onUpdateCreativeConcept) {
                    onUpdateCreativeConcept(professionalResult.professionalConcept);
                  } else {
                    onUpdateCreativeDirection({ composition_layout: professionalResult.professionalConcept });
                  }
                  setProfessionalResult(null);
                }}
              >
                [ Áp dụng ý tưởng ]
              </VmcButton>
              <VmcButton
                variant="ghost"
                size="sm"
                onClick={() => setProfessionalResult(null)}
              >
                [ Giữ ý tưởng ban đầu ]
              </VmcButton>
            </div>
          </div>
        )}
      </div>

      {/* 5b. Creative Approach
           Directly under the concept, because it modifies the concept. */}
      <CreativeApproachControl
        value={brief.creative_direction?.creative_approach}
        onChange={(next) => onUpdateCreativeDirection({ creative_approach: next })}
        concept={currentConcept}
        assetType={brief.asset_type}
        objective={brief.marketing_context?.objective}
        copyStrings={contentMessageLines}
        brandStylePreferred={brandStylePreferred}
      />

      {/* 5c. Campaign context — the form that existed and was never mounted.
           `MarketingContextForm` has carried the objective and audience controls
           since Phase 4.1 (`MarketingContextForm.tsx:26-30`, `:97-98`) and this
           panel never imported it, so `AIStrategyPanel.tsx:73` always printed
           "Chưa nhập đối tượng cụ thể". Industry is excluded: this panel renders
           its own selector for it at the top. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setIsCampaignContextOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer outline-none group"
        >
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center gap-1.5 group-hover:text-text">
            <Target size={13} />
            <span>Bối cảnh chiến dịch (không bắt buộc)</span>
          </span>
          <ChevronDown
            size={14}
            className={`text-text-telemetry transition-transform ${isCampaignContextOpen ? "rotate-180" : ""}`}
          />
        </button>

        {!isCampaignContextOpen && (
          <p className="text-[11.5px] text-text3 leading-relaxed px-1">
            Mục tiêu và đối tượng giúp AI chọn hướng sáng tạo sát hơn. Bỏ trống cũng được.
          </p>
        )}

        {isCampaignContextOpen && (
          <div className="border border-borderStrong rounded-xl p-4 bg-surface2/30">
            <MarketingContextForm
              context={brief.marketing_context}
              onChange={onUpdateMarketingContext}
              fields={["objective", "target_audience"]}
              showHeader={false}
            />
          </div>
        )}
      </div>

      {/* 6. Content Message */}
      <div className="space-y-1.5">
        <label className="font-mono text-[11px] uppercase tracking-wider text-text-telemetry flex items-center justify-between">
          <span>NỘI DUNG CHỮ TRÊN ẢNH (CONTENT MESSAGE)</span>
          <span className="text-[10px] lowercase text-text-muted">(không bắt buộc)</span>
        </label>
        <textarea
          value={brief.content_message || ""}
          onChange={(e) => onUpdateContentMessage(e.target.value)}
          rows={2}
          placeholder="Nhập chính xác chữ bạn muốn xuất hiện trên ảnh (ví dụ: Ra mắt dòng sản phẩm mới • Khai trương 20%)..."
          className="w-full bg-surface2 border border-border text-text rounded-[2px] text-[12.5px] p-2.5 focus:outline-none focus:border-borderStrong transition-colors resize-none placeholder:text-text-telemetry"
        />
      </div>

      {/* 7. Visual Direction Controls */}
      <VisualDirectionControlPanel
        value={brief.creative_direction?.visual_controls || {}}
        onChange={(next) => onUpdateCreativeDirection({ visual_controls: next })}
        concept={brief.creative_concept || brief.user_notes || ""}
        assetType={brief.asset_type}
      />

      {/* 8. Submit CTA */}
      <div className="pt-2 border-t border-border">
        <VmcButton
          variant="primary"
          size="lg"
          isLoading={isGenerating}
          disabled={!canGenerate || isGenerating}
          onClick={onGenerate}
          className="w-full"
          icon={<Sparkles size={16} />}
        >
          {isGenerating ? "AI ĐANG TẠO COMMERCIAL VISUAL..." : "KÍCH HOẠT COMMERCIAL VISUAL (RENDER)"}
        </VmcButton>
      </div>
    </div>
  );
}
