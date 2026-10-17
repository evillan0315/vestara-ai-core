import type { BootStep } from '@vestara/types/boot';
import React from 'react';

type Props = { steps: BootStep[]; activeIndex: number; completed: number[]; progress: number };

export function SystemLog({ steps, activeIndex, completed, progress }: Props) {
  return (
    <div className="w-full max-w-[560px] px-6 space-y-[10px]">
      {steps.map((step, idx) => {
        const isDone = completed.includes(idx);
        const isActive = idx === activeIndex;
        const isFuture = idx > activeIndex && !isDone;
        return (
          <div
            key={step.id}
            className={`flex items-center justify-between rounded-[10px] border px-4 py-2.5 transition-all duration-300 ${isActive ? 'border-[#00E5FF]/30 bg-[#00E5FF]/[0.06] backdrop-blur-md' : isDone ? 'border-white/[0.06] bg-white/[0.03]' : 'border-white/[0.05] bg-white/[0.02] opacity-60'}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-[8px] h-[8px] rounded-full shrink-0 ${isDone ? 'bg-[#00FFA3] shadow-[0_0_8px_#00FFA3]' : isActive ? 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF] animate-pulse' : 'bg-white/20'}`}
              />
              <div className="min-w-0">
                <div
                  className={`font-mono text-[11px] tracking-[0.01em] truncate ${isActive ? 'text-white' : 'text-white/70'}`}
                >
                  {step.label}
                </div>
                <div className="font-mono text-[10px] text-white/40 tracking-[0.06em] truncate">{step.detail}</div>
              </div>
            </div>
            <div className="ml-4 flex items-center gap-2 shrink-0">
              {isDone && <span className="font-mono text-[10px] text-[#00FFA3]">ok</span>}
              {isActive && <span className="font-mono text-[10px] text-[#00E5FF]/70">{Math.floor(progress)}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
