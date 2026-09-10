"use client";

/**
 * Campaign Workspace — the application homepage.
 *
 * This is where someone lands when they open the app, so its only jobs are to
 * show what campaigns exist and to open the door to a new one. The creative work
 * itself happens in the Campaign Studio at /campaign-site; nothing on this page
 * duplicates it.
 *
 * Every card below is mock data. There is no campaign store yet, so rather than
 * dress placeholders up as history, both sections say what they are — the "Chiến
 * dịch của tôi" shelf is labelled as sample data and the real delivery location
 * is named, so nobody mistakes a card for a saved campaign.
 */

import Link from "next/link";
import React from "react";

type CampaignStatus = "COMPLETED" | "RENDERING" | "PLANNED" | "DRAFT";

interface CampaignCard {
  id: string;
  brand: string;
  name: string;
  industry: string;
  assets: number;
  status: CampaignStatus;
  /** Placeholder thumbnail treatment: no real renders are stored yet. */
  thumbnail: string;
}

const STATUS_LABEL: Record<CampaignStatus, { text: string; className: string }> = {
  COMPLETED: { text: "Hoàn thành", className: "text-ok border-ok/40 bg-okDim" },
  RENDERING: { text: "Đang render", className: "text-warn border-warn/40 bg-warnDim" },
  PLANNED: { text: "Đã lên kế hoạch", className: "text-text2 border-borderStrong bg-surface2" },
  DRAFT: { text: "Bản nháp", className: "text-text3 border-borderStrong bg-surface2" },
};

const MY_CAMPAIGNS: CampaignCard[] = [
  {
    id: "skin1004-ampoule",
    brand: "Skin1004",
    name: "One capsule holds everything",
    industry: "Mỹ phẩm / Skincare",
    assets: 5,
    status: "COMPLETED",
    thumbnail: "from-[#2A3B4D] to-[#141F29]",
  },
  {
    id: "atelier-six-silk",
    brand: "Atelier Six",
    name: "The silk speaks for itself",
    industry: "Thời trang",
    assets: 5,
    status: "RENDERING",
    thumbnail: "from-[#3D2F3B] to-[#221A21]",
  },
  {
    id: "pho-ha-beef",
    brand: "Phở Hà",
    name: "Nước dùng của mười hai giờ",
    industry: "F&B",
    assets: 5,
    status: "PLANNED",
    thumbnail: "from-[#4A3520] to-[#251B10]",
  },
  {
    id: "ben-xanh-townhouse",
    brand: "Bến Xanh",
    name: "Chỗ đứng đầu tiên của bạn",
    industry: "Bất động sản",
    assets: 5,
    status: "DRAFT",
    thumbnail: "from-[#24403A] to-[#12211E]",
  },
];

const SAMPLE_CAMPAIGNS: CampaignCard[] = [
  {
    id: "aura-headphones",
    brand: "AURA",
    name: "Nghe thấy khoảng lặng",
    industry: "Công nghệ",
    assets: 5,
    status: "COMPLETED",
    thumbnail: "from-[#23384A] to-[#141F29]",
  },
  {
    id: "cold-harvest-coffee",
    brand: "Cold Harvest",
    name: "Mười hai giờ trong lạnh",
    industry: "F&B",
    assets: 5,
    status: "COMPLETED",
    thumbnail: "from-[#33291F] to-[#1A1511]",
  },
  {
    id: "halo-smart-hub",
    brand: "Halo",
    name: "Ngôi nhà tự biết điều",
    industry: "Công nghệ",
    assets: 5,
    status: "COMPLETED",
    thumbnail: "from-[#2C3142] to-[#171A23]",
  },
  {
    id: "riverside-apartments",
    brand: "Riverside",
    name: "Buổi sáng bên sông",
    industry: "Bất động sản",
    assets: 5,
    status: "COMPLETED",
    thumbnail: "from-[#1F3A42] to-[#111F23]",
  },
];

function StatusChip({ status }: { status: CampaignStatus }) {
  const s = STATUS_LABEL[status];
  return (
    <span className={`text-[10.5px] font-mono px-1.5 py-0.5 rounded border ${s.className}`}>{s.text}</span>
  );
}

function CampaignTile({ c }: { c: CampaignCard }) {
  return (
    <article className="bg-surface border border-border rounded-lg overflow-hidden hover:border-borderStrong transition-colors">
      {/* Thumbnail. A gradient stands in until real renders are stored. */}
      <div className={`aspect-[4/3] bg-gradient-to-br ${c.thumbnail} flex items-end justify-between p-3`}>
        <span className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-white/60">{c.industry}</span>
        <span className="text-[10.5px] font-mono text-white/50">{c.assets} ấn phẩm</span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-text3">{c.brand}</p>
          <StatusChip status={c.status} />
        </div>
        <h3 className="text-[14px] font-semibold text-text mt-1.5 leading-snug">{c.name}</h3>
      </div>
    </article>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      {sub && <span className="text-[11.5px] text-text3">{sub}</span>}
    </div>
  );
}

export default function CampaignDashboardPage() {
  return (
    <div className="min-h-screen px-6 py-8 max-w-[1400px] mx-auto space-y-8">
      {/* ── Header ── */}
      <header className="border-b border-borderStrong pb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-accent">Campaign Workspace</p>
          <h1 className="text-[27px] font-bold tracking-tight mt-1">Không gian chiến dịch</h1>
          <p className="text-[13px] text-text2 mt-1.5 max-w-[68ch]">
            Mỗi chiến dịch bắt đầu từ một brief, sinh ra một ý tưởng, một định hướng thị giác và một bộ ấn phẩm đồng bộ.
          </p>
        </div>

        <Link
          href="/campaign-site"
          className="px-4 py-2.5 rounded-DEFAULT bg-accent text-white font-semibold text-[13.5px] hover:bg-accent/90 transition-colors whitespace-nowrap"
        >
          + Tạo chiến dịch mới
        </Link>
      </header>

      {/* ── Chiến dịch của tôi ── */}
      <section>
        <SectionHeader title="Chiến dịch của tôi" sub="dữ liệu mẫu — thư viện chiến dịch chưa được kết nối" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MY_CAMPAIGNS.map((c) => (
            <CampaignTile key={c.id} c={c} />
          ))}
        </div>

        <p className="text-[11.5px] text-text3 mt-3">
          Các bộ ấn phẩm đã tạo hiện được ghi ra thư mục bàn giao trên máy chủ, chưa hiển thị ở đây.
        </p>
      </section>

      {/* ── Khám phá chiến dịch mẫu ── */}
      <section>
        <SectionHeader title="Khám phá chiến dịch mẫu" sub="ví dụ tham khảo" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SAMPLE_CAMPAIGNS.map((c) => (
            <CampaignTile key={c.id} c={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
