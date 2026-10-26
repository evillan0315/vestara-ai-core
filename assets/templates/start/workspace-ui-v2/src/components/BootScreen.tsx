import { useEffect, useState } from 'react';
import { BOOT_LOGS } from '../lib/constants';
import { VestaraLogoTeal } from './VestaraLogoTeal';

export function BootScreen({ onDone, shutting }: { onDone: () => void; shutting?: boolean }) {
  const [progress, setProgress] = useState(shutting ? 100 : 0);
  const [logIdx, setLogIdx] = useState(0);

  useEffect(() => {
    if (shutting) {
      const t = setTimeout(onDone, 1800);
      return () => clearTimeout(t);
    }
    const pInt = setInterval(() => setProgress((p) => Math.min(100, p + 100 / 28)), 100);
    const lInt = setInterval(() => setLogIdx((i) => Math.min(BOOT_LOGS.length, i + 1)), 260);
    const done = setTimeout(onDone, 3000);
    return () => {
      clearInterval(pInt);
      clearInterval(lInt);
      clearTimeout(done);
    };
  }, [onDone, shutting]);

  return (
    <div className="absolute inset-0 w-full h-full bg-[#0a1214] overflow-hidden flex flex-col items-center justify-center">
      <img
        src={new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.png', import.meta.url).href}
        className="absolute inset-0 w-full h-full object-cover opacity-[0.10] blur-[20px]"
        alt=""
      />
      <div className="absolute inset-0 bg-[#0a1214]/40" />
      {shutting ? (
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="w-10 h-10 rounded-full border-2 border-[#1a3a3d] border-t-[#2de8c3] animate-spin" />
          <div className="text-[11px] tracking-[0.22em] text-[#5a7a78] font-mono">SHUTTING DOWN SHELL OS</div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center">
          <div className="animate-[pulseGlow_2.2s_ease-in-out_infinite]">
            <VestaraLogoTeal size={120} glow />
          </div>
          <div className="mt-6 flex flex-col items-center">
            <div
              className="text-[36px] leading-none tracking-[-0.02em] text-[#e6fff9]"
              style={{ fontFamily: 'Instrument Serif, serif' }}
            >
              VESTARA
            </div>
            <div className="mt-1 text-[10px] tracking-[0.22em] text-[#5a7a78] font-mono">SHELL OS</div>
            <div className="mt-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#111e20] border border-[#1a3a3d]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2de8c3] animate-pulse" />
              <span className="text-[10px] font-mono text-[#8ab3ad] tracking-wide">v7.15.112 FINAL</span>
            </div>
          </div>
          <div className="mt-10 w-[280px] flex flex-col gap-1.5">
            {BOOT_LOGS.slice(0, logIdx).map((l, i) => (
              <div key={i} className="text-[11px] font-mono text-[#5a7a78] flex gap-2">
                <span className="text-[#2de8c3]">{l.slice(0, 6)}</span>
                <span className="text-[#8ab3ad]/80">{l.slice(6)}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 w-[240px] h-[2px] bg-[#111e20] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2de8c3] transition-all duration-100 ease-linear"
              style={{ width: `${progress}%`, boxShadow: '0 0 8px rgba(45,232,195,0.6)' }}
            />
          </div>
          <div className="mt-2 text-[10px] font-mono text-[#5a7a78]">{Math.round(progress)}% INITIALIZED</div>
        </div>
      )}
      <style>{`@keyframes pulseGlow{0%,100%{filter:drop-shadow(0 0 8px rgba(45,232,195,0.35))}50%{filter:drop-shadow(0 0 18px rgba(45,232,195,0.6))}}`}</style>
    </div>
  );
}
