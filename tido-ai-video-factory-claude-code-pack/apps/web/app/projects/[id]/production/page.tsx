"use client";

const BRAIN_STEPS = [
  { num: 1, title: "Phân tích nhu cầu scene", desc: "Hook/Retention/CTA · Vai trò sản phẩm · Cảm xúc & tốc độ", status: "done" },
  { num: 2, title: "Xác định kỹ thuật cần truy xuất", desc: "Camera · F&B Shot · Lighting · AI Production", status: "done" },
  { num: 3, title: "Truy xuất thư viện Production Brain", desc: "11 thư viện kỹ thuật · Footage Library TIDO", status: "done" },
  { num: 4, title: "Chấm điểm & chọn Technique Cards", desc: "Top 12 cards phù hợp · Difficulty scoring", status: "done" },
  { num: 5, title: "Enrich SceneSpecification", desc: "First frame · Hook role · Camera/Lighting/Action · QC criteria", status: "active" },
  { num: 6, title: "Gửi kết quả cho các module", desc: "Prompt Compiler · Voice Direction · QC Engine", status: "pending" },
  { num: 7, title: "Nhận phản hồi & cập nhật thư viện", desc: "Pass/Fail tracking · Card score update", status: "pending" },
];

const SCENES = [
  {
    id: 1, name: "HOOK", time: "0:00–0:03", purpose: "Hook",
    status: "rendering", provider: "Veo3 Flow", qcScore: null,
    voice: "Hải Anh · Hứng khởi", cost: 0.31,
    desc: "ECU cốc cà phê sữa đá, giọt nước đọng, ánh sáng ngược",
  },
  {
    id: 2, name: "PRODUCT REVEAL", time: "0:03–0:12", purpose: "Retention",
    status: "queued", provider: "Seedance 2.0", qcScore: null,
    voice: "Hải Anh · Ấm áp", cost: 0,
    desc: "Slow motion rót đá vào cà phê, bong bóng tan dần",
  },
  {
    id: 3, name: "RETENTION", time: "0:12–0:22", purpose: "Retention",
    status: "queued", provider: "Veo3 Flow", qcScore: null,
    voice: "Hải Anh · Năng động", cost: 0,
    desc: "Cut nhanh 3 cảnh: người uống, bạn bè cười, bàn văn phòng",
  },
  {
    id: 4, name: "CTA", time: "0:22–0:30", purpose: "CTA",
    status: "done", provider: "Graphics (code)", qcScore: 98,
    voice: "Hải Anh · Chuyên nghiệp", cost: 0.04,
    desc: "Logo + địa chỉ app + CTA button — dựng deterministic",
  },
];

const STATUS_SCENE = {
  done: { label: "✅ Hoàn thành", cls: "badge-green" },
  rendering: { label: "⚡ Đang render", cls: "badge-accent" },
  queued: { label: "⏳ Đang chờ", cls: "badge-gray" },
  failed: { label: "❌ Lỗi", cls: "badge-red" },
};

export default function ProductionPage() {
  const totalCost = SCENES.reduce((s, sc) => s + sc.cost, 0);
  const done = SCENES.filter(s => s.status === "done").length;

  return (
    <>
      <div className="top-header">
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Dự án → <strong>Cà phê Highlands — Summer 2026</strong>
        </div>
        <div style={{ flex: 1 }} />
        <span className="badge badge-accent">
          <span className="status-dot active" />
          Stage 3: Đang sản xuất
        </span>
      </div>

      {/* Stage bar */}
      <div style={{ padding: "14px 28px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div className="stage-bar">
          {["Brief", "Kịch bản", "Sản xuất", "QC", "Hoàn thành"].map((lbl, i) => (
            <div key={lbl} className={`stage-step ${i < 2 ? "done" : i === 2 ? "active" : ""}`}>
              <div className="stage-dot">{i < 2 ? "✓" : i + 1}</div>
              <div className="stage-label">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="page-body fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>
        {/* Left */}
        <div>
          {/* Progress summary */}
          <div className="card" style={{ marginBottom: 20, background: "rgba(124,90,240,0.05)", borderColor: "rgba(124,90,240,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Tiến độ scenes</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{done}/{SCENES.length} scene</div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="progress-track" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${(done / SCENES.length) * 100}%` }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {Math.round((done / SCENES.length) * 100)}% hoàn thành
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Chi phí thực tế</div>
                <div className="cost-display" style={{ fontSize: 18 }}>${totalCost.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Scene Cards */}
          <div className="section-label">Scenes sản xuất</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {SCENES.map(scene => {
              const st = STATUS_SCENE[scene.status as keyof typeof STATUS_SCENE];
              return (
                <div key={scene.id} className="scene-card">
                  <div className="scene-card-header">
                    <div className="scene-number">{scene.id}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{scene.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{scene.time} · {scene.purpose}</div>
                    </div>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    {scene.status === "rendering" && (
                      <div style={{ display: "flex", gap: 2 }}>
                        {[1,2,3].map(i => (
                          <div key={i} className="wave-bar" style={{ height: 16, animationDelay: `${i*0.1}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="scene-card-body">
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>{scene.desc}</div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
                      <span>⚡ {scene.provider}</span>
                      <span>🎙️ {scene.voice}</span>
                      {scene.qcScore && <span>📊 QC: <strong style={{ color: "var(--green)" }}>{scene.qcScore}/100</strong></span>}
                      {scene.cost > 0 && <span>💰 ${scene.cost.toFixed(2)}</span>}
                    </div>

                    {scene.status === "rendering" && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Đang render với Veo3 Flow...</div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: "45%", transition: "none" }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — Production Brain Panel */}
        <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="section-label">🧠 Production Brain — 7 Bước</div>
            <div className="brain-steps">
              {BRAIN_STEPS.map((step, idx) => (
                <div key={step.num} className={`brain-step ${step.status}`}>
                  <div className="brain-step-indicator">
                    <div className="brain-step-num">
                      {step.status === "done" ? "✓" : step.num}
                    </div>
                    {idx < BRAIN_STEPS.length - 1 && <div className="brain-step-line" />}
                  </div>
                  <div className="brain-step-content">
                    <div className="brain-step-title">{step.title}</div>
                    <div className="brain-step-desc">{step.desc}</div>
                    {step.status === "active" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                        <span style={{ fontSize: 11, color: "var(--accent-light)" }}>Đang xử lý...</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Technique cards used */}
          <div className="card">
            <div className="section-label">Technique Cards đã chọn</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["ECU Product Shot", "F&B Pour Slow-mo", "Backlit Ice Glass", "3-cut Retention", "Mobile Text Safe Zone", "Platform CTA Layout", "Audio Duck Music"].map(c => (
                <span key={c} className="tag">{c}</span>
              ))}
            </div>
          </div>

          {/* Voice preview */}
          <div className="card">
            <div className="section-label">🎙️ Voice: Hải Anh</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
              ElevenLabs Scribe 2 · Clone từ HaiAnh.mp3
            </div>
            <div className="badge badge-orange">⚠ Đang dùng Browser TTS — cần ElevenLabs key</div>
          </div>
        </div>
      </div>
    </>
  );
}
