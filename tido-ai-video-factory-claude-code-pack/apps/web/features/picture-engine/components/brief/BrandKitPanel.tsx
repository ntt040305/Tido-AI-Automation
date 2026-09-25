"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Palette, Plus, Pencil, X, Layers } from "lucide-react";
import { useAuth, useAuthedFetch } from "@/features/auth/AuthProvider";
import { BrandIdentity } from "../../types/picture-engine.types";

/**
 * Phase 5.4 — choose, create or edit a Brand Kit.
 *
 * Deliberately small: a selector and a form, not an editor. The kit is stored
 * server-side in the person's workspace; the brief carries only its id, which
 * the render route resolves against the verified person. Signed out, a kit has
 * nobody to belong to, so the panel explains that instead of rendering a form.
 */

interface KitColor {
  hex: string;
  role: "primary" | "secondary" | "accent" | "text" | "background";
}

interface KitSummary {
  id: string;
  org_id: string;
  updated_at: string;
  kit: {
    name: string;
    colors: KitColor[];
    fonts: { heading?: string; body?: string };
    style: { preferred: string[]; forbidden: string[]; typography_preference?: string; references: string[] };
    has_logo: boolean;
  };
}

interface Draft {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  heading: string;
  body: string;
  preferred: string;
  forbidden: string;
  typography: string;
  logo: File | null;
  removeLogo: boolean;
}

const EMPTY: Draft = {
  name: "", primary: "", secondary: "", accent: "", heading: "", body: "",
  preferred: "", forbidden: "", typography: "", logo: null, removeLogo: false,
};

const splitList = (v: string) => v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

function draftOf(k: KitSummary): Draft {
  const hex = (role: KitColor["role"]) => k.kit.colors.find((c) => c.role === role)?.hex || "";
  return {
    name: k.kit.name,
    primary: hex("primary"),
    secondary: hex("secondary"),
    accent: hex("accent"),
    heading: k.kit.fonts.heading || "",
    body: k.kit.fonts.body || "",
    preferred: k.kit.style.preferred.join(", "),
    forbidden: k.kit.style.forbidden.join(", "),
    typography: k.kit.style.typography_preference || "",
    logo: null,
    removeLogo: false,
  };
}

export interface BrandKitPanelProps {
  brandIdentity: BrandIdentity;
  onChange: (updates: Partial<BrandIdentity>) => void;
}

