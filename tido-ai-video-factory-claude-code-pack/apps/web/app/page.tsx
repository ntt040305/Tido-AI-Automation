"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Chip, Card } from "@/components/UI";

const MOCK_PROJECTS = [
  {
    id: "p1",
    title: "Summer Sale — Cà phê Trung Nguyên",
    duration: "00:00:15",
    tallyStatus: "ok" as const,
    statusLabel: "Hoàn thành · TikTok",
    aspectRatio: "9/16" as const,
    stage: "COMPLETED",
  },
  {
    id: "p2",
    title: "Ra mắt bộ sưu tập mới",
    duration: "00:00:30",
    tallyStatus: "live" as const,
    statusLabel: "Đang sản xuất · Reels",
    aspectRatio: "9/16" as const,
    stage: "IN_PRODUCTION",
  },
  {
    id: "p3",
    title: "TVC thương hiệu quý 3",
    duration: "00:00:30",
    tallyStatus: "idle" as const,
    statusLabel: "Chờ duyệt kịch bản",
    aspectRatio: "16/9" as const,
    stage: "AWAITING_CREATIVE_APPROVAL",
  },
  {
    id: "p4",
    title: "Combo khai trương chi nhánh",
    tallyStatus: "idle" as const,
    statusLabel: "Nháp · Shorts",
    aspectRatio: "9/16" as const,
    stage: "DRAFT",
  },
];

type Filter = "ALL" | "IN_PRODUCTION" | "COMPLETED" | "DRAFT";

export default function CollectionPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");

  const filteredProjects = MOCK_PROJECTS.filter((p) => {
    if (filter === "ALL") return true;
    if (filter === "IN_PRODUCTION" && p.stage === "IN_PRODUCTION") return true;
    if (filter === "COMPLETED" && p.stage === "COMPLETED") return true;
    if (filter === "DRAFT" && (p.stage === "DRAFT" || p.stage === "AWAITING_CREATIVE_APPROVAL")) return true;
    return false;
  });

  const handleCreateProject = () => {
    router.push("/projects/new-project");
  };

  return (
    <div className="py-12 px-14 max-w-[1180px] w-full animate-[fade-in_0.3s_ease]">
      {/* Header */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-text3 mb-2.5">
            Bộ sưu tập
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.01em]">
            Toàn bộ dự án
          </h1>
        </div>
        <Button onClick={handleCreateProject}>
          <Plus size={15} strokeWidth={2} />
          Tạo dự án mới
        </Button>
      </div>

      {/* Filter Row */}
      <div className="flex gap-2 mb-7">
        <Chip active={filter === "ALL"} onClick={() => setFilter("ALL")}>
          Tất cả
        </Chip>
        <Chip active={filter === "IN_PRODUCTION"} onClick={() => setFilter("IN_PRODUCTION")}>
          Đang sản xuất
        </Chip>
        <Chip active={filter === "COMPLETED"} onClick={() => setFilter("COMPLETED")}>
          Hoàn thành
        </Chip>
        <Chip active={filter === "DRAFT"} onClick={() => setFilter("DRAFT")}>
          Nháp
        </Chip>
      </div>

      {/* Grid Cards */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
        {filteredProjects.map((proj) => (
          <Card
            key={proj.id}
            title={proj.title}
            statusLabel={proj.statusLabel}
            tallyStatus={proj.tallyStatus}
            duration={proj.duration}
            aspectRatio={proj.aspectRatio}
            onClick={() => router.push(`/projects/${proj.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
