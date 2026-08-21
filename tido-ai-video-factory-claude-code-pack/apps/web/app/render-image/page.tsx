"use client";

import React, { useState } from "react";
import { Sparkles, Layers } from "lucide-react";
import { Button } from "@/components/UI";
import {
  SimpleProductUpload,
  SimpleConceptInput,
  SimpleUseCaseSelector,
  SimpleAspectRatioSelector,
  SimpleRenderPreview,
  SimpleRenderResultState,
} from "@/components/SimpleRenderImageComponents";

export default function RenderImagePage() {
  // ── 1. Simple Form State (Exactly 4 Inputs) ────────────────────
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [concept, setConcept] = useState("");
  const [useCase, setUseCase] = useState("Poster");
  const [aspectRatio, setAspectRatio] = useState("1:1");

  // ── 2. Submission & Error States ──────────────────────────────
  const [errors, setErrors] = useState<{
    referenceImages?: string;
    concept?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultState, setResultState] = useState<SimpleRenderResultState>({
    status: "idle",
  });

  // ── 3. Reference Image Handlers ────────────────────────────────
  function handleFilesAdd(newFiles: File[]) {
    const updatedFiles = [...referenceImages, ...newFiles];
    setReferenceImages(updatedFiles);

    const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews((prev) => [...prev, ...newPreviews]);
    setErrors((prev) => ({ ...prev, referenceImages: undefined }));
  }

  function handleFileRemove(index: number) {
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index]);
    }
    setReferenceImages((prev) => prev.filter((_, idx) => idx !== index));
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleClearAllImages() {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setReferenceImages([]);
    setImagePreviews([]);
  }

  // ── 4. Simple Input Submit Handler ─────────────────────────────
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    // Prevent double submission
    if (isSubmitting) return;

    const newErrors: { referenceImages?: string; concept?: string } = {};

    if (!concept.trim()) {
      newErrors.concept = "Vui lòng nhập concept mong muốn.";
    } else if (concept.length > 1000) {
      newErrors.concept = "Concept vượt quá giới hạn 1000 ký tự. Vui lòng rút gọn.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setResultState({ status: "loading", useCase, aspectRatio });

    try {
      const formData = new FormData();
      formData.append("concept", concept);
      formData.append("useCase", useCase);
      formData.append("aspectRatio", aspectRatio);

      console.log("[SIMPLE RATIO][UI]", {
        selectedAspectRatio: aspectRatio,
        length: aspectRatio ? aspectRatio.length : 0,
        charCodes: aspectRatio ? [...aspectRatio].map((c) => c.charCodeAt(0)) : [],
      });

      referenceImages.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch("/api/image/generate-simple", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.imageUrl) {
        setResultState({
          status: "success",
          imageUrl: data.imageUrl,
          generationId: data.generationId,
          useCase: data.useCase || useCase,
          aspectRatio: data.aspectRatio || aspectRatio,
        });
      } else {
        console.error("[SIMPLE UI][GENERATION ERROR]", data);
        setResultState({
          status: "error",
          generationId: data.generationId,
          errorCode: data.error?.code || data.status || "GENERATION_FAILED",
          errorMessage: data.error?.message,
          useCase: data.useCase || useCase,
          aspectRatio: data.aspectRatio || aspectRatio,
        });
      }
    } catch (err: any) {
      console.error("[SIMPLE UI][NETWORK ERROR]", err);
      setResultState({
        status: "error",
        errorCode: "NETWORK_ERROR",
        errorMessage: err.message || "Lỗi kết nối máy chủ. Vui lòng thử lại.",
        useCase,
        aspectRatio,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleResetResult() {
    setResultState({ status: "idle" });
  }

  function handleRenderAgain() {
    handleSubmit();
  }

  return (
    <div className="min-h-screen bg-bg text-text py-8 px-6 lg:px-12 max-w-[1400px] mx-auto animate-[fade-in_0.2s_ease]">
      {/* ── 1. PAGE HEADER ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-border/80">
        <div>
          <div className="font-mono text-[11px] tracking-[0.14em] text-accent uppercase mb-1 font-semibold flex items-center gap-1.5">
            <Layers size={13} />
            <span>TIDO IMAGE ENGINE</span>
          </div>
          <h1 className="text-[26px] font-bold text-text tracking-tight">
            Tạo ảnh AI
          </h1>
          <p className="text-[13.5px] text-text2 mt-1">
            Biến ý tưởng và ảnh tham khảo thành hình ảnh quảng cáo hoàn chỉnh bằng AI.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-surface2 border border-borderStrong px-3.5 py-1.5 rounded-pill text-[12.5px] font-mono text-text2 flex items-center gap-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-ok" />
            <span>Simple Input V1</span>
          </div>
        </div>
      </div>

      {/* ── 2. MAIN LAYOUT (2 COLUMNS DESKTOP, 1 COLUMN MOBILE) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] gap-8 items-start">
        {/* ── LEFT PANEL: SIMPLE 4-INPUT FORM ─────────────────────── */}
        <div className="bg-surface border border-border rounded-DEFAULT p-6 sm:p-7 shadow-card">
          <div className="mb-6 pb-4 border-b border-border/60">
            <h2 className="text-[17px] font-semibold text-text">
              Yêu cầu tạo ảnh
            </h2>
            <p className="text-[13px] text-text2 mt-1">
              Nhập ý tưởng và tải ảnh tham khảo. Hệ thống AI sẽ tự động phân tích và tạo visual phù hợp.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Reference Images */}
            <SimpleProductUpload
              files={referenceImages}
              previews={imagePreviews}
              onFilesAdd={handleFilesAdd}
              onFileRemove={handleFileRemove}
              onClearAll={handleClearAllImages}
              error={errors.referenceImages}
            />

            {/* 2. Concept */}
            <SimpleConceptInput
              concept={concept}
              onChange={(val) => {
                setConcept(val);
                if (errors.concept) {
                  setErrors((prev) => ({ ...prev, concept: undefined }));
                }
              }}
              error={errors.concept}
            />

            {/* 3. Use Case */}
            <SimpleUseCaseSelector
              selected={useCase}
              onChange={setUseCase}
            />

            {/* 4. Aspect Ratio */}
            <SimpleAspectRatioSelector
              selected={aspectRatio}
              onChange={setAspectRatio}
            />

            {/* Primary Submit CTA */}
            <div className="pt-4 border-t border-border/80">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting || concept.length > 1000 || !concept.trim()}
                className="w-full py-3.5 text-[15px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-bg border-t-transparent animate-spin mr-1" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>TẠO ẢNH</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* ── RIGHT PANEL: OUTPUT PREVIEW ───────────────────────── */}
        <div className="sticky top-6">
          <SimpleRenderPreview
            aspectRatio={aspectRatio}
            state={resultState}
            onReset={handleResetResult}
            onRenderAgain={handleRenderAgain}
          />
        </div>
      </div>
    </div>
  );
}
