"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────
interface FormData {
  // Step 1
  projectName: string;
  clientName: string;
  platform: string[];
  duration: "15s" | "30s";
  // Step 2
  productName: string;
  productDescription: string;
  offer: string;
  cta: string;
  scenePurpose: string;
  // Step 3
  brandColor: string;
  brandFont: string;
  logoUrl: string;
  referenceUrls: string;
  // Step 4
  brief: string;
  targetAudience: string;
  budgetCap: string;
  emotionTarget: string;
}

const INITIAL: FormData = {
  projectName: "", clientName: "", platform: [], duration: "30s",
  productName: "", productDescription: "", offer: "", cta: "", scenePurpose: "",
  brandColor: "#7c5af0", brandFont: "Inter", logoUrl: "", referenceUrls: "",
  brief: "", targetAudience: "", budgetCap: "5", emotionTarget: "",
};

const PLATFORMS = [
  { id: "TikTok", icon: "🎵", color: "#ff0050" },
  { id: "Reels", icon: "📸", color: "#c13584" },
  { id: "Shorts", icon: "▶", color: "#ff0000" },
];

const PURPOSES = ["Hook", "Retention", "CTA", "Awareness", "Product Demo"];
const EMOTIONS = ["Hứng khởi 🔥", "Ấm áp 🤗", "Chuyên nghiệp 💼", "Nhẹ nhàng 🌸", "Đam mê ❤️", "Vui vẻ 😊"];

const STEPS = [
  { num: 1, label: "Thông tin cơ bản" },
  { num: 2, label: "Sản phẩm & CTA" },
  { num: 3, label: "Brand Assets" },
  { num: 4, label: "Brief & Mục tiêu" },
  { num: 5, label: "Xác nhận & Gửi" },
];

// ── Validation ─────────────────────────────────────────────
function validate(step: number, data: FormData): string[] {
  const errors: string[] = [];
  if (step === 1) {
    if (!data.projectName.trim()) errors.push("Tên dự án là bắt buộc");
    if (!data.clientName.trim()) errors.push("Tên khách hàng là bắt buộc");
    if (data.platform.length === 0) errors.push("Chọn ít nhất 1 platform");
  }
  if (step === 2) {
    if (!data.productName.trim()) errors.push("Tên sản phẩm là bắt buộc");
    if (!data.cta.trim()) errors.push("CTA là bắt buộc");
    if (!data.scenePurpose) errors.push("Mục tiêu scene là bắt buộc");
  }
  if (step === 4) {
    if (data.brief.trim().length < 50) errors.push("Brief cần ít nhất 50 ký tự để AI hiểu đủ ngữ cảnh");
    if (!data.targetAudience.trim()) errors.push("Target audience là bắt buộc");
  }
  return errors;
}

// ── Subcomponents ──────────────────────────────────────────
const InputEl = ({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (val: string) => void; placeholder?: string; hint?: string }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    <input className="input" placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)} />
    {hint && <div className="form-hint">{hint}</div>}
  </div>
);

