import { Battery, ChevronDown, Clock3, Search, Wifi } from 'lucide-react';
import React from 'react';
import { VestaraLogoTeal } from './VestaraLogoTeal';

export function TopBar({
  onLogoClick,
  onAvatarClick,
  timeStr,
  dateStr,
}: {
  onLogoClick: () => void;
  onAvatarClick: () => void;
  timeStr: string;
  dateStr: string;
}) {
  return (
    <header className="h-[32px] shrink-0 w-full bg-[#0d191b]/80 backdrop-blur-xl border-b border-[#1a3a3d]/60 flex items-center justify-between px-3 sticky top-0 z-30">
      <div className="flex items-center gap-2.5">
        <button onClick={onLogoClick} className="flex items-center gap-2 hover:opacity-90">
          <VestaraLogoTeal size={20} glow />
          <span className="text-[11px] font-bold tracking-[-0.02em] text-[#c8ddd9]">VESTARA</span>
          <span className="w-1 h-1 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#111e20] border border-[#1a3a3d] text-[#5a7a78] font-mono">
            v7.15
          </span>
        </button>
      </div>

      <div className="hidden md:flex items-center">
        <div className="flex items-center gap-1.5 h-[22px] w-[200px] rounded-full bg-[#111e20] border border-[#1a3a3d] px-3">
          <Search size={10} className="text-[#5a7a78]" />
          <span className="text-[10px] text-[#5a7a78] font-mono">Spotlight</span>
          <span className="ml-auto text-[9px] text-[#4a6a68] border border-[#1a3a3d] rounded px-1">⌘K</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden sm:flex items-center gap-1.5 mr-2 px-2 h-[22px] rounded-full bg-[#111e20] border border-[#1a3a3d]">
          <Clock3 size={10} className="text-[#5a7a78]" />
          <span className="text-[10px] font-mono text-[#c8ddd9]">
            {timeStr.split(':').slice(0, 2).join(':')}
            <span className="text-[#2de8c3]">:{timeStr.split(':')[2]}</span>
          </span>
          <span className="text-[9px] text-[#5a7a78]">{dateStr}</span>
        </div>
        <button className="w-6 h-6 rounded-[6px] flex items-center justify-center hover:bg-[#111e20] border border-transparent hover:border-[#1a3a3d] text-[#8ab3ad] hover:text-[#c8ddd9] transition">
          <Wifi size={12} />
        </button>
        <button className="w-6 h-6 rounded-[6px] flex items-center justify-center hover:bg-[#111e20] border border-transparent hover:border-[#1a3a3d] text-[#8ab3ad] hover:text-[#c8ddd9] transition">
          <Battery size={12} />
        </button>
        <button
          onClick={onAvatarClick}
          className="flex items-center gap-1 pl-1 pr-1.5 h-6 rounded-full bg-[#111e20] border border-[#1a3a3d] hover:border-[#2de8c3]/30 hover:bg-[#132528] transition"
        >
          <div className="w-4 h-4 rounded-full bg-[#2de8c3] flex items-center justify-center text-[8px] font-bold text-[#0a1214]">
            E
          </div>
          <ChevronDown size={10} className="text-[#5a7a78]" />
        </button>
      </div>
    </header>
  );
}
