import React from 'react';

type Props = { hashText: string; fullHash: string };

export function HashVerifier({ hashText, fullHash }: Props) {
  const verified = hashText.length === fullHash.length;
  return (
    <div className="flex flex-col items-center gap-4 max-w-[520px] w-full px-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/20 bg-[#00E5FF]/10 px-3 py-1">
        <span className="w-[6px] h-[6px] rounded-full bg-[#00FFA3] shadow-[0_0_6px_#00FFA3] animate-pulse" />
        <span className="font-mono text-[10px] tracking-[0.14em] text-[#00E5FF]">VESTARA / SECURE BOOT</span>
      </div>
      <div className="font-mono text-[11px] md:text-[11px] tracking-[0.08em] text-white/60 break-all text-center">
        SHA-256: {hashText}
        <span className="inline-block w-[1.5px] h-[1.1em] bg-[#00E5FF] ml-[2px] translate-y-[2px] animate-[blink_0.8s_steps(1)_infinite]" />
      </div>
      <div
        className={`transition-all duration-500 ${verified ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-[#00FFA3]/10 border border-[#00FFA3]/20 px-3 py-1">
          <span className="font-mono text-[10px] tracking-[0.12em] text-[#00FFA3]">
            ✓ Verified — {fullHash.slice(0, 16)}...
          </span>
        </div>
      </div>
    </div>
  );
}
