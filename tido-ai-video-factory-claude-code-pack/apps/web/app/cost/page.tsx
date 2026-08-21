"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CostPage() {
  return (
    <div className="py-12 px-14 max-w-[1180px] w-full animate-[fade-in_0.3s_ease]">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-text3 hover:text-text2 mb-[18px] cursor-pointer">
        <ArrowLeft size={13} strokeWidth={2} />
        Bộ sưu tập
      </Link>

      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-text3 mb-2.5">
        Profile
      </div>
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] mb-[30px]">
        Chi phí
      </h1>

      <div className="grid grid-cols-4 gap-[14px] mb-[36px]">
        <div className="bg-surface border border-border rounded-DEFAULT py-[18px] px-[20px]">
          <div className="text-[11.5px] text-text3 mb-2">Hôm nay</div>
          <div className="font-mono text-[20px] font-medium">$46.20</div>
        </div>
        <div className="bg-surface border border-border rounded-DEFAULT py-[18px] px-[20px]">
          <div className="text-[11.5px] text-text3 mb-2">Tuần này</div>
          <div className="font-mono text-[20px] font-medium">$318.90</div>
        </div>
        <div className="bg-surface border border-border rounded-DEFAULT py-[18px] px-[20px]">
          <div className="text-[11.5px] text-text3 mb-2">Cost / giây dùng được</div>
          <div className="font-mono text-[20px] font-medium">$0.41</div>
        </div>
        <div className="bg-surface border border-border rounded-DEFAULT py-[18px] px-[20px]">
          <div className="text-[11.5px] text-text3 mb-2">Chênh lệch ước tính</div>
          <div className="font-mono text-[20px] font-medium text-text">+6.2%</div>
        </div>
      </div>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="text-left font-medium text-text3 text-[11.5px] uppercase tracking-[0.06em] pb-[10px] border-b border-borderStrong">Job</th>
            <th className="text-left font-medium text-text3 text-[11.5px] uppercase tracking-[0.06em] pb-[10px] border-b border-borderStrong">Dự án</th>
            <th className="text-left font-medium text-text3 text-[11.5px] uppercase tracking-[0.06em] pb-[10px] border-b border-borderStrong">Provider</th>
            <th className="text-left font-medium text-text3 text-[11.5px] uppercase tracking-[0.06em] pb-[10px] border-b border-borderStrong font-mono">Ước tính</th>
            <th className="text-left font-medium text-text3 text-[11.5px] uppercase tracking-[0.06em] pb-[10px] border-b border-borderStrong font-mono">Thực tế</th>
            <th className="text-left font-medium text-text3 text-[11.5px] uppercase tracking-[0.06em] pb-[10px] border-b border-borderStrong">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-[11px] border-b border-border text-text font-medium font-mono">JB-0231</td>
            <td className="py-[11px] border-b border-border text-text2">Ra mắt bộ sưu tập</td>
            <td className="py-[11px] border-b border-border text-text2">Seedance 2.0</td>
            <td className="py-[11px] border-b border-border text-text2 font-mono">$2.10</td>
            <td className="py-[11px] border-b border-border text-text2 font-mono">$2.34</td>
            <td className="py-[11px] border-b border-border text-text2">
              <span className="inline-flex text-[11px] px-[9px] py-[3px] rounded-[20px] font-mono bg-okDim text-ok">Thành công</span>
            </td>
          </tr>
          <tr>
            <td className="py-[11px] border-b border-border text-text font-medium font-mono">JB-0230</td>
            <td className="py-[11px] border-b border-border text-text2">Ra mắt bộ sưu tập</td>
            <td className="py-[11px] border-b border-border text-text2">Veo3 Flow</td>
            <td className="py-[11px] border-b border-border text-text2 font-mono">$1.80</td>
            <td className="py-[11px] border-b border-border text-text2 font-mono">$1.80</td>
            <td className="py-[11px] border-b border-border text-text2">
              <span className="inline-flex text-[11px] px-[9px] py-[3px] rounded-[20px] font-mono bg-okDim text-ok">Thành công</span>
            </td>
          </tr>
          <tr>
            <td className="py-[11px] border-b border-border text-text font-medium font-mono">JB-0229</td>
            <td className="py-[11px] border-b border-border text-text2">Summer Sale</td>
            <td className="py-[11px] border-b border-border text-text2">ElevenLabs</td>
            <td className="py-[11px] border-b border-border text-text2 font-mono">$0.90</td>
            <td className="py-[11px] border-b border-border text-text2 font-mono">$1.05</td>
            <td className="py-[11px] border-b border-border text-text2">
              <span className="inline-flex text-[11px] px-[9px] py-[3px] rounded-[20px] font-mono bg-warnDim text-warn">Retry 1×</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
