"use client";

import React from "react";
import {
  CreativeBrief,
  AssetType,
  MarketingContext,
  SalesContext,
  CreativeDirection,
  BrandIdentity,
} from "../../types/picture-engine.types";
import { AssetTypeSelector } from "./AssetTypeSelector";
import { MarketingContextForm } from "./MarketingContextForm";
import { SalesContextForm } from "./SalesContextForm";
import { CreativeDirectionSelector } from "./CreativeDirectionSelector";
import { BrandIdentityUploader } from "./BrandIdentityUploader";
import { Sparkles, FileText } from "lucide-react";

export interface CreativeBriefPanelProps {
  brief: CreativeBrief;
  canGenerate: boolean;
  isGenerating: boolean;
  onUpdateAssetType: (type: AssetType) => void;
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
  onUpdateMarketingContext,
  onUpdateSalesContext,
  onUpdateCreativeDirection,
  onUpdateBrandIdentity,
  onGenerate,
}: CreativeBriefPanelProps) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/80">
        <div>
          <div className="text-[11px] font-mono text-accent uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <FileText size={13} />
            <span>CREATIVE BRIEF SYSTEM</span>
          </div>
          <h2 className="text-[18px] font-bold text-text tracking-tight mt-0.5">
            Yêu cầu Sản xuất Marketing
          </h2>
        </div>
      </div>

      {/* Step 1: Asset Type Selector */}
      <AssetTypeSelector
        selected={brief.asset_type}
        onChange={onUpdateAssetType}
      />

      {/* Step 2: Marketing Context */}
      <MarketingContextForm
        context={brief.marketing_context}
        onChange={onUpdateMarketingContext}
      />

      {/* Step 3: Sales Context */}
      <SalesContextForm
        salesContext={brief.sales_context}
        onChange={onUpdateSalesContext}
      />

      {/* Step 4: Creative Direction */}
      <CreativeDirectionSelector
        direction={brief.creative_direction}
        onChange={onUpdateCreativeDirection}
      />

      {/* Step 5: Brand Identity & Product Upload */}
      <BrandIdentityUploader
        brandIdentity={brief.brand_identity}
        onChange={onUpdateBrandIdentity}
      />

      {/* Primary Submit CTA */}
      <div className="pt-4 border-t border-border/80">
        <button
          type="button"
          disabled={!canGenerate || isGenerating}
          onClick={onGenerate}
          className="w-full py-4 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-[15px] rounded-xl transition-all shadow-lg shadow-accent/25 flex items-center justify-center gap-2 cursor-pointer outline-none active:scale-[0.99]"
        >
          {isGenerating ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>ĐANG TỔNG HỢP VISUAL...</span>
            </>
          ) : (
            <>
              <Sparkles size={18} className="animate-pulse" />
              <span>TẠO ẢNH COMMERCIAL</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
