"use client";

/**
 * Campaign Workspace — the application homepage (Apple Technical Dark Mode).
 *
 * Keeps 100% of the original data structure (MY_CAMPAIGNS, SAMPLE_CAMPAIGNS,
 * CampaignStatus, CampaignCard), routing link to /campaign-site, and server
 * delivery notices, wrapped in the Obsidian flat design system.
 */

import Link from "next/link";
import React, { useState, useMemo } from "react";
import { Search, Plus, Sparkles, ArrowUpDown, Layers, ArrowUpRight } from "lucide-react";
import { VmcButton, VmcTallyDot, VmcBadge } from "@/components/vmc";

export type CampaignStatus = "COMPLETED" | "RENDERING" | "PLANNED" | "DRAFT";

export interface CampaignCard {
  id: string;
  brand: string;
  name: string;
  industry: string;
  assets: number;
  status: CampaignStatus;
  aspectRatio?: "9:16" | "16:9";
  resolution?: string;
  seed?: string | number;
  imageUrl?: string;
}

const STATUS_CONFIG: Record<
  CampaignStatus,
  { text: string; tallyStatus: "live" | "success" | "warning" | "idle" }
> = {
  COMPLETED: { text: "Hoàn thành", tallyStatus: "success" },
  RENDERING: { text: "Đang render", tallyStatus: "live" },
  PLANNED: { text: "Đã lên kế hoạch", tallyStatus: "idle" },
  DRAFT: { text: "Bản nháp", tallyStatus: "warning" },
};

const MY_CAMPAIGNS: CampaignCard[] = [
  {
    id: "skin1004-ampoule",
    brand: "Skin1004",
    name: "One capsule holds everything",
    industry: "Mỹ phẩm / Skincare",
    assets: 5,
    status: "COMPLETED",
    aspectRatio: "9:16",
    resolution: "3840 × 2160",
    seed: "8472910",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBb3EWdQkxUHgPdzUj8RokVqlEmqYuXMYRm4C2UtpZZxvbbuOe2xlvZi46a157RdGWMLXRydQd47Xw70FMYfMQ9cvHzC9ru_yyExzSrh0mFkHgYxD9KueaIDxh_6HCcZpyiXW6bUC5ELRROLcKyKEBmzPXTmenb2TUZ-fcr33lr5ML4gB_D473fpwEizbdD2oBsl6cZeYd2r2sfptUZWoFNHyP1e0dAJgZXAnvyZh-4TnPkWVYzXmxDKA",
  },
  {
    id: "atelier-six-silk",
    brand: "Atelier Six",
    name: "The silk speaks for itself",
    industry: "Thời trang",
    assets: 5,
    status: "RENDERING",
    aspectRatio: "16:9",
    resolution: "5120 × 2880",
    seed: "1902844",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBrgvUXqZ3HvCGXtAAAcCgTpVdu1scm6nQ6UVdPM54HYnCa5KwI7h5r0L8RR0pA2hs6kFSRFq_FE2fvU8ad9wtcR-UDKhySc05E0MR6UYsCW-o2dEMX_NYdr57_4dtdXM0BZXEVKqjZHKPnuovh3ILdCnAomwKRzWU6ZPyhOrkt-C2dtthJhPQ81HQEdqljPKWlIyswFSxWVnaJtIQYglDdT_EuD9o-zPsjbncCYdaUIuPkq4hEaFIVSA",
  },
  {
    id: "pho-ha-beef",
    brand: "Phở Hà",
    name: "Nước dùng của mười hai giờ",
    industry: "F&B",
    assets: 5,
    status: "PLANNED",
    aspectRatio: "9:16",
    resolution: "2160 × 3840",
    seed: "4920182",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC5Jpm0s6AsYkFUgcnAY-Jcwx53U__hY91QMzCvyqVq8kChhKHghy1NHyrhkuLfFx-TCv6xO5otOdfIhsaKaIIdR3sjcJGOUg80mxAv8UNN2xF1MEYKNnzqSdstDIAFkad13XK80sproCYf_32kQ7C4n9YEDiv7j0VYq2eV0KgKB1IrQ1ww5wXRG_enw5gr3Af31N8eEPJmYTUUiCwy3vzhuiZYFJPd62fsJlgxlFixVfEFomPEj4wwAA",
  },
  {
    id: "ben-xanh-townhouse",
    brand: "Bến Xanh",
    name: "Chỗ đứng đầu tiên của bạn",
    industry: "Bất động sản",
    assets: 5,
    status: "DRAFT",
    aspectRatio: "16:9",
    resolution: "4096 × 2160",
    seed: "6612984",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCLSxqqsLY7MmjwNTWCeU6_COUT-sbCdz1bq7daA5kI_reeFqEBan5W7smWWQa50dwK1yns5Hk1KMr1er8JijlMh1daNTCl73itTb-WG2YJnU_m4Qz8fPM6VCIiOagBoZ-w9i3HjTTiccP-_UIFcOa9Pp7uxajII6xOHU1phCM2J04f0mZr6s9YegK-XUEYSo7HFeijsApIhv0E7MZGeApQuDu2wpnmU7PWrdvJsBgCJT8dnS6yt1hunw",
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
    aspectRatio: "9:16",
    resolution: "2160 × 3840",
    seed: "3319802",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBOfDheEt1T7AbEIypLmebtCJnnab5h_PzygIkGFdL6HPFvuFzeL87--cQ8etQw2MLetJc3ATGHBoc5DSffls39LtGx3lgRMYonJwhUGdu54CIF1WcGxpo6iQJ80lPvjH9Ii7PRXjlfqvOA1ESpj-LLUOkNZPGAg8eeSURruaiOcuI9nJlZSZiIHQxHzqCwFcv2W3hvC20RzHP80w16GqarLFQympHOvX5yOuoplGfc1PtW8DOtlEUvMg",
  },
  {
    id: "cold-harvest-coffee",
    brand: "Cold Harvest",
    name: "Mười hai giờ trong lạnh",
    industry: "F&B",
    assets: 5,
    status: "COMPLETED",
    aspectRatio: "16:9",
    resolution: "3840 × 2160",
    seed: "7729104",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCn0FQNM1sPzkgjGOKtDaZQSjzRBeA6LI2FyTtjpoiLl29PqIskIyXhDf59gY_27JpqueWqJQEPo_Na0WsHt6P15s13QI-rI_wC_bxGVwYvhOhh34A6726i5-MK-mXn2fmQHjUIthydeQ54JaB-H8u8WK9CgA7LobvbgvzNJKwTuASHXPopIVbgOxpfdkf4GSC-Kv8SEY_KxGsORHMfEMkjQ7_qRwpYyPy0cmo1yepyeOkITvKp7BR9JA",
  },
  {
    id: "halo-smart-hub",
    brand: "Halo",
    name: "Ngôi nhà tự biết điều",
    industry: "Công nghệ",
    assets: 5,
    status: "COMPLETED",
    aspectRatio: "9:16",
    resolution: "2160 × 3840",
    seed: "9910423",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD9dSIbELh2sZb3VAxbXfYMQ6rl1rDkRYO93i7ZIARi3Non22vCh7Ab_0nA_85lMnFa9lxSC8d9_B-ibeRvVWMCNQuIG_zBlR75RBbemRABAd5BXEPdSwkW9lKEDOBz06PNzcDP8P_OQCH7YiRBq37gixqdjRZSTlTHQJ_TddYxnqYh-5z-6QRudEneHfpVuqzFSPNNNIGe4q3ZJBkK1SLrOxfY0bk2UJY4GHeN2bxlxd3XG0T4XQ6Byg",
  },
  {
    id: "riverside-apartments",
    brand: "Riverside",
    name: "Buổi sáng bên sông",
    industry: "Bất động sản",
    assets: 5,
    status: "COMPLETED",
    aspectRatio: "16:9",
    resolution: "3840 × 2160",
    seed: "4420199",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDlbyfa3LK_YGrfM7P4SNKDBvKi-EwcljvdJOYSEBDjDSFdx2WnikFbDnDy7d0mqbl205BoMfrZ5Mz78xBYgojaNbD4EjIqfvTXawyny6uQ1Ru33376RxuYUzzdAhRg_DjAhRO47k5dywUQq7xei4-Aqjx9AiK434Iq3H7H-JSD_dlWJq2ESz7YyPQMNJFnXv98nMEQfBXZ9188Q8p1sRoZyLw2I9xCeVQyfoySY0rLi03pQuVoWI-nZg",
  },
];

