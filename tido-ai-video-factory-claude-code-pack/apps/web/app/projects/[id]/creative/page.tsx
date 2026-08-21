"use client";
import { useState } from "react";

const MOCK_SCRIPT = `# KỊCH BẢN: Cà phê Highlands — Summer 2026
**Profile:** Short Video 9:16 | **Thời lượng:** 30 giây | **Platform:** TikTok, Reels

---

## SCENE 1 — HOOK [0:00–0:03]
[IMAGE: ECU cốc cà phê sữa đá, giọt nước đọng trên ly, ánh sáng ngược đẹp]
[VOICE: Hứng khởi, tươi trẻ]
> Nóng quá rồi... cần gì đó để cứu ngay!

---

## SCENE 2 — PRODUCT REVEAL [0:03–0:12]
[IMAGE: Slow motion rót đá vào cà phê, bong bóng tan dần, màu nâu đẹp]
[VOICE: Ấm áp, hấp dẫn]
> Cà phê sữa đá Highlands — vị đậm đà, mát lạnh đến từng ngụm

---

## SCENE 3 — RETENTION [0:12–0:22]
[IMAGE: Cut nhanh 3 cảnh: người uống sảng khoái, bạn bè cười, cốc trên bàn văn phòng]
[VOICE: Năng động, nhanh]
> Mua 1 tặng 1 — chỉ hôm nay thôi! Ghé ngay Highlands gần bạn nhất

---

## SCENE 4 — CTA [0:22–0:30]
[IMAGE: Logo Highlands, địa chỉ app, CTA button nổi bật]
[VOICE: Chuyên nghiệp, kêu gọi]
> Order ngay qua app — giao hàng 30 phút, freeship đơn đầu!

---

## TỔNG KẾT
- **Thông điệp:** Giải nhiệt mùa hè với Highlands — Mua 1 tặng 1
- **CTA:** Order ngay qua app
- **Mood:** Tươi trẻ, năng động, hấp dẫn`;

const SCENES = [
  { id: 1, name: "HOOK", time: "0:00–0:03", purpose: "Hook", difficulty: 4, provider: "Veo3 Flow" },
  { id: 2, name: "PRODUCT REVEAL", time: "0:03–0:12", purpose: "Retention", difficulty: 7, provider: "Seedance 2.0" },
  { id: 3, name: "RETENTION", time: "0:12–0:22", purpose: "Retention", difficulty: 5, provider: "Veo3 Flow" },
  { id: 4, name: "CTA", time: "0:22–0:30", purpose: "CTA", difficulty: 2, provider: "Graphics (code)" },
];

