"use client";

import React, { useRef } from "react";
import { BrandIdentity, BrandAsset } from "../../types/picture-engine.types";
import { Image, Upload, X, ShieldCheck, Tag } from "lucide-react";

export interface BrandIdentityUploaderProps {
  brandIdentity: BrandIdentity;
  onChange: (updates: Partial<BrandIdentity>) => void;
}

export function BrandIdentityUploader({
  brandIdentity,
  onChange,
}: BrandIdentityUploaderProps) {
  const productInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function handleProductFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const newAssets: BrandAsset[] = Array.from(e.target.files).map(
        (file, idx) => ({
          asset_id: `asset_prod_${Date.now()}_${idx}`,
          type: "product_hero",
          file_url: URL.createObjectURL(file),
          filename: file.name,
          file,
        })
      );
      onChange({
        product_assets: [...brandIdentity.product_assets, ...newAssets],
      });
      e.target.value = "";
    }
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const logoAsset: BrandAsset = {
        asset_id: `asset_logo_${Date.now()}`,
        type: "logo",
        file_url: URL.createObjectURL(file),
        filename: file.name,
        file,
      };
      onChange({ logo_asset: logoAsset });
      e.target.value = "";
    }
  }

  function removeProductAsset(assetId: string) {
    onChange({
      product_assets: brandIdentity.product_assets.filter(
        (a) => a.asset_id !== assetId
      ),
    });
  }

  function removeLogoAsset() {
    onChange({ logo_asset: undefined });
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-accent" />
          <span>Bước 5: Nhận diện Thương hiệu & Tài sản Sản phẩm</span>
        </label>
      </div>

      {/* Brand Name Input */}
      <div>
        <label className="block text-[12.5px] font-medium text-text2 mb-1 flex items-center gap-1">
          <Tag size={13} />
          <span>Tên Thương hiệu (Brand Name)</span>
        </label>
        <input
          type="text"
          value={brandIdentity.brand_name}
          onChange={(e) => onChange({ brand_name: e.target.value })}
          placeholder="Ví dụ: TIDO Cafe"
          className="w-full bg-surface2 border border-borderStrong text-text rounded-xl text-[13px] px-3.5 py-2.5 focus:border-accent outline-none font-medium"
        />
      </div>

      {/* Required Product Hero Image Upload */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12.5px] font-medium text-text flex items-center gap-1">
            <Image size={13} className="text-accent" />
            <span>Ảnh Sản phẩm Chủ đạo (Required)</span>
            <span className="text-accent">*</span>
          </label>
          <span className="text-[11px] font-mono text-text3">
            {brandIdentity.product_assets.length} ảnh
          </span>
        </div>

        <input
          ref={productInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={handleProductFiles}
          className="hidden"
        />

        <div
          onClick={() => productInputRef.current?.click()}
          className="border-2 border-dashed border-borderStrong hover:border-accent bg-surface2/40 hover:bg-surface2 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200"
        >
          <Upload size={20} className="text-text3 mb-1.5" />
          <div className="text-[12.5px] font-medium text-text">
            Tải lên ảnh sản phẩm thực tế
          </div>
          <div className="text-[10.5px] text-text3 mt-0.5 font-mono">
            PNG, JPG, WEBP (Khóa diện mạo sản phẩm AI)
          </div>
        </div>

        {/* Product Asset Thumbnails */}
        {brandIdentity.product_assets.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {brandIdentity.product_assets.map((asset) => (
              <div
                key={asset.asset_id}
                className="relative aspect-square bg-surface border border-borderStrong rounded-lg overflow-hidden group"
              >
                <img
                  src={asset.file_url}
                  alt="Product asset"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeProductAsset(asset.asset_id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optional Brand Logo Upload */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12.5px] font-medium text-text2">
            Logo Thương hiệu (Optional)
          </label>
        </div>

        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/svg+xml"
          onChange={handleLogoFile}
          className="hidden"
        />

        {brandIdentity.logo_asset ? (
          <div className="relative w-24 h-16 bg-surface border border-borderStrong rounded-xl overflow-hidden p-2 flex items-center justify-center group">
            <img
              src={brandIdentity.logo_asset.file_url}
              alt="Logo"
              className="max-w-full max-h-full object-contain"
            />
            <button
              type="button"
              onClick={removeLogoAsset}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="w-full py-2.5 px-3 bg-surface2/60 hover:bg-surface2 border border-borderStrong rounded-xl text-[12px] text-text2 hover:text-text flex items-center justify-center gap-1.5 transition-colors cursor-pointer outline-none font-mono"
          >
            <Upload size={14} />
            <span>Tải lên Logo (PNG tách nền / SVG)</span>
          </button>
        )}
      </div>
    </div>
  );
}
