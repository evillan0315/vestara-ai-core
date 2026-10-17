import React from 'react';

export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full max-w-[420px] px-6">
      <div className="relative h-[4px] w-full rounded-full bg-white/[0.06] border border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_10%,rgba(0,229,255,0.08),transparent),radial-gradient(50%_50%_at_80%_90%,rgba(124,255,236,0.06),transparent)]" />
        <div
          className="h-full bg-gradient-to-r from-[#00E5FF] to-[#7CFFEC] rounded-full transition-all duration-150 ease-out relative overflow-hidden"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-[60%] animate-[barShine_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] tracking-[0.12em] text-white/30">
        <span>IMMUTABLE A/B • Slot A Active</span>
        <span>{Math.floor(progress)}% • no auto-start daemons</span>
      </div>
    </div>
  );
}
