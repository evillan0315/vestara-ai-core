import React from 'react';

type Props = { glitching: boolean; phase: number };

export function VLogo({ glitching, phase }: Props) {
  return (
    <div className="relative flex flex-col items-center" style={{ animation: 'float 3s ease-in-out infinite' }}>
      <div
        className="relative w-[140px] h-[140px] md:w-[180px] md:h-[180px] rounded-[24px] bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,255,0.18),transparent_68%)] border border-[#00E5FF]/20 flex items-center justify-center backdrop-blur-xl"
        style={{ animation: phase >= 2 ? 'glowPulse 2.2s ease-in-out infinite' : undefined }}
      >
        <div
          className={`font-['Syne'] font-[700] text-[72px] md:text-[88px] tracking-[-0.02em] text-[#00E5FF] select-none ${glitching ? 'animate-[glitchX_0.18s_steps(2)_1]' : ''}`}
        >
          V
        </div>
        <div className="pointer-events-none absolute -top-1.5 -right-1 w-[10px] h-[10px] rounded-full bg-[#00FFA3] shadow-[0_0_8px_#00FFA3] animate-pulse" />
      </div>
      <div className="mt-7 flex flex-col items-center gap-2">
        <div className="font-['Syne'] font-[600] tracking-[0.28em] text-[13px] md:text-[16px] text-white/90">
          VESTARA AI OS
        </div>
        <div className="h-[1px] w-[86px] bg-gradient-to-r from-transparent via-[#00E5FF]/50 to-transparent" />
        <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">
          Portable • Private • Provider-Agnostic
        </div>
      </div>
    </div>
  );
}
