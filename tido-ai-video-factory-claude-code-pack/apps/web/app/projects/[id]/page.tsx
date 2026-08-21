"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock, Download, Video, FileText, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/UI";
import { StageMini, SceneBlock, AssetPanel } from "@/components/ProjectComponents";

type ProjectStage = "DRAFT" | "AWAITING_CREATIVE_APPROVAL" | "IN_PRODUCTION" | "COMPLETED";

export default function ProjectPage() {
  const params = useParams();
  const id = params.id as string;

  // Mock data states for demo
  const isNewProject = id === "new-project";
  const [stage, setStage] = useState<ProjectStage>(isNewProject ? "DRAFT" : "AWAITING_CREATIVE_APPROVAL");

  // Form states
  const [productName, setProductName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [cta, setCta] = useState("");
  const [briefDetail, setBriefDetail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [scriptData, setScriptData] = useState<any>(null);

  const [isRenderingVoice, setIsRenderingVoice] = useState(false);
  const [showAudioPopup, setShowAudioPopup] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleRenderVoice = async () => {
    setIsRenderingVoice(true);
    setShowAudioPopup(false);

    try {
      const res = await fetch("/api/render-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scriptData || {
          metadata: { title: "Cà phê Rang Xay Đất Sài Gòn", voice_id: "vo_mizaki_3" },
          segments: [
            { emotion: "warm", text: "Hương vị Sài Gòn, trong từng hạt cà phê rang xay Đất Sài Gòn.", pacing: "auto", prosody: { vocal_tail: "auto" } },
            { emotion: "thanh lịch", text: "Thơm nồng, vị đắng đậm, hậu sâu, một trải nghiệm cà phê hoàn hảo.", pacing: "auto", prosody: { vocal_tail: "auto" } },
            { emotion: "hào hứng", text: "Và bây giờ, chúng tôi mang đến cho bạn ưu đãi đặc biệt: giảm ba mươi phần trăm khi mua ba gói.", pacing: "auto", prosody: { vocal_tail: "auto" } },
            { emotion: "tin tưởng", text: "Không chỉ là một món đồ uống, cà phê rang xay Đất Sài Gòn là sự kết hợp hoàn hảo giữa chất lượng và giá cả.", pacing: "auto", prosody: { vocal_tail: "auto" } },
            { emotion: "mạnh mẽ", text: "Nhanh chóng nhập hàng, và bắt đầu bán cà phê rang xay Đất Sài Gòn để tăng lợi nhuận cho quán của bạn ngay hôm nay!", pacing: "auto", prosody: { vocal_tail: "auto" } }
          ]
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Lỗi render voice");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setShowAudioPopup(true);
    } catch (err: any) {
      alert("Lỗi render voice: " + err.message);
    } finally {
      setIsRenderingVoice(false);
    }
  };

  const handleGenerateScript = async () => {
    if (!productName || !briefDetail) {
      alert("Vui lòng nhập ít nhất Tên sản phẩm và Brief chi tiết.");
      return;
    }

    setIsGenerating(true);
    try {
      const prompt = `Tên sản phẩm: ${productName}\nMô tả ngắn: ${shortDesc}\nƯu đãi/CTA: ${cta}\nChi tiết: ${briefDetail}`;

      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          profileType: "tiktok",
          duration: 60
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");

      const parsed = JSON.parse(data.script);
      setScriptData(parsed);
      setStage("AWAITING_CREATIVE_APPROVAL");
    } catch (err: any) {
      alert("Lỗi tạo kịch bản: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="py-12 px-14 max-w-[1180px] w-full animate-[fade-in_0.3s_ease]">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-text3 hover:text-text2 mb-[18px] cursor-pointer">
        <ArrowLeft size={13} strokeWidth={2} />
        Bộ sưu tập
      </Link>

      <div className="flex justify-between items-start mb-2">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.01em]">
            {isNewProject ? "Dự án mới" : "Ra mắt bộ sưu tập mới"}
          </h1>
          <div className="text-[14px] text-text2 mt-1.5">
            Instagram Reels · 30s
          </div>
        </div>
      </div>

      <StageMini stage={stage} />

      {isNewProject && <div className="mt-8" />}

      <div className="grid grid-cols-[1fr_300px] gap-11 mt-8">
        <div>
          {/* DRAFT */}
          {stage === "DRAFT" && (
            <div>
              <h2 className="text-[15px] font-semibold mb-4">Thông tin dự án</h2>
              <div className="mb-5">
                <label className="block text-[13px] text-text2 mb-2">Tên sản phẩm</label>
                <input type="text" className="w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2" placeholder="Cà phê sữa đá hộp 330ml" value={productName} onChange={e => setProductName(e.target.value)} />
              </div>
              <div className="mb-5">
                <label className="block text-[13px] text-text2 mb-2">Mô tả ngắn</label>
                <textarea className="w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2 min-h-[80px] resize-y" placeholder="Đặc điểm, lợi ích nổi bật của sản phẩm..." value={shortDesc} onChange={e => setShortDesc(e.target.value)}></textarea>
              </div>
              <div className="mb-5">
                <label className="block text-[13px] text-text2 mb-2">Ưu đãi / CTA</label>
                <input type="text" className="w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2" placeholder="Giảm 20% — mua ngay hôm nay" value={cta} onChange={e => setCta(e.target.value)} />
              </div>
              <div className="mb-5">
                <label className="block text-[13px] text-text2 mb-2">Brief chi tiết</label>
                <textarea className="w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2 min-h-[80px] resize-y" placeholder="Mô tả chi tiết mong muốn cho video..." value={briefDetail} onChange={e => setBriefDetail(e.target.value)}></textarea>
              </div>
              <Button onClick={handleGenerateScript} disabled={isGenerating}>
                {isGenerating && <Loader2 size={16} className="animate-spin" />}
                {isGenerating ? "Đang tạo kịch bản..." : "Khoá brief & tạo kịch bản"}
              </Button>
            </div>
          )}

          {/* AWAITING_CREATIVE_APPROVAL */}
          {stage === "AWAITING_CREATIVE_APPROVAL" && (
            <div>
              <div className="bg-surface border border-border rounded-DEFAULT p-4 mb-6 flex justify-between items-start gap-4">
                <div className="text-[13.5px] text-text2 leading-[1.75]">
                  <b className="text-text font-medium">{productName || "Cà phê sữa đá hộp 330ml"}</b> · {cta || "Giảm 20% mua ngay"} · Budget $15.00
                </div>
                <Lock size={14} className="text-text3 shrink-0 mt-0.5" />
              </div>

              <div className="flex items-center justify-between bg-surface border border-border rounded-DEFAULT py-4 px-5 mb-6 flex-wrap gap-3">
                <span className="font-mono text-[12.5px] text-text2">
                  Ước tính sản xuất<b className="text-text ml-1">$12.64</b>
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStage("DRAFT")}>Yêu cầu viết lại</Button>
                  <Button size="sm" onClick={() => setStage("IN_PRODUCTION")}>Duyệt kịch bản</Button>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="text-[15px] font-semibold mb-1">
                  Kịch bản: <span className="text-accent">{scriptData?.metadata?.title || "Không có tiêu đề"}</span>
                </h2>
                <div className="text-[12.5px] text-text2 font-mono">
                  Giọng đọc: {scriptData?.metadata?.voice_id || "Mặc định"}
                </div>
              </div>

              {(() => {
                const defaultScriptData = {
                  metadata: { title: "Cà phê Rang Xay Đất Sài Gòn", voice_id: "vo_motaro_kb19" },
                  segments: [
                    { emotion: "warm", text: "Hương vị Sài Gòn, trong từng hạt cà phê rang xay Đất Sài Gòn.", pacing: "chậm", intensity: 0.50, prosody: { pace_delta: "-", pause_delta: "+", energy_target: "-", pitch_variation_target: "-", phrase_length: "medium", emphasis_density: "low", vocal_tail: "soft" } },
                    { emotion: "thanh lịch", text: "Thơm nồng, vị đắng đậm, hậu sâu, một trải nghiệm cà phê hoàn hảo.", pacing: "bình thường", intensity: 0.65, prosody: { pace_delta: "=", pause_delta: "=", energy_target: "=", pitch_variation_target: "=", phrase_length: "medium", emphasis_density: "medium", vocal_tail: "long" } },
                    { emotion: "hào hứng", text: "Và bây giờ, chúng tôi mang đến cho bạn ưu đãi đặc biệt: giảm ba mươi phần trăm khi mua ba gói.", pacing: "nhanh", intensity: 0.85, prosody: { pace_delta: "+", pause_delta: "-", energy_target: "+", pitch_variation_target: "+", phrase_length: "short", emphasis_density: "high", vocal_tail: "crisp" } },
                    { emotion: "tin tưởng", text: "Không chỉ là một món đồ uống, cà phê rang xay Đất Sài Gòn là sự kết hợp hoàn hảo giữa chất lượng và giá cả.", pacing: "bình thường", intensity: 0.70, prosody: { pace_delta: "=", pause_delta: "=", energy_target: "=", pitch_variation_target: "=", phrase_length: "medium", emphasis_density: "medium", vocal_tail: "auto" } },
                    { emotion: "mạnh mẽ", text: "Nhanh chóng nhập hàng, và bắt đầu bán cà phê rang xay Đất Sài Gòn để tăng lợi nhuận cho quán của bạn ngay hôm nay!", pacing: "nhanh", intensity: 0.88, prosody: { pace_delta: "+", pause_delta: "-", energy_target: "+", pitch_variation_target: "+", phrase_length: "short", emphasis_density: "high", vocal_tail: "crisp" } }
                  ]
                };

                const currentScript = scriptData || defaultScriptData;

                const updateSegmentParam = (idx: number, field: string, val: string) => {
                  const updated = JSON.parse(JSON.stringify(currentScript));
                  if (!updated.segments[idx]) return;

                  if (field === "emotion") {
                    updated.segments[idx].emotion = val;
                  } else if (field === "pacing") {
                    updated.segments[idx].pacing = val;
                  } else if (field === "vocalTail") {
                    if (!updated.segments[idx].prosody) updated.segments[idx].prosody = {};
                    updated.segments[idx].prosody.vocal_tail = val;
                  }
                  setScriptData(updated);
                };

                return currentScript.segments.map((seg: any, idx: number) => (
                  <SceneBlock
                    key={idx}
                    sceneId={`CẢNH ${(idx + 1).toString().padStart(2, "0")}`}
                    title={seg.emotion || "Tự động"}
                    description={seg.text}
                    emotion={seg.emotion || "auto"}
                    pacing={seg.pacing || "auto"}
                    vocalTail={seg.prosody?.vocal_tail || "auto"}
                    isEditable={true}
                    onEmotionChange={(val) => updateSegmentParam(idx, "emotion", val)}
                    onPacingChange={(val) => updateSegmentParam(idx, "pacing", val)}
                    onVocalTailChange={(val) => updateSegmentParam(idx, "vocalTail", val)}
                  />
                ));
              })()}
            </div>
          )}

          {/* IN_PRODUCTION */}
          {stage === "IN_PRODUCTION" && (
            <div>
              <div className="bg-surface border border-border rounded-DEFAULT p-4 mb-6 flex justify-between items-start gap-4">
                <div className="text-[13.5px] text-text2 leading-[1.75]">
                  <b className="text-text font-medium">Cà phê sữa đá hộp 330ml</b> · Giảm 20% mua ngay · Kịch bản v2 đã duyệt
                </div>
                <Lock size={14} className="text-text3 shrink-0 mt-0.5" />
              </div>

              <div className="flex items-center gap-[14px] mb-[26px]">
                <span className="font-mono text-[12px] text-text2 whitespace-nowrap">3/5 scenes</span>
                <div className="flex-1 height-2 bg-border relative rounded-full h-[2px]">
                  <div className="absolute left-0 top-0 h-full bg-accent w-[62%] rounded-full"></div>
                </div>
                <span className="font-mono text-[12px] text-text2 whitespace-nowrap">$7.80 / $15.00</span>
              </div>

              <h2 className="text-[15px] font-semibold mb-4">Kịch bản & tiến độ</h2>
              <SceneBlock
                sceneId="CẢNH 01" title="HOOK"
                description="[HÌNH ẢNH] Cận cảnh sản phẩm xoay chậm."
                hasThumbnail qcStatus="ok" qcText="QC 94"
              />
              <SceneBlock
                sceneId="CẢNH 02" title="RETENTION"
                description="[HÌNH ẢNH] Tương tác sản phẩm tự nhiên."
                hasThumbnail qcStatus="ok" qcText="QC 88"
              />
              <SceneBlock
                sceneId="CẢNH 03" title="CHI TIẾT"
                description="[HÌNH ẢNH] Chất liệu, cận cảnh bề mặt sản phẩm."
                hasThumbnail qcStatus="live" qcText="00:00:12 — đang render"
              />
              <SceneBlock
                sceneId="CẢNH 04" title="GÓC RỘNG"
                description="[HÌNH ẢNH] Toàn cảnh bộ sưu tập."
                hasThumbnail qcStatus="idle" qcText="Đang chờ"
              />
              <SceneBlock
                sceneId="CẢNH 05" title="CTA"
                description="[HÌNH ẢNH] Logo và mã giảm giá."
                hasThumbnail qcStatus="idle" qcText="Đang chờ"
              />
              <div className="mt-8 flex justify-end">
                <Button onClick={() => setStage("COMPLETED")}>Hoàn tất render (Demo)</Button>
              </div>
            </div>
          )}

          {/* COMPLETED */}
          {stage === "COMPLETED" && (
            <div>
              <div className="grid grid-cols-[300px_1fr] gap-10 mb-2">
                <div>
                  <div className="bg-surface border border-border rounded-lg aspect-[9/16] flex items-center justify-center relative shadow-card">
                    <Video size={30} className="text-text3" strokeWidth={1.4} />
                  </div>
                  <div className="mt-3 h-[3px] bg-surface2 rounded-full relative">
                    <div className="absolute left-0 top-0 h-full w-full bg-text2 rounded-full"></div>
                  </div>
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold mb-4">Kết quả</h2>
                  <div className="flex items-center gap-2.5 py-2 border-b border-border text-[13px] text-text2">
                    <CheckCircle2 size={14} className="text-ok shrink-0" strokeWidth={2.2} />
                    Hook rõ ràng trong 3 giây đầu
                  </div>
                  <div className="flex items-center gap-2.5 py-2 border-b border-border text-[13px] text-text2">
                    <CheckCircle2 size={14} className="text-ok shrink-0" strokeWidth={2.2} />
                    Chữ đọc được trên di động
                  </div>
                  <div className="flex items-center gap-2.5 py-2 border-b border-border text-[13px] text-text2">
                    <CheckCircle2 size={14} className="text-ok shrink-0" strokeWidth={2.2} />
                    Âm thanh đạt chuẩn -14 LUFS
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between items-center py-2.5 border-b border-border text-[13px]">
                      <span className="font-medium">Vertical Master</span>
                      <span className="text-text3 text-[11.5px] font-mono">1080×1920</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 border-b border-border text-[13px]">
                      <span className="font-medium">Reels variant</span>
                      <span className="text-text3 text-[11.5px] font-mono">Safe zone</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 text-[13px]">
                      <span className="font-medium">Clean version</span>
                      <span className="text-text3 text-[11.5px] font-mono">Không logo</span>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2.5">
                    <Button size="sm" onClick={handleRenderVoice} disabled={isRenderingVoice}>
                      {isRenderingVoice && <Loader2 size={16} className="animate-spin" />}
                      {isRenderingVoice ? "Đang render..." : "Duyệt & hoàn thành"}
                    </Button>
                    <Button variant="ghost" size="sm">
                      Tải tất cả (ZIP)
                    </Button>
                  </div>
                </div>
              </div>

              <details className="mt-8 border-t border-border pt-4 group">
                <summary className="cursor-pointer text-[13px] text-text3 list-none flex items-center gap-1.5 outline-none hover:text-text2">
                  <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
                  Xem lại brief & kịch bản
                </summary>
                <div className="mt-5 opacity-75">
                  <SceneBlock
                    sceneId="CẢNH 01" title="HOOK"
                    description="Cận cảnh sản phẩm xoay chậm dưới ánh sáng studio."
                  />
                  <SceneBlock
                    sceneId="CẢNH 02" title="RETENTION"
                    description="Tương tác sản phẩm tự nhiên."
                  />
                </div>
              </details>
            </div>
          )}
        </div>

        <div>
          <AssetPanel />
        </div>
      </div>

      {/* Audio Popup Modal */}
      {showAudioPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease]">
          <div className="bg-surface2 border border-borderStrong rounded-xl shadow-card p-6 w-[400px] max-w-[90vw] flex flex-col gap-5 animate-[scale-in_0.2s_ease]">
            <div>
              <h3 className="text-[18px] font-semibold mb-1">Kết quả Voice</h3>
              <p className="text-[13px] text-text2">File MP3 đã được render thành công.</p>
            </div>

            {audioUrl ? (
              <audio src={audioUrl} controls autoPlay className="w-full rounded-md" />
            ) : (
              <div className="h-10 flex items-center justify-center text-[13px] text-text3">Không tìm thấy Audio</div>
            )}

            <div className="flex gap-3 mt-2 justify-end">
              <Button variant="ghost" onClick={handleRenderVoice} disabled={isRenderingVoice}>
                {isRenderingVoice ? <Loader2 size={16} className="animate-spin" /> : "Tạo lại"}
              </Button>
              <Button onClick={() => {
                if (audioUrl) {
                  const a = document.createElement("a");
                  a.href = audioUrl;
                  a.download = "TIDO_Voice_Result.mp3";
                  a.click();
                }
              }}>
                <Download size={15} strokeWidth={2} /> Tải về
              </Button>
              <button
                className="absolute top-4 right-4 text-text3 hover:text-text"
                onClick={() => setShowAudioPopup(false)}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
