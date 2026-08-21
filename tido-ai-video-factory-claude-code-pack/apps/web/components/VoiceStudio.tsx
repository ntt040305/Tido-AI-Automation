"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface Voice {
  id: string;
  voiceKey: string;
  name: string;
  gender: string;
  style: string;
  suitable: string[];
  sampleUrl: string;
  openAiVoice: string;
  emotionRange: string[];
  defaultEmotion: string;
  paceRange: string[];
}

const EMOTION_CONFIG: Record<string, { label: string; icon: string; desc: string; pitch: number; rate: number; volume: number }> = {
  neutral:      { label: "Trung tính",     icon: "😐", desc: "Bình thản, rõ ràng",     pitch: 1.0,  rate: 1.0,  volume: 0.9 },
  excited:      { label: "Hứng khởi",      icon: "🔥", desc: "Năng lượng cao, sôi động", pitch: 1.3, rate: 1.15, volume: 1.0 },
  warm:         { label: "Ấm áp",          icon: "🤗", desc: "Gần gũi, thân thiện",    pitch: 0.95, rate: 0.95, volume: 0.9 },
  professional: { label: "Chuyên nghiệp",  icon: "💼", desc: "Nghiêm túc, đáng tin",   pitch: 0.85, rate: 0.9,  volume: 1.0 },
  passionate:   { label: "Đam mê",         icon: "❤️", desc: "Cuốn hút, thuyết phục",  pitch: 1.15, rate: 1.05, volume: 1.0 },
  gentle:       { label: "Nhẹ nhàng",      icon: "🌸", desc: "Dịu dàng, tinh tế",      pitch: 1.1,  rate: 0.85, volume: 0.8 },
};

const PACE_MULTIPLIER: Record<string, number> = { slow: 0.8, normal: 1.0, fast: 1.2 };
const PACE_LABELS: Record<string, string> = { slow: "🐢 Chậm", normal: "🚶 Thường", fast: "🏃 Nhanh" };