export default function CreativePage() {
  const [approved, setApproved] = useState(false);
  const [tab, setTab] = useState<"treatment" | "script" | "scenes">("script");
  const [showApprovePanel, setShowApprovePanel] = useState(false);

  return (
    <>
      <div className="top-header">
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Dự án → <strong>Cà phê Highlands — Summer 2026</strong>
        </div>
        <div style={{ flex: 1 }} />
        <span className="badge badge-gold">Stage 2: Duyệt kịch bản</span>
      </div>

      {/* Stage bar */}
      <div style={{ padding: "14px 28px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div className="stage-bar">
          {["Brief", "Creative", "Sản xuất", "QC", "Hoàn thành"].map((lbl, i) => (
            <div key={lbl} className={`stage-step ${i < 2 ? "done" : i === 2 ? "" : ""} ${i === 1 ? "active" : ""}`}>
              <div className="stage-dot">{i < 1 ? "✓" : i + 1}</div>
              <div className="stage-label">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="page-body fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        {/* Left — Script */}
        <div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
            {(["script", "treatment", "scenes"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "10px 20px", background: "none", border: "none",
                borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                color: tab === t ? "var(--accent-light)" : "var(--text-muted)",
                fontWeight: tab === t ? 700 : 500, fontSize: 13, cursor: "pointer",
                textTransform: "capitalize", transition: "all 0.18s",
              }}>
                {t === "script" ? "📄 Kịch bản" : t === "treatment" ? "💡 Creative Treatment" : "🎬 Scenes"}
              </button>
            ))}
          </div>

          {tab === "script" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Được tạo bởi <strong style={{ color: "var(--accent-light)" }}>Claude Sonnet</strong> · v1.0 · 825 tokens
                </div>
                <button className="btn btn-secondary btn-sm">🔄 Yêu cầu viết lại</button>
              </div>
              <div className="card" style={{ padding: 24 }}>
                <pre style={{ fontFamily: "inherit", fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", whiteSpace: "pre-wrap", margin: 0 }}>
                  {MOCK_SCRIPT}
                </pre>
              </div>
            </div>
          )}

          {tab === "treatment" && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
                <strong style={{ color: "var(--accent-light)", display: "block", marginBottom: 12 }}>Creative Treatment</strong>
                Video sử dụng cấu trúc <strong>Hook → Reveal → Retention → CTA</strong> chuẩn TikTok F&B.
                Tone màu warm amber, nhạc nền upbeat, cut rhythm 2-3 giây/scene.
                Hero scene là cảnh rót đá slow motion — điểm giữ người xem mạnh nhất.
                <br /><br />
                <strong style={{ color: "var(--text-primary)" }}>Technique Cards đã chọn:</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {["ECU Product Shot", "F&B Slow Motion Pour", "Backlit Ice Glass", "3-cut Retention Flow", "Platform CTA Layout"].map(c => (
                    <span key={c} className="tag">{c}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "scenes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {SCENES.map(scene => (
                <div key={scene.id} className="scene-card">
                  <div className="scene-card-header">
                    <div className="scene-number">{scene.id}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{scene.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{scene.time}</div>
                    </div>
                    <span className="badge badge-accent" style={{ fontSize: 10 }}>{scene.purpose}</span>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Độ khó</div>
                      <div style={{ fontWeight: 700, color: scene.difficulty > 6 ? "var(--orange)" : "var(--green)" }}>
                        {scene.difficulty}/10
                      </div>
                    </div>
                  </div>
                  <div className="scene-card-body">
                    <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--text-muted)" }}>
                      <span>⚡ Provider: <strong style={{ color: "var(--text-secondary)" }}>{scene.provider}</strong></span>
                      {scene.difficulty > 6 && <span className="badge badge-orange" style={{ fontSize: 10 }}>Scene phức tạp</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Approval panel */}
        <div style={{ position: "sticky", top: 0 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-label">Trạng thái duyệt</div>
            {!approved ? (
              <>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
                  Đọc kỹ kịch bản và duyệt để hệ thống bắt đầu sản xuất.<br />
                  Sau khi duyệt, Production Brain sẽ xử lý 7 bước tự động.
                </div>
                <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}
                  onClick={() => alert("Chức năng revision sẽ gọi Claude viết lại")}>
                  ✏️ Yêu cầu chỉnh sửa
                </button>
                <button className="btn btn-success" style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setShowApprovePanel(true)}>
                  ✅ Duyệt kịch bản
                </button>

                {showApprovePanel && (
                  <div className="confirm-gate" style={{ marginTop: 14 }}>
                    <div className="confirm-gate-title">Xác nhận duyệt</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
                      Sau khi duyệt, Production Brain sẽ bắt đầu xử lý ngay. Bạn không thể sửa kịch bản nữa.
                    </div>
                    <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => { setApproved(true); setShowApprovePanel(false); }}>
                      ✅ Xác nhận duyệt & Bắt đầu sản xuất
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 4 }}>Đã duyệt!</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                  Production Brain đang xử lý 7 bước...
                </div>
                <a href="/projects/p-new/production" className="btn btn-primary btn-sm" style={{ display: "inline-flex" }}>
                  Xem Production Dashboard →
                </a>
              </div>
            )}
          </div>

          {/* Cost estimate */}
          <div className="card">
            <div className="section-label">Ước tính chi phí</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {[
                { label: "Script (Claude)", cost: "$0.02" },
                { label: "Voice render (×4 scenes)", cost: "$0.09" },
                { label: "Image AI (×4 scenes)", cost: "$0.40" },
                { label: "Video AI (×4 scenes)", cost: "$1.20" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                  <span style={{ fontWeight: 600 }}>{r.cost}</span>
                </div>
              ))}
              <div className="divider" style={{ margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700 }}>Tổng ước tính</span>
                <span className="cost-display" style={{ fontSize: 16 }}>~$1.71</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Budget cap: $5.00 ✅ An toàn</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