function ObsidianCampaignCard({ c }: { c: CampaignCard }) {
  const statusCfg = STATUS_CONFIG[c.status];
  const is16by9 = c.aspectRatio === "16:9";

  return (
    <article className="bg-surface border border-border rounded-[2px] overflow-hidden hover:border-borderStrong transition-colors flex flex-col group">
      {/* Thumbnail Viewport (Aspect Locked, Solid Industrial Presentation) */}
      <div
        className={`relative w-full overflow-hidden bg-surface3 ${
          is16by9 ? "aspect-[16/9]" : "aspect-[9/16]"
        }`}
      >
        {c.imageUrl ? (
          <img
            src={c.imageUrl}
            alt={c.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface2 font-mono text-[11px] text-text-telemetry">
            NO PREVIEW
          </div>
        )}

        {/* Top Floating Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-surface border border-border">
          <VmcTallyDot status={statusCfg.tallyStatus} />
          <span className="font-mono text-[10.5px] text-text">{statusCfg.text}</span>
        </div>

        {/* Bottom Floating Telemetry */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between font-mono text-[10px] text-text-muted bg-surface/90 border border-border px-2 py-1 rounded-[2px]">
          <span>{c.aspectRatio || "9:16"}</span>
          <span>SEED: {c.seed || "8472910"}</span>
        </div>
      </div>

      {/* Meta Content */}
      <div className="p-3.5 flex flex-col justify-between flex-1 gap-2 bg-surface">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-text-telemetry truncate">
              {c.brand}
            </span>
            <span className="font-mono text-[10.5px] text-text-muted shrink-0">
              {c.assets} ấn phẩm
            </span>
          </div>

          <h3 className="font-sans text-[13.5px] font-semibold text-text mt-1 leading-snug line-clamp-2">
            {c.name}
          </h3>
        </div>

        <div className="pt-2 border-t border-border flex items-center justify-between font-mono text-[11px] text-text-muted">
          <span>{c.industry}</span>
          <Link
            href="/campaign-site"
            className="text-text-telemetry hover:text-text transition-colors flex items-center gap-0.5"
            title="Mở Campaign Studio"
          >
            <span>Mở</span>
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 mb-3 border-b border-border pb-2">
      <h2 className="font-sans text-[15px] font-semibold text-text">{title}</h2>
      {sub && <span className="font-mono text-[11px] text-text-telemetry">{sub}</span>}
    </div>
  );
}

export default function CampaignDashboardPage() {
  const [search, setSearch] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const filterList = (list: CampaignCard[]) => {
    return list.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.brand.toLowerCase().includes(search.toLowerCase()) ||
        item.industry.toLowerCase().includes(search.toLowerCase());

      const matchIndustry =
        selectedIndustry === "all" ||
        item.industry.toLowerCase().includes(selectedIndustry.toLowerCase());

      return matchSearch && matchIndustry;
    }).sort((a, b) => {
      if (sortOrder === "asc") return a.name.localeCompare(b.name);
      return b.name.localeCompare(a.name);
    });
  };

  const filteredMyCampaigns = useMemo(() => filterList(MY_CAMPAIGNS), [search, selectedIndustry, sortOrder]);
  const filteredSampleCampaigns = useMemo(() => filterList(SAMPLE_CAMPAIGNS), [search, selectedIndustry, sortOrder]);

  return (
    <div className="min-h-screen px-6 py-6 max-w-[1500px] mx-auto space-y-6 text-text">
      {/* ── Header ── */}
      <header className="border-b border-border pb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-text-telemetry">
            <span>VIC ENGINE</span>
            <span>•</span>
            <span>CAMPAIGN WORKSPACE</span>
          </div>
          <h1 className="font-sans text-[24px] font-bold tracking-tight text-text mt-0.5">
            Không gian Chiến dịch
          </h1>
          <p className="font-sans text-[13px] text-text-muted mt-1 max-w-[70ch]">
            Mỗi chiến dịch bắt đầu từ một brief, sinh ra một ý tưởng, một định hướng thị giác và một bộ ấn phẩm đồng bộ.
          </p>
        </div>

        <Link href="/campaign-site">
          <VmcButton variant="primary" size="md" icon={<Plus size={15} />}>
            Tạo chiến dịch mới
          </VmcButton>
        </Link>
      </header>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-telemetry pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên chiến dịch, thương hiệu hoặc ngành hàng..."
            className="w-full bg-surface2 border border-border rounded-[2px] pl-10 pr-3.5 py-2 text-[13px] font-sans text-text placeholder:text-text-telemetry focus:outline-none focus:border-borderStrong transition-colors"
          />
        </div>

        {/* Filter by Category */}
        <div className="flex items-center gap-2">
          <select
            value={selectedIndustry}
            onChange={(e) => setSelectedIndustry(e.target.value)}
            className="bg-surface2 border border-border rounded-[2px] px-3 py-2 text-[12.5px] font-sans text-text focus:outline-none focus:border-borderStrong cursor-pointer"
          >
            <option value="all">Tất cả ngành hàng</option>
            <option value="Mỹ phẩm">Mỹ phẩm / Skincare</option>
            <option value="Thời trang">Thời trang</option>
            <option value="F&B">Ẩm thực &amp; F&B</option>
            <option value="Bất động sản">Bất động sản</option>
            <option value="Công nghệ">Công nghệ</option>
          </select>

          <VmcButton
            variant="ghost"
            size="sm"
            icon={<ArrowUpDown size={14} />}
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
          >
            {sortOrder === "desc" ? "Mới nhất" : "A - Z"}
          </VmcButton>
        </div>
      </div>

      {/* ── Chiến dịch của tôi ── */}
      <section className="space-y-3">
        <SectionHeader
          title="Chiến dịch của tôi"
          sub="dữ liệu mẫu — thư viện chiến dịch chưa được kết nối"
        />

        {filteredMyCampaigns.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredMyCampaigns.map((c) => (
              <ObsidianCampaignCard key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <div className="p-8 border border-border rounded-[2px] bg-surface text-center font-sans text-[13px] text-text-muted">
            Không tìm thấy chiến dịch phù hợp với từ khoá tìm kiếm.
          </div>
        )}

        <p className="font-mono text-[11px] text-text-telemetry pt-1">
          Các bộ ấn phẩm đã tạo hiện được ghi ra thư mục bàn giao trên máy chủ, chưa hiển thị ở đây.
        </p>
      </section>

      {/* ── Khám phá chiến dịch mẫu ── */}
      <section className="space-y-3 pt-4">
        <SectionHeader title="Khám phá chiến dịch mẫu" sub="ví dụ tham khảo hệ thống" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredSampleCampaigns.map((c) => (
            <ObsidianCampaignCard key={c.id} c={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
