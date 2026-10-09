"use client";

import React, { useRef, useState } from "react";
import { BrandIdentity, BrandAsset } from "../../types/picture-engine.types";
import { IMAGE_ENGINE_CONFIG } from "@/lib/image-engine/config";
import { checkIntake } from "@/lib/image-engine/service/intake-limits";
import { activeProfile } from "@/lib/image-engine/models/image-model-profiles";
import { Image, Upload, X, ShieldCheck, Tag, Sparkles } from "lucide-react";

export interface BrandIdentityUploaderProps {
  brandIdentity: BrandIdentity;
  onChange: (updates: Partial<BrandIdentity>) => void;
}

/**
 * The same numbers the route enforces, from the same constant.
 *
 * Checked here as well as there so a person is told before they wait for an upload,
 * and there as well as here because a request can arrive without this control.
 * Neither side may be stricter than the other, which is why there is one source.
 */
const LIMITS = IMAGE_ENGINE_CONFIG.INTAKE_LIMITS;

/**
 * The active model's per-call image ceiling.
 *
 * Read from the profile, not restated: if a model with a higher ceiling becomes
 * active, this sentence changes with it rather than becoming a lie on screen.
 */
const MAX_REFERENCES = activeProfile().maxReferences;

export function BrandIdentityUploader({
  brandIdentity,
  onChange,
}: BrandIdentityUploaderProps) {
  const productInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const [limitError, setLimitError] = useState<string | null>(null);

  // How many images the active model takes in one call, and what happens to the rest.
  //
  // The provider's ceiling is two; more than that are packed into two reference
  // sheets by `allocateReferences` rather than dropped. A person attaching five
  // photographs should know that before they wonder why the render looks the way it
  // does.
  const attachedCount =
    brandIdentity.product_assets.length + (brandIdentity.logo_asset ? 1 : 0);
  const packingNote =
    attachedCount > MAX_REFERENCES
      ? `Model hiện tại nhận tối đa ${MAX_REFERENCES} ảnh mỗi lần: ${attachedCount} ảnh sẽ được ghép thành ${MAX_REFERENCES} tấm tham chiếu.`
      : null;

  /**
   * Refuses the whole selection rather than keeping part of it.
   *
   * Taking the first eight of nine photographs would lose the ninth with no trace,
   * which is exactly the silent loss the packing work exists to prevent.
   */
  function withinLimits(
    label: string,
    incoming: File[],
    existing: number,
    max: number,
    types: readonly string[],
  ): boolean {
    const problem = checkIntake(
      [{ label, items: [...Array(existing).fill({ size: 0, type: "" }), ...incoming], max, types }],
      LIMITS,
    );
    setLimitError(problem ? problem.message_vi : null);
    return !problem;
  }

  function handleProductFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      if (!withinLimits("ảnh sản phẩm", incoming, brandIdentity.product_assets.length, LIMITS.maxProductImages, LIMITS.acceptedMimeTypes)) {
        e.target.value = "";
        return;
      }
      const newAssets: BrandAsset[] = incoming.map(
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
      if (!withinLimits("ảnh logo", [file], 0, LIMITS.maxLogoImages, LIMITS.acceptedLogoMimeTypes)) {
        e.target.value = "";
        return;
      }
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

  function handleInspirationFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      if (!withinLimits("ảnh phong cách", incoming, (brandIdentity.reference_assets || []).length, LIMITS.maxStyleImages, LIMITS.acceptedMimeTypes)) {
        e.target.value = "";
        return;
      }
      const newAssets: BrandAsset[] = incoming.map(
        (file, idx) => ({
          asset_id: `asset_style_${Date.now()}_${idx}`,
          type: "style_reference",
          file_url: URL.createObjectURL(file),
          filename: file.name,
          file,
        })
      );
      const existing = brandIdentity.reference_assets || [];
      onChange({
        reference_assets: [...existing, ...newAssets],
      });
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

  function removeInspirationAsset(assetId: string) {
    const existing = brandIdentity.reference_assets || [];
    onChange({
      reference_assets: existing.filter((a) => a.asset_id !== assetId),
    });
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
            PNG, JPG, WEBP — tối đa {LIMITS.maxProductImages} ảnh
          </div>
        </div>

        {/* Refused, with the number, so the next attempt can succeed. */}
        {limitError && (
          <p className="text-[11.5px] leading-relaxed px-2 py-1.5 rounded-[2px] border border-red-500/40 bg-red-500/10 text-red-200">
            {limitError}
          </p>
        )}

        {/* What happens when more images arrive than the model takes in one call.
            Said here, next to the uploader, because this is where the decision to
            attach a ninth photograph is made. */}
        {packingNote && (
          <p className="text-[11.5px] text-text3 leading-relaxed px-1">{packingNote}</p>
        )}

        {/* Product Asset Thumbnails */}
        {brandIdentity.product_assets.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {brandIdentity.product_assets.map((asset, index) => (
              <div
                key={asset.asset_id}
                className="relative aspect-square bg-surface border border-borderStrong rounded-lg overflow-hidden group"
              >
                <img
                  src={asset.file_url}
                  alt={`Sản phẩm ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* The number, shown. It is how the person refers to this product
                    everywhere else — in the per-product text field below, and as
                    "Image N" in the prompt the renderer receives. Without it on the
                    thumbnail there is nothing connecting the two. */}
                <span className="absolute top-1 left-1 min-w-5 h-5 px-1.5 rounded-full bg-text text-bg text-[11px] font-bold font-mono flex items-center justify-center">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeProductAsset(asset.asset_id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  aria-label={`Xoá sản phẩm ${index + 1}`}
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

      {/* Optional Inspiration / Style Reference Upload */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12.5px] font-medium text-text2 flex items-center gap-1">
            <Sparkles size={13} className="text-accent" />
            <span>Ảnh ý tưởng / Phong cách Visual (Optional)</span>
          </label>
          <span className="text-[11px] font-mono text-text3">
            {(brandIdentity.reference_assets || []).length} ảnh
          </span>
        </div>

        <input
          ref={inspirationInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          onChange={handleInspirationFiles}
          className="hidden"
        />

        <div
          onClick={() => inspirationInputRef.current?.click()}
          className="border border-dashed border-borderStrong hover:border-accent bg-surface2/40 hover:bg-surface2 rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200"
        >
          <Upload size={16} className="text-text3 mb-1" />
          <div className="text-[12px] font-medium text-text">
            Tải lên ảnh ý tưởng (Học bố cục, ánh sáng, tone màu)
          </div>
          <div className="text-[10px] text-text3 mt-0.5 font-mono">
            Không thay đổi hình dáng / bao bì sản phẩm chính
          </div>
        </div>

        {/* Inspiration Reference Thumbnails */}
        {brandIdentity.reference_assets && brandIdentity.reference_assets.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-2">
            {brandIdentity.reference_assets.map((asset) => (
              <div
                key={asset.asset_id}
                className="relative aspect-square bg-surface border border-borderStrong rounded-lg overflow-hidden group"
              >
                <img
                  src={asset.file_url}
                  alt="Inspiration reference"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeInspirationAsset(asset.asset_id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
