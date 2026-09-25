"use client";

import React, { useState } from "react";
import { FileImage, Layers, Loader2 } from "lucide-react";
import { useAuth, useAuthedFetch } from "@/features/auth/AuthProvider";

/**
 * Phase 5.5 — downloads, with the honest distinction.
 *
 * The PNG is the picture. The other four are the DESIGN: real files whose text,
 * logo and scene are separate layers, built from the stored design document so
 * they open in Photoshop, Canva, Illustrator or Figma with the layers intact.
 *
 * They exist only for a render made in Editable mode, so when there are none
 * this says why rather than offering a button that would fail.
 */

const FORMATS = [
  { id: "psd", label: "Photoshop PSD", hint: "Lớp thật, chữ sửa được" },
  { id: "pptx", label: "Canva (.pptx)", hint: "Nhập vào Canva để sửa" },
  { id: "svg", label: "SVG", hint: "Chữ vector, mở bằng Illustrator/Figma" },
  { id: "figma", label: "Figma JSON", hint: "Node JSON cho plugin" },
] as const;

export interface EditableExportPanelProps {
  generationId?: string;
  /** The render has separate layers stored. */
  editable?: boolean;
}

export function EditableExportPanel({ generationId, editable }: EditableExportPanelProps) {
  const { user } = useAuth();
  const authedFetch = useAuthedFetch();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!generationId) return null;

  async function download(format: string) {
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const res = await authedFetch(`/api/exports/${encodeURIComponent(generationId!)}?format=${format}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Không tải được file.");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `design.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick so the click has taken the URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError("Không tải được file.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/70 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-text3">
        <Layers size={12} />
        <span>File thiết kế (sửa được)</span>
      </div>

      {!editable ? (
        <p className="text-[12px] text-text3 flex items-start gap-1.5">
          <FileImage size={13} className="mt-0.5 shrink-0" />
          <span>
            Ảnh này chỉ có file PNG. Bật <strong className="font-semibold text-text2">Xuất file sửa được</strong> trong brief rồi tạo lại để nhận PSD, Canva, SVG và Figma với từng lớp riêng.
          </span>
        </p>
      ) : !user ? (
        <p className="text-[12px] text-text3">Đăng nhập để tải file thiết kế.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={busy !== null}
                onClick={() => download(f.id)}
                title={f.hint}
                className="py-2 px-3 rounded-xl border border-borderStrong bg-surface2/60 hover:bg-surface2 disabled:opacity-50 text-left transition-colors cursor-pointer outline-none"
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
                  {busy === f.id && <Loader2 size={12} className="animate-spin" />}
                  {f.label}
                </span>
                <span className="block text-[10.5px] text-text3 mt-0.5">{f.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-[10.5px] text-text3">
            Nền và sản phẩm nằm chung một lớp ảnh. Chữ, logo và khối CTA là các lớp riêng, sửa được.
          </p>
        </>
      )}
      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
}
