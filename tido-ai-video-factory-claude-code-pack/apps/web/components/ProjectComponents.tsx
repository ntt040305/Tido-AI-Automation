import React, { useState } from "react";
import { TallyDot } from "./UI";
import { Image as ImageIcon, Plus, Video, Play, SlidersHorizontal, Mic, Clock, Sparkles, ChevronDown } from "lucide-react";

export function StageMini({ stage }: { stage: "DRAFT" | "AWAITING_CREATIVE_APPROVAL" | "IN_PRODUCTION" | "COMPLETED" }) {
  const stages = ["DRAFT", "AWAITING_CREATIVE_APPROVAL", "IN_PRODUCTION", "COMPLETED"];
  const currentIndex = stages.indexOf(stage);

  const stageLabels = {
    DRAFT: "Nháp",
    AWAITING_CREATIVE_APPROVAL: "Chờ duyệt kịch bản",
    IN_PRODUCTION: "Đang sản xuất",
    COMPLETED: "Hoàn thành"
  };

  return (
    <div className="flex items-center gap-[5px] mt-2">
      {stages.map((s, idx) => {
        const isDone = idx < currentIndex;
        const isNow = idx === currentIndex;
        return (
          <React.Fragment key={s}>
            <span
              className={`w-[5px] h-[5px] rounded-full border ${
                isDone
                  ? "bg-ok border-ok"
                  : isNow
                  ? "bg-accent border-accent"
                  : "bg-surface3 border-borderStrong"
              }`}
            />
            {idx < stages.length - 1 && (
              <span className="w-4 h-[1px] bg-border" />
            )}
          </React.Fragment>
        );
      })}
      <span className="text-[11px] text-text3 ml-1.5 font-mono">
        {stageLabels[stage]}
      </span>
    </div>
  );
}

export interface SceneBlockProps {
  sceneId: string;
  title: string;
  description: string;
  emotion?: string;
  pacing?: string;
  vocalTail?: string;
  hasThumbnail?: boolean;
  qcStatus?: "live" | "ok" | "idle";
  qcText?: string;
  onEmotionChange?: (val: string) => void;
  onPacingChange?: (val: string) => void;
  onVocalTailChange?: (val: string) => void;
  isEditable?: boolean;
}