// ── Main Component ─────────────────────────────────────────
export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  function set(field: keyof FormData, val: unknown) {
    setData(prev => ({ ...prev, [field]: val }));
    setErrors([]);
  }

  function togglePlatform(p: string) {
    set("platform", data.platform.includes(p)
      ? data.platform.filter(x => x !== p)
      : [...data.platform, p]);
  }

  function next() {
    const errs = validate(step, data);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => Math.min(s + 1, 5));
    window.scrollTo(0, 0);
  }

  function back() { setErrors([]); setStep(s => Math.max(s - 1, 1)); }

  function handleSubmit() {
    if (!confirmed) { setErrors(["Bạn cần tích xác nhận để tiếp tục"]); return; }
    // TODO: call API to create project
    router.push("/projects/p-new/creative");
  }



  return (
    <>
      {/* Header */}
      <div className="top-header">
        <button onClick={() => router.back()} className="btn btn-ghost btn-sm">← Quay lại</button>
        <div className="top-header-title">Tạo dự án mới</div>
        <span className="badge badge-gold">📐 SHORT_VERTICAL_9_16</span>
      </div>

      {/* Wizard step tabs */}
      <div className="wizard-steps">
        {STEPS.map(s => (
          <div key={s.num} className={`wizard-step ${step === s.num ? "active" : step > s.num ? "done" : ""}`}>
            <div className="wizard-step-num">
              {step > s.num ? "✓" : s.num}
            </div>
            {s.label}
          </div>
        ))}
      </div>

      <div className="page-body fade-in">
        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="page-title">Thông tin cơ bản</h2>
              <p className="page-sub">Đặt tên dự án, chọn platform và thời lượng video</p>
            </div>

            <InputEl label="Tên dự án *" value={data.projectName} onChange={(v) => set("projectName", v)} placeholder="VD: Cà phê Highlands — Campaign Hè 2026" />
            <InputEl label="Tên khách hàng / thương hiệu *" value={data.clientName} onChange={(v) => set("clientName", v)} placeholder="VD: Highlands Coffee" />

            <div className="form-group">
              <label className="form-label">Platform đăng tải *</label>
              <div style={{ display: "flex", gap: 10 }}>
                {PLATFORMS.map(p => (
                  <button key={p.id} onClick={() => togglePlatform(p.id)} style={{
                    flex: 1, padding: "12px", borderRadius: "var(--radius)",
                    border: `2px solid ${data.platform.includes(p.id) ? "var(--accent)" : "var(--border)"}`,
                    background: data.platform.includes(p.id) ? "var(--accent-dim)" : "var(--bg-card)",
                    color: data.platform.includes(p.id) ? "var(--accent-light)" : "var(--text-muted)",
                    cursor: "pointer", transition: "all 0.18s", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{p.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.id}</div>
                  </button>
                ))}
              </div>
              <div className="form-hint">Mỗi platform sẽ có variant riêng được export tự động</div>
            </div>

            <div className="form-group">
              <label className="form-label">Thời lượng video *</label>
              <div style={{ display: "flex", gap: 10 }}>
                {(["15s", "30s"] as const).map(d => (
                  <button key={d} onClick={() => set("duration", d)} style={{
                    flex: 1, padding: "14px", borderRadius: "var(--radius)",
                    border: `2px solid ${data.duration === d ? "var(--accent)" : "var(--border)"}`,
                    background: data.duration === d ? "var(--accent-dim)" : "var(--bg-card)",
                    color: data.duration === d ? "var(--accent-light)" : "var(--text-muted)",
                    cursor: "pointer", transition: "all 0.18s", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{d}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      {d === "15s" ? "Hook nhanh, viral" : "Story đầy đủ, thuyết phục"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="page-title">Sản phẩm & CTA</h2>
              <p className="page-sub">Thông tin sản phẩm, ưu đãi và mục tiêu scene</p>
            </div>

            <InputEl label="Tên sản phẩm *" value={data.productName} onChange={(v) => set("productName", v)} placeholder="VD: Cà phê sữa đá đặc biệt" />
            <div className="form-group">
              <label className="form-label">Mô tả sản phẩm</label>
              <textarea className="input" rows={3} placeholder="Đặc điểm nổi bật, điểm khác biệt, lợi ích..."
                value={data.productDescription}
                onChange={e => set("productDescription", e.target.value)} />
            </div>
            <InputEl label="Ưu đãi / Khuyến mãi" value={data.offer} onChange={(v) => set("offer", v)} placeholder="VD: Mua 1 tặng 1, Giảm 30%, Free size L..." />
            <InputEl label="Lời kêu gọi hành động (CTA) *" value={data.cta} onChange={(v) => set("cta", v)} placeholder="VD: Order ngay!, Ghé cửa hàng gần nhất!, Đặt bàn ngay!" />

            <div className="form-group">
              <label className="form-label">Mục tiêu chính của video *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PURPOSES.map(p => (
                  <button key={p} onClick={() => set("scenePurpose", p)} style={{
                    padding: "8px 16px", borderRadius: "20px",
                    border: `1px solid ${data.scenePurpose === p ? "var(--accent)" : "var(--border)"}`,
                    background: data.scenePurpose === p ? "var(--accent-dim)" : "var(--bg-card)",
                    color: data.scenePurpose === p ? "var(--accent-light)" : "var(--text-secondary)",
                    cursor: "pointer", transition: "all 0.18s", fontSize: 13, fontWeight: 500,
                  }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="page-title">Brand Assets & References</h2>
              <p className="page-sub">Logo, màu thương hiệu và video tham khảo phong cách</p>
            </div>

            <div className="form-group">
              <label className="form-label">Màu thương hiệu</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input type="color" value={data.brandColor}
                  onChange={e => set("brandColor", e.target.value)}
                  style={{ width: 44, height: 44, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }} />
                <input className="input" value={data.brandColor}
                  onChange={e => set("brandColor", e.target.value)}
                  style={{ fontFamily: "monospace" }} />
              </div>
            </div>

            <InputEl label="URL Logo (hoặc đường dẫn file)" value={data.logoUrl} onChange={(v) => set("logoUrl", v)} placeholder="https://... hoặc /assets/logo.png" hint="Logo sẽ được dựng deterministic — không qua AI image" />

            <div className="form-group">
              <label className="form-label">Upload Brand Assets</label>
              <div className="dropzone">
                <div className="dropzone-icon">📂</div>
                <div className="dropzone-text">Kéo thả file vào đây hoặc click để chọn</div>
                <div className="dropzone-hint">Logo PNG/SVG, Brand guideline, Product images — Tối đa 10 file</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Video tham khảo phong cách</label>
              <textarea className="input" rows={3}
                placeholder="Dán URL TikTok, Reels hoặc YouTube (mỗi URL một dòng)&#10;VD: https://www.tiktok.com/@brand/video/..."
                value={data.referenceUrls}
                onChange={e => set("referenceUrls", e.target.value)} />
              <div className="form-hint">AI sẽ dùng làm style reference khi tạo SceneSpecification</div>
            </div>
          </div>
        )}

        {/* ── STEP 4 ── */}
        {step === 4 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="page-title">Brief & Mục tiêu sáng tạo</h2>
              <p className="page-sub">Claude sẽ đọc kỹ phần này để viết kịch bản</p>
            </div>

            <div className="form-group">
              <label className="form-label">Brief chi tiết * <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({data.brief.length} ký tự, cần ≥ 50)</span></label>
              <textarea className="input" rows={6}
                placeholder="Mô tả chi tiết video bạn muốn tạo. Ví dụ:&#10;&#10;Video ngắn 30 giây quảng cáo cà phê sữa đá mùa hè, hướng đến giới trẻ 18-28 tuổi ở TP.HCM. Tone vui tươi, năng lượng cao. Muốn nhấn mạnh vào cảm giác mát lạnh và giá ưu đãi flash sale..."
                value={data.brief}
                onChange={e => set("brief", e.target.value)} />
            </div>

            <InputEl label="Target Audience *" value={data.targetAudience} onChange={(v) => set("targetAudience", v)}
              placeholder="VD: Giới trẻ 18-28 tuổi, sinh viên & nhân viên văn phòng TP.HCM"
              hint="Càng chi tiết, AI sẽ viết lời thoại phù hợp hơn" />

            <div className="form-group">
              <label className="form-label">Cảm xúc mục tiêu</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {EMOTIONS.map(e => (
                  <button key={e} onClick={() => set("emotionTarget", e)} style={{
                    padding: "7px 14px", borderRadius: "20px", fontSize: 12,
                    border: `1px solid ${data.emotionTarget === e ? "var(--accent)" : "var(--border)"}`,
                    background: data.emotionTarget === e ? "var(--accent-dim)" : "var(--bg-card)",
                    color: data.emotionTarget === e ? "var(--accent-light)" : "var(--text-secondary)",
                    cursor: "pointer", transition: "all 0.18s",
                  }}>{e}</button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ngân sách AI tối đa (USD) *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["2", "5", "10", "20"].map(v => (
                  <button key={v} onClick={() => set("budgetCap", v)} style={{
                    flex: 1, padding: "10px", borderRadius: "var(--radius)",
                    border: `1px solid ${data.budgetCap === v ? "var(--accent)" : "var(--border)"}`,
                    background: data.budgetCap === v ? "var(--accent-dim)" : "var(--bg-card)",
                    color: data.budgetCap === v ? "var(--accent-light)" : "var(--text-muted)",
                    cursor: "pointer", transition: "all 0.18s", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>${v}</div>
                  </button>
                ))}
              </div>
              <div className="form-hint">Hệ thống sẽ dừng sản xuất nếu vượt ngưỡng này</div>
            </div>
          </div>
        )}

        {/* ── STEP 5 — REVIEW & CONFIRM ── */}
        {step === 5 && (
          <div style={{ maxWidth: 680 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 className="page-title">Review & Xác nhận</h2>
              <p className="page-sub">Kiểm tra lại toàn bộ thông tin trước khi gửi vào hệ thống. Sau khi xác nhận, brief sẽ bị lock và không thể sửa.</p>
            </div>

            {/* Summary cards */}
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div className="card">
                <div className="section-label">Thông tin cơ bản</div>
                <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-secondary)" }}>
                  <div><strong style={{ color: "var(--text-primary)" }}>Dự án:</strong> {data.projectName || "—"}</div>
                  <div><strong style={{ color: "var(--text-primary)" }}>Khách hàng:</strong> {data.clientName || "—"}</div>
                  <div><strong style={{ color: "var(--text-primary)" }}>Platform:</strong> {data.platform.join(", ") || "—"}</div>
                  <div><strong style={{ color: "var(--text-primary)" }}>Thời lượng:</strong> {data.duration}</div>
                </div>
              </div>
              <div className="card">
                <div className="section-label">Sản phẩm & CTA</div>
                <div style={{ fontSize: 13, lineHeight: 2, color: "var(--text-secondary)" }}>
                  <div><strong style={{ color: "var(--text-primary)" }}>Sản phẩm:</strong> {data.productName || "—"}</div>
                  <div><strong style={{ color: "var(--text-primary)" }}>Ưu đãi:</strong> {data.offer || "—"}</div>
                  <div><strong style={{ color: "var(--text-primary)" }}>CTA:</strong> {data.cta || "—"}</div>
                  <div><strong style={{ color: "var(--text-primary)" }}>Mục tiêu:</strong> {data.scenePurpose || "—"}</div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-label">Brief</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {data.brief || <span style={{ color: "var(--text-muted)" }}>Chưa điền</span>}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
                <span>👥 {data.targetAudience || "—"}</span>
                <span>💰 Budget: ${data.budgetCap}</span>
                <span>🎭 {data.emotionTarget || "—"}</span>
              </div>
            </div>

            {/* Profile read-only */}
            <div className="card" style={{ marginBottom: 20, background: "rgba(124,90,240,0.05)", borderColor: "rgba(124,90,240,0.2)" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <div><span style={{ color: "var(--text-muted)" }}>Profile: </span><strong>SHORT_VERTICAL_9_16</strong></div>
                <div><span style={{ color: "var(--text-muted)" }}>Kích thước: </span><strong>1080×1920</strong></div>
                <div><span style={{ color: "var(--text-muted)" }}>Bước tiếp: </span><strong>Claude sẽ viết kịch bản</strong></div>
              </div>
            </div>

            {/* Confirmation gate */}
            <div className="confirm-gate">
              <div className="confirm-gate-title">⚠️ Xác nhận trước khi gửi vào hệ thống</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.7 }}>
                Sau khi xác nhận, toàn bộ thông tin trên sẽ được <strong>lock lại</strong> và không thể sửa đổi.
                Claude AI sẽ bắt đầu tạo Creative Treatment và Kịch bản dựa trên Brief này.
                Bạn sẽ cần <strong>duyệt kịch bản</strong> trước khi hệ thống bắt đầu sản xuất.
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: confirmed ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  Tôi đã kiểm tra toàn bộ thông tin và xác nhận gửi vào hệ thống
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ maxWidth: 600, marginTop: 16, padding: "12px 16px",
            background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.25)",
            borderRadius: "var(--radius)", fontSize: 13 }}>
            {errors.map(e => <div key={e} style={{ color: "var(--red)" }}>⚠ {e}</div>)}
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 28, maxWidth: 600 }}>
          {step > 1 && (
            <button className="btn btn-secondary" onClick={back}>← Quay lại</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 5 ? (
            <button className="btn btn-primary" onClick={next}>
              Tiếp theo →
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={!confirmed}>
              ✅ Xác nhận & Gửi vào hệ thống
            </button>
          )}
        </div>
      </div>
    </>
  );
}