export function BrandKitPanel({ brandIdentity, onChange }: BrandKitPanelProps) {
  const { user, loading } = useAuth();
  const authedFetch = useAuthedFetch();
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedId = brandIdentity.brand_kit_id || "";

  const refresh = useCallback(async () => {
    try {
      const res = await authedFetch("/api/brand-kits");
      if (!res.ok) return;
      const data = await res.json();
      setKits(Array.isArray(data.kits) ? data.kits : []);
    } catch {
      // A kit list that fails to load leaves renders working without one.
    }
  }, [authedFetch]);

  useEffect(() => {
    if (user) void refresh();
    else setKits([]);
  }, [user, refresh]);

  // A kit id from another session or a signed-out state must not ride along.
  useEffect(() => {
    if (!loading && !user && selectedId) onChange({ brand_kit_id: undefined });
  }, [loading, user, selectedId, onChange]);

  if (loading) return null;

  const selected = kits.find((k) => k.id === selectedId) || null;

  async function save() {
    if (!editing) return;
    const d = editing.draft;
    if (!d.name.trim()) {
      setError("Brand Kit cần có tên.");
      return;
    }
    const colors = ([
      ["primary", d.primary],
      ["secondary", d.secondary],
      ["accent", d.accent],
    ] as const)
      .filter(([, hex]) => hex.trim())
      .map(([role, hex]) => ({ role, hex: hex.trim() }));
    const kit = {
      name: d.name.trim(),
      colors,
      fonts: { heading: d.heading.trim() || undefined, body: d.body.trim() || undefined },
      style: {
        preferred: splitList(d.preferred),
        forbidden: splitList(d.forbidden),
        typography_preference: d.typography.trim() || undefined,
        references: [],
      },
    };
    const form = new FormData();
    form.append("kit", JSON.stringify(kit));
    if (d.logo) form.append("logo", d.logo, d.logo.name);
    if (d.removeLogo) form.append("removeLogo", "1");

    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(editing.id ? `/api/brand-kits/${editing.id}` : "/api/brand-kits", {
        method: editing.id ? "PUT" : "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Không lưu được Brand Kit.");
        return;
      }
      await refresh();
      if (data.kit?.id) onChange({ brand_kit_id: data.kit.id });
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full px-3 py-2 bg-surface2/70 border border-borderStrong focus:border-accent rounded-lg text-[12.5px] text-text outline-none";
  const set = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  return (
    <div className="space-y-2.5">
      <label className="text-[13.5px] font-semibold text-text flex items-center gap-1.5">
        <Palette size={15} className="text-accent" />
        <span>Brand Kit</span>
        <span className="text-[11px] font-normal text-text3">(logo, màu, font, phong cách)</span>
      </label>

      {!user ? (
        <p className="text-[12px] text-text3">Đăng nhập để lưu và dùng Brand Kit cho mọi lần tạo ảnh.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => onChange({ brand_kit_id: e.target.value || undefined })}
              className={field}
            >
              <option value="">Không dùng Brand Kit</option>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>{k.kit.name}</option>
              ))}
            </select>
            {selected && (
              <button type="button" title="Sửa" onClick={() => { setError(null); setEditing({ id: selected.id, draft: draftOf(selected) }); }}
                className="px-2.5 rounded-lg border border-borderStrong text-text2 hover:text-text">
                <Pencil size={14} />
              </button>
            )}
            <button type="button" title="Tạo mới" onClick={() => { setError(null); setEditing({ id: null, draft: { ...EMPTY } }); }}
              className="px-2.5 rounded-lg border border-borderStrong text-text2 hover:text-text">
              <Plus size={14} />
            </button>
          </div>

          {selected && !editing && (
            <div className="flex items-center gap-2 text-[11.5px] text-text3">
              {selected.kit.colors.map((c) => (
                <span key={c.hex} title={`${c.role} ${c.hex}`} className="w-4 h-4 rounded border border-borderStrong" style={{ background: c.hex }} />
              ))}
              {selected.kit.has_logo && <span>· có logo</span>}
              {selected.kit.fonts.heading && <span>· {selected.kit.fonts.heading}</span>}
            </div>
          )}

          {editing && (
            <div className="p-3 rounded-xl border border-borderStrong bg-surface2/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-text">{editing.id ? "Sửa Brand Kit" : "Brand Kit mới"}</span>
                <button type="button" onClick={() => setEditing(null)} className="text-text3 hover:text-text"><X size={14} /></button>
              </div>
              <input className={field} placeholder="Tên thương hiệu *" value={editing.draft.name} onChange={(e) => set({ name: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <input className={field} placeholder="Màu chính #hex" value={editing.draft.primary} onChange={(e) => set({ primary: e.target.value })} />
                <input className={field} placeholder="Màu phụ #hex" value={editing.draft.secondary} onChange={(e) => set({ secondary: e.target.value })} />
                <input className={field} placeholder="Màu nhấn #hex" value={editing.draft.accent} onChange={(e) => set({ accent: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className={field} placeholder="Font tiêu đề" value={editing.draft.heading} onChange={(e) => set({ heading: e.target.value })} />
                <input className={field} placeholder="Font nội dung" value={editing.draft.body} onChange={(e) => set({ body: e.target.value })} />
              </div>
              <input className={field} placeholder="Phong cách ưu tiên (cách nhau bởi dấu phẩy)" value={editing.draft.preferred} onChange={(e) => set({ preferred: e.target.value })} />
              <input className={field} placeholder="Phong cách cấm (cách nhau bởi dấu phẩy)" value={editing.draft.forbidden} onChange={(e) => set({ forbidden: e.target.value })} />
              <input className={field} placeholder="Ưu tiên typography (vd: chữ không chân, tối giản)" value={editing.draft.typography} onChange={(e) => set({ typography: e.target.value })} />
              <div className="flex items-center gap-3 text-[12px] text-text2">
                <input type="file" accept="image/*" onChange={(e) => set({ logo: e.target.files?.[0] || null, removeLogo: false })} />
                {editing.id && kits.find((k) => k.id === editing.id)?.kit.has_logo && (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={editing.draft.removeLogo} onChange={(e) => set({ removeLogo: e.target.checked, logo: null })} />
                    Xoá logo
                  </label>
                )}
              </div>
              {error && <p className="text-[12px] text-red-400">{error}</p>}
              <button type="button" disabled={busy} onClick={save}
                className="w-full py-2 rounded-lg bg-accent text-white text-[12.5px] font-semibold disabled:opacity-50">
                {busy ? "Đang lưu..." : "Lưu Brand Kit"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Phase 5.5. Editable export changes how the image is rendered, so it is
          chosen before generating, not after. */}
      {user && (
        <label className="flex items-start gap-2 pt-1 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={brandIdentity.editable_export === true}
            onChange={(e) => onChange({ editable_export: e.target.checked })}
          />
          <span className="text-[12px] text-text2 leading-relaxed">
            <span className="font-semibold text-text flex items-center gap-1.5">
              <Layers size={13} className="text-accent" />
              Xuất file sửa được (PSD, Canva, SVG, Figma)
            </span>
            AI vẽ ảnh nền và sản phẩm; chữ, logo và khối CTA được ghép thành các lớp riêng nên tải về sửa được ở Photoshop hay Canva. Chữ do hệ thống dựng nên trông khác một chút so với chữ do AI vẽ.
          </span>
        </label>
      )}
    </div>
  );
}