// Audio player component for voice samples
function AudioPlayer({ src, label }: { src: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnd = () => { setPlaying(false); setProgress(0); };
    const onTime = () => setProgress((a.currentTime / a.duration) * 100 || 0);
    const onLoad = () => setDuration(a.duration);
    a.addEventListener("ended", onEnd);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoad);
    return () => {
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoad);
    };
  }, [src]);

  function formatTime(s: number) {
    if (!s || isNaN(s)) return "0:00";
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  }

  return (
    <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius)", padding: "10px 14px" }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={togglePlay} style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), #9b59e8)",
          border: "none", cursor: "pointer", flexShrink: 0, fontSize: 13,
        }}>
          {playing ? "⏸" : "▶"}
        </button>
        <div style={{ flex: 1 }}>
          <div className="progress-track" style={{ cursor: "pointer" }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (audioRef.current) audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * audioRef.current.duration;
            }}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{formatTime(duration)}</span>
      </div>
      {playing && (
        <div style={{ display: "flex", gap: 3, marginTop: 6, justifyContent: "center" }}>
          {[1,2,3,4,5,6,7].map(i => (
            <div key={i} className="wave-bar" style={{ height: 14, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}

interface VoiceStudioProps {
  generatedScript: string;
}

export default function VoiceStudio({ generatedScript }: VoiceStudioProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [customText, setCustomText] = useState("");
  const [useScript, setUseScript] = useState(false);
  const [emotion, setEmotion] = useState("warm");
  const [pace, setPace] = useState("normal");
  const [speaking, setSpeaking] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/voices").then(r => r.json()).then(d => {
      setVoices(d.voices);
      setSelectedVoice(d.voices[0]);
    });
  }, []);

  useEffect(() => {
    if (generatedScript && useScript) setCustomText(generatedScript);
  }, [generatedScript, useScript]);

  // Load browser TTS voices
  const loadBrowserVoices = useCallback(() => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) setBrowserVoices(v);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadBrowserVoices();
    window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
    return () => { window.speechSynthesis.cancel(); };
  }, [loadBrowserVoices]);

  function extractDialogue(text: string): string {
    const lines = text.split("\n").filter(l => l.trim().startsWith(">")).map(l => l.replace(/^>\s*/, "").trim());
    return lines.length ? lines.join(" ") : text;
  }

  // Pick best Vietnamese voice from browser
  function pickVoice(gender: string): SpeechSynthesisVoice | null {
    if (!browserVoices.length) return null;
    const viVoices = browserVoices.filter(v => v.lang.startsWith("vi"));
    if (viVoices.length) {
      const genderMatch = viVoices.find(v =>
        gender === "female" ? v.name.toLowerCase().includes("female") || v.name.includes("f") || v.name.includes("Nu") || v.name.includes("nu")
          : v.name.toLowerCase().includes("male") || v.name.includes("m")
      );
      return genderMatch ?? viVoices[0];
    }
    // Fallback to any available voice
    return browserVoices.find(v => v.lang.startsWith("en")) ?? browserVoices[0] ?? null;
  }

  function handleSpeak() {
    if (typeof window === "undefined") return;
    setError("");
    const textToSpeak = useScript && generatedScript ? extractDialogue(generatedScript) : customText;
    if (!textToSpeak.trim()) { setError("Chưa có nội dung để đọc."); return; }

    window.speechSynthesis.cancel();
    setProgress(0);

    const emotionCfg = EMOTION_CONFIG[emotion] ?? EMOTION_CONFIG.neutral;
    const paceMultiplier = PACE_MULTIPLIER[pace] ?? 1.0;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = "vi-VN";
    utterance.pitch = emotionCfg.pitch;
    utterance.rate = emotionCfg.rate * paceMultiplier;
    utterance.volume = emotionCfg.volume;

    const voice = pickVoice(selectedVoice?.gender ?? "female");
    if (voice) utterance.voice = voice;

    const approxDuration = (textToSpeak.length / 5) / utterance.rate * 1000;
    const startTime = Date.now();

    utterance.onstart = () => {
      setSpeaking(true);
      progressRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setProgress(Math.min((elapsed / approxDuration) * 100, 98));
      }, 200);
    };

    utterance.onend = () => {
      setSpeaking(false);
      setProgress(100);
      if (progressRef.current) clearInterval(progressRef.current);
      setTimeout(() => setProgress(0), 1500);
    };

    utterance.onerror = (e) => {
      setSpeaking(false);
      if (progressRef.current) clearInterval(progressRef.current);
      if (e.error !== "interrupted") setError(`Lỗi TTS: ${e.error}`);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function handleStop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
  }

  const viVoiceCount = browserVoices.filter(v => v.lang.startsWith("vi")).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, alignItems: "start" }}>
      {/* LEFT: Voice cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <div className="section-label">🎙️ Kho giọng TIDO</div>

          {/* Browser TTS status */}
          <div style={{
            background: viVoiceCount > 0 ? "rgba(34,201,122,0.08)" : "rgba(245,200,66,0.08)",
            border: `1px solid ${viVoiceCount > 0 ? "rgba(34,201,122,0.25)" : "rgba(245,200,66,0.25)"}`,
            borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 14, fontSize: 12,
          }}>
            {viVoiceCount > 0 ? (
              <><span style={{ color: "var(--green)" }}>✅ Đã tìm thấy {viVoiceCount} giọng tiếng Việt</span>
              <div style={{ color: "var(--text-muted)", marginTop: 3 }}>Browser TTS sẵn sàng — không cần API</div></>
            ) : (
              <><span style={{ color: "var(--gold)" }}>⚠️ Chưa có giọng tiếng Việt</span>
              <div style={{ color: "var(--text-muted)", marginTop: 3 }}>
                Cài <strong>Google Chrome</strong> hoặc <strong>Microsoft Edge</strong> để có giọng VI đẹp hơn.<br/>
                Hiện dùng giọng tiếng Anh làm fallback ({browserVoices.length} giọng có sẵn).
              </div></>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {voices.map(v => (
              <div key={v.id} id={`voice-card-${v.id}`}
                onClick={() => { setSelectedVoice(v); setEmotion(v.defaultEmotion); }}
                style={{
                  border: `2px solid ${selectedVoice?.id === v.id ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius)", padding: "12px 14px", cursor: "pointer",
                  background: selectedVoice?.id === v.id ? "rgba(108,99,255,0.08)" : "var(--bg-surface)",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--accent), #b084ff)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, flexShrink: 0,
                  }}>
                    {v.gender === "female" ? "👩" : "👨"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{v.style}</div>
                  </div>
                  {selectedVoice?.id === v.id && <div className="badge badge-accent" style={{ fontSize: 10 }}>Active</div>}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                  {v.suitable.map(s => <span key={s} className="tag" style={{ fontSize: 10 }}>{s}</span>)}
                </div>
                <AudioPlayer src={v.sampleUrl} label="🎵 Nghe giọng mẫu gốc" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: Controls + Output */}
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Text source */}
        <div className="card">
          <div className="section-label">📝 Nội dung cần đọc</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button id="btn-use-script" className={`btn ${useScript ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: 12, padding: "6px 14px" }}
              onClick={() => { setUseScript(true); if (generatedScript) setCustomText(extractDialogue(generatedScript)); }}
              disabled={!generatedScript}>
              📄 Dùng kịch bản AI
            </button>
            <button id="btn-use-custom" className={`btn ${!useScript ? "btn-primary" : "btn-secondary"}`}
              style={{ fontSize: 12, padding: "6px 14px" }}
              onClick={() => setUseScript(false)}>
              ✏️ Nhập văn bản tự do
            </button>
          </div>
          <textarea id="voice-custom-text" className="input" rows={5}
            placeholder="Nhập văn bản bạn muốn giọng đọc nói... (thử nhập nội dung dài ~3 phút để test)"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
          />
          {customText && (
            <div className="annotation" style={{ marginTop: 6 }}>
              📊 ~{Math.round(customText.split(/\s+/).filter(Boolean).length / (150 * (PACE_MULTIPLIER[pace] ?? 1)))} phút đọc
              &nbsp;·&nbsp; {customText.length} ký tự
            </div>
          )}
        </div>

        {/* Performance Direction */}
        {selectedVoice && (
          <div className="card">
            <div className="section-label">🎭 Performance Direction (Hướng dẫn diễn xuất)</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Cảm xúc / Tông giọng</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedVoice.emotionRange.map(e => {
                  const cfg = EMOTION_CONFIG[e];
                  return (
                    <button key={e} id={`emotion-${e}`} onClick={() => setEmotion(e)} style={{
                      padding: "8px 14px", borderRadius: "var(--radius)",
                      border: `1px solid ${emotion === e ? "var(--accent)" : "var(--border)"}`,
                      background: emotion === e ? "rgba(108,99,255,0.15)" : "var(--bg-card)",
                      color: emotion === e ? "var(--accent-light)" : "var(--text-secondary)",
                      cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s",
                      textAlign: "center",
                    }}>
                      <div>{cfg?.icon} {cfg?.label}</div>
                      <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>{cfg?.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Tốc độ đọc</div>
              <div style={{ display: "flex", gap: 8 }}>
                {selectedVoice.paceRange.map(p => (
                  <button key={p} id={`pace-${p}`} onClick={() => setPace(p)} style={{
                    padding: "8px 20px", borderRadius: "var(--radius)",
                    border: `1px solid ${pace === p ? "var(--accent)" : "var(--border)"}`,
                    background: pace === p ? "rgba(108,99,255,0.15)" : "var(--bg-card)",
                    color: pace === p ? "var(--accent-light)" : "var(--text-secondary)",
                    cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "all 0.2s",
                  }}>
                    {PACE_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* TTS params preview */}
            {emotion && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--bg-surface)", borderRadius: 8, display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
                <span>📊 Pitch: <strong style={{ color: "var(--accent-light)" }}>{(EMOTION_CONFIG[emotion]?.pitch ?? 1).toFixed(2)}</strong></span>
                <span>⚡ Rate: <strong style={{ color: "var(--accent-light)" }}>{((EMOTION_CONFIG[emotion]?.rate ?? 1) * (PACE_MULTIPLIER[pace] ?? 1)).toFixed(2)}</strong></span>
                <span>🔊 Vol: <strong style={{ color: "var(--accent-light)" }}>{((EMOTION_CONFIG[emotion]?.volume ?? 1) * 100).toFixed(0)}%</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Progress bar while speaking */}
        {speaking && (
          <div className="card fade-in" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[1,2,3,4,5].map(i => <div key={i} className="wave-bar" style={{ height: 20, animationDelay: `${i * 0.1}s` }} />)}
              </div>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {selectedVoice?.name} đang đọc — {EMOTION_CONFIG[emotion]?.icon} {EMOTION_CONFIG[emotion]?.label}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%`, transition: "width 0.2s linear" }} />
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.3)", borderRadius: "var(--radius)", padding: 12, fontSize: 13, color: "#ff8a8a" }}>
            ⚠️ {error}
          </div>
        )}

        {/* Speak / Stop buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <button id="btn-speak" className="btn btn-primary"
            style={{ flex: 1, justifyContent: "center", padding: 14, fontSize: 15 }}
            onClick={handleSpeak} disabled={speaking}>
            {speaking ? <><div className="spinner" /> Đang đọc...</> : "🎙️ Đọc văn bản (Browser TTS)"}
          </button>
          {speaking && (
            <button id="btn-stop" className="btn btn-secondary"
              style={{ padding: "14px 20px", fontSize: 14 }}
              onClick={handleStop}>
              ⏹ Dừng
            </button>
          )}
        </div>

        {/* Info banner */}
        <div className="card" style={{ background: "rgba(34,201,122,0.05)", borderColor: "rgba(34,201,122,0.2)" }}>
          <div style={{ fontSize: 12, lineHeight: 1.8, color: "var(--text-muted)" }}>
            <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 6 }}>✅ Giải pháp Demo: Web Speech API (Miễn phí)</div>
            <strong style={{ color: "var(--text-secondary)" }}>Không cần API key</strong> — Chạy trực tiếp trong Chrome/Edge<br/>
            <strong style={{ color: "var(--text-secondary)" }}>Emotion control:</strong> Pitch / Rate / Volume được điều chỉnh theo cảm xúc<br/>
            <strong style={{ color: "var(--text-secondary)" }}>Tiếng Việt:</strong> Tốt nhất trên Chrome (Windows) — cài thêm Google VI voice nếu cần<br/>
            <strong style={{ color: "var(--text-secondary)" }}>Production:</strong> Phase 5 → ElevenLabs Voice Cloning từ 3 file mp3 gốc của TIDO
          </div>
        </div>
      </div>
    </div>
  );
}
