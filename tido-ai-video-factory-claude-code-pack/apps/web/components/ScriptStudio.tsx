"use client";
import { useState } from "react";

const PROFILE_OPTIONS = [
  { value: "short", label: "📱 Short Vertical 9:16", desc: "TikTok / Reels / Shorts" },
  { value: "tvc",   label: "🎬 TVC Horizontal 16:9", desc: "Quảng cáo / YouTube / Digital" },
];
const DURATION_OPTIONS = ["15", "30", "60", "90", "180"];

const PROMPT_EXAMPLES = [
  "Quảng cáo sữa tươi Vinamilk cho bà mẹ trẻ, tập trung vào dinh dưỡng con trẻ và tình yêu gia đình",
  "TVC giới thiệu xe máy Honda Vision 2025, nhấn mạnh sự tinh tế, tiết kiệm xăng và phong cách đô thị",
  "Short video viral về thức uống cà phê đá xay mới của Highlands Coffee, vui nhộn, giới trẻ",
  "Quảng cáo bất động sản căn hộ cao cấp Vinhomes, nhấn mạnh không gian sống đẳng cấp",
];

interface ScriptStudioProps {
  onScriptGenerated: (script: string) => void;
}

export default function ScriptStudio({ onScriptGenerated }: ScriptStudioProps) {
  const [prompt, setPrompt] = useState("");
  const [profileType, setProfileType] = useState("tvc");
  const [duration, setDuration] = useState("30");
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (!prompt.trim()) { setError("Vui lòng nhập prompt."); return; }
    setLoading(true); setError(""); setScript("");
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, profileType, duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Lỗi không xác định"); return; }
      setScript(data.script);
      setUsage(data.usage);
      onScriptGenerated(data.script);
    } catch {
      setError("Không thể kết nối API. Kiểm tra lại .env.local");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
      {/* LEFT: Input */}
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="card">
          <div className="section-label">🎯 Chủ đề / Brief</div>
          <textarea
            id="script-prompt"
            className="input"
            rows={5}
            placeholder="Nhập prompt mô tả nội dung video bạn muốn tạo kịch bản..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div className="annotation" style={{ marginBottom: 8 }}>💡 Thử một trong các ví dụ:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PROMPT_EXAMPLES.map((ex, i) => (
              <button
                key={i}
                className="btn btn-ghost"
                id={`example-${i}`}
                onClick={() => setPrompt(ex)}
                style={{ justifyContent: "flex-start", fontSize: 12, textAlign: "left", padding: "6px 10px" }}
              >
                <span style={{ color: "var(--accent)", marginRight: 4 }}>›</span> {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-label">⚙️ Cấu hình sản xuất</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Production Profile</div>
            <div style={{ display: "flex", gap: 10 }}>
              {PROFILE_OPTIONS.map(p => (
                <button
                  key={p.value}
                  id={`profile-${p.value}`}
                  onClick={() => setProfileType(p.value)}
                  style={{
                    flex: 1, padding: "12px 8px", borderRadius: "var(--radius)",
                    border: `2px solid ${profileType === p.value ? "var(--accent)" : "var(--border)"}`,
                    background: profileType === p.value ? "rgba(108,99,255,0.1)" : "var(--bg-card)",
                    color: profileType === p.value ? "var(--accent-light)" : "var(--text-secondary)",
                    cursor: "pointer", textAlign: "center", transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label}</div>
                  <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Thời lượng video</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d}
                  id={`duration-${d}`}
                  onClick={() => setDuration(d)}
                  style={{
                    padding: "8px 16px", borderRadius: "var(--radius)",
                    border: `1px solid ${duration === d ? "var(--accent)" : "var(--border)"}`,
                    background: duration === d ? "rgba(108,99,255,0.15)" : "var(--bg-card)",
                    color: duration === d ? "var(--accent-light)" : "var(--text-secondary)",
                    cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all 0.2s",
                  }}
                >
                  {parseInt(d) >= 60 ? `${parseInt(d)/60} phút` : `${d}s`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          id="btn-generate-script"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15 }}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? <><div className="spinner" /> Đang tạo kịch bản...</> : "✨ Tạo kịch bản với Llama AI (Miễn phí)"}
        </button>

        {error && (
          <div style={{
            background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.3)",
            borderRadius: "var(--radius)", padding: "12px 16px", fontSize: 13, color: "#ff8a8a",
          }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* RIGHT: Script output */}
      <div className="fade-in">
        <div className="card" style={{ minHeight: 500 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div className="section-label">📄 Kịch bản được tạo</div>
              {usage && (
                <div className="annotation">
                  Llama 3.3 70B (Groq) · {usage.input_tokens} in / {usage.output_tokens} out tokens
                </div>
              )}
            </div>
            {script && (
              <button id="btn-copy-script" className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={handleCopy}>
                {copied ? "✅ Đã sao chép" : "📋 Sao chép"}
              </button>
            )}
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 16 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="wave-bar" style={{ height: 32, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Claude đang viết kịch bản...</div>
            </div>
          )}

          {!loading && !script && (
            <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✍️</div>
              <div style={{ fontSize: 14 }}>Nhập prompt và nhấn "Tạo kịch bản" để bắt đầu</div>
            </div>
          )}

          {script && (
            <div style={{ paddingRight: 8, maxHeight: 600, overflowY: "auto" }}>
              {(() => {
                try {
                  const data = JSON.parse(script);
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
                        <h3 style={{ margin: "0 0 8px 0", color: "var(--text)" }}>{data.metadata?.title}</h3>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {data.metadata?.tags?.map((tag: string, i: number) => (
                            <span key={i} style={{ background: "rgba(108,99,255,0.1)", color: "var(--accent)", padding: "4px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {data.segments?.map((seg: any, i: number) => (
                          <div key={i} style={{ background: "var(--bg-app)", padding: 12, borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, color: "var(--text-secondary)" }}>
                                Cảm xúc: {seg.emotion}
                              </span>
                              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4, color: "var(--text-secondary)" }}>
                                Nhịp: {seg.pacing}
                              </span>
                            </div>
                            <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
                              "{seg.text}"
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch (e) {
                  return (
                    <pre style={{
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      fontSize: 13, lineHeight: 1.8,
                      color: "var(--text-secondary)", fontFamily: "inherit"
                    }}>
                      {script}
                    </pre>
                  );
                }
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