export function SceneBlock({
  sceneId,
  title,
  description,
  emotion = "auto",
  pacing = "auto",
  vocalTail = "auto",
  hasThumbnail,
  qcStatus,
  qcText,
  onEmotionChange,
  onPacingChange,
  onVocalTailChange,
  isEditable = true,
}: SceneBlockProps) {
  const [showControls, setShowControls] = useState(false);

  const isCustomized = emotion !== "auto" || pacing !== "auto" || vocalTail !== "auto";

  const EMOTION_MAP: Record<string, string> = {
    auto: `Theo kịch bản (${title || "Chuẩn"})`,
    warm: "Ấm áp / Dịu dàng",
    "thủ thỉ": "Thủ thỉ / Nhẹ nhàng",
    "hào hứng": "Hào hứng / Sôi nổi",
    "tâm sự": "Tâm sự / Gần gũi",
    "thanh lịch": "Thanh lịch / Sang trọng",
    "tò mò": "Tò mò / Kích thích",
    "mạnh mẽ": "Mạnh mẽ / Quyết đoán",
    "tin tưởng": "Tin tưởng / Chuyên nghiệp",
  };

  const PACING_MAP: Record<string, string> = {
    auto: "Nhịp thở tự nhiên",
    chậm: "Chậm rãi & Sâu",
    "bình thường": "Vừa phải",
    nhanh: "Nhanh nẩy",
  };

  const TAIL_MAP: Record<string, string> = {
    auto: "Vuốt mượt chuẩn",
    soft: "Vuốt êm (Soft)",
    long: "Ngân dài (Long)",
    crisp: "Gọn câu (Crisp)",
  };

  return (
    <div className="flex flex-col gap-3 mb-6 pb-6 border-b border-border/80 last:border-b-0 group">
      <div className="flex justify-between gap-4">
        <div className="flex-1">
          <div className="font-mono text-[11px] text-accent tracking-[0.08em] mb-2 uppercase flex items-center gap-2">
            <span>{sceneId} — {title}</span>
            {isCustomized && (
              <span className="text-[10px] bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 rounded-full font-sans capitalize">
                Đã tinh chỉnh studio
              </span>
            )}
          </div>
          <div className="text-[13.5px] text-text2 leading-[1.7]">
            {description}
          </div>
          {qcStatus && qcText && (
            <div className="flex items-center gap-1.5 mt-2 text-[12px] text-text2">
              {qcStatus !== "live" ? <TallyDot status={qcStatus} /> : null}
              <span className={qcStatus === "live" ? "font-mono" : ""}>{qcText}</span>
            </div>
          )}
        </div>
        {hasThumbnail && (
          <div className="w-[54px] aspect-[9/16] bg-surface border border-border rounded-[10px] shrink-0 flex items-center justify-center relative">
            <ImageIcon size={14} className="text-text3" />
            {qcStatus && (
              <div className="absolute top-[5px] left-[5px]">
                <TallyDot status={qcStatus} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Studio Voice Performance Controls */}
      {isEditable && (
        <div className="mt-1">
          {/* Header Toggle Row */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowControls(!showControls)}
              className="inline-flex items-center gap-2 text-[12px] text-text3 hover:text-text cursor-pointer transition-colors py-1 outline-none"
            >
              <SlidersHorizontal size={13} className="text-accent" />
              <span className="font-medium">Đạo diễn diễn xuất giọng đọc</span>
              <span className="text-[11px] text-text3/70">
                ({isCustomized ? `${EMOTION_MAP[emotion] || emotion} · ${PACING_MAP[pacing] || pacing}` : "Mặc định kịch bản gốc"})
              </span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${showControls ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Expanded Studio Controls Panel */}
          {showControls && (
            <div className="mt-2.5 p-3.5 bg-[#141416] border border-white/10 rounded-xl shadow-lg flex flex-col gap-3 animate-[fade-in_0.2s_ease]">
              {/* Row 1: Vocal Tone Style */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-text3 uppercase tracking-wider">
                  <Mic size={12} className="text-accent" /> Tông giọng & Cảm xúc diễn xuất
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(EMOTION_MAP).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => onEmotionChange?.(key)}
                      className={`text-[11.5px] px-2.5 py-1 rounded-md border transition-all cursor-pointer outline-none ${
                        emotion === key
                          ? "bg-accent/20 border-accent text-white font-medium shadow-[0_0_8px_rgba(108,99,255,0.25)]"
                          : "bg-surface/50 border-border/70 text-text2 hover:text-text hover:border-text3"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Tempo & Vocal Tail */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                {/* Tempo */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-text3 uppercase tracking-wider">
                    <Clock size={12} className="text-accent" /> Nhịp thở & Tốc độ
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(PACING_MAP).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => onPacingChange?.(key)}
                        className={`text-[11.5px] px-2.5 py-1 rounded-md border transition-all cursor-pointer outline-none ${
                          pacing === key
                            ? "bg-accent/20 border-accent text-white font-medium"
                            : "bg-surface/50 border-border/70 text-text2 hover:text-text hover:border-text3"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vocal Tail */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-text3 uppercase tracking-wider">
                    <Sparkles size={12} className="text-accent" /> Đuôi vuốt âm sắc
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(TAIL_MAP).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => onVocalTailChange?.(key)}
                        className={`text-[11.5px] px-2.5 py-1 rounded-md border transition-all cursor-pointer outline-none ${
                          vocalTail === key
                            ? "bg-accent/20 border-accent text-white font-medium"
                            : "bg-surface/50 border-border/70 text-text2 hover:text-text hover:border-text3"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AssetPanel() {
  return (
    <div>
      <div className="mb-[26px]">
        <div className="text-[12.5px] text-text2 mb-2.5 font-medium">Logo</div>
        <div className="border border-dashed border-borderStrong rounded-DEFAULT p-5 flex flex-col items-center gap-1.5 text-text3 text-[12px] cursor-pointer text-center hover:border-text3 hover:text-text2 transition-colors">
          <ImageIcon size={17} />
          Tải logo lên (PNG/SVG)
        </div>
      </div>
      
      <div className="mb-[26px]">
        <div className="text-[12.5px] text-text2 mb-2.5 font-medium">Màu thương hiệu</div>
        <div className="flex gap-2">
          <div className="w-7 h-7 rounded-full border border-border bg-[#E6402F]"></div>
          <div className="w-7 h-7 rounded-full border border-border bg-[#F2F1ED]"></div>
          <div className="w-7 h-7 rounded-full border border-border bg-[#151517]"></div>
        </div>
      </div>

      <div className="mb-[26px]">
        <div className="text-[12.5px] text-text2 mb-2.5 font-medium">Hình ảnh sản phẩm</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="aspect-square bg-surface border border-border rounded-[12px] flex items-center justify-center text-text3">
            <ImageIcon size={16} />
          </div>
          <div className="aspect-square bg-surface border border-border rounded-[12px] flex items-center justify-center text-text3">
            <ImageIcon size={16} />
          </div>
          <div className="aspect-square bg-surface border border-dashed border-border rounded-[12px] flex items-center justify-center text-text3 cursor-pointer hover:border-text3 hover:text-text2">
            <Plus size={16} />
          </div>
        </div>
      </div>

      <div className="mb-[26px]">
        <div className="text-[12.5px] text-text2 mb-2.5 font-medium">Video tham khảo</div>
        <div className="mb-0">
          <input type="text" className="w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2" placeholder="Dán link TikTok / YouTube..." />
        </div>
      </div>

      <div className="mb-[26px]">
        <div className="text-[12.5px] text-text2 mb-2.5 font-medium">Ghi chú phong cách</div>
        <div className="mb-0">
          <textarea className="w-full bg-surface border border-border rounded-DEFAULT py-2.5 px-3 text-[14px] text-text outline-none focus:border-text2 min-h-[60px] resize-y" placeholder="Mood, tone mong muốn..."></textarea>
        </div>
      </div>
    </div>
  );
}
