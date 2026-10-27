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
    <div className="absolute inset-0 w-full h-full bg-[var(--vestara-surface-shell-canvas)] overflow-hidden flex flex-col items-center justify-center">
      <img
        src={new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.png', import.meta.url).href}
        className="absolute inset-0 w-full h-full object-cover opacity-[0.10] blur-[20px]"
        alt=""
      />
      <div className="absolute inset-0 bg-[var(--vestara-surface-shell-canvas)]/40" />
      {shutting ? (
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="w-10 h-10 rounded-full border-2 border-[var(--vestara-border-shell)] border-t-[var(--vestara-accent-shell)] animate-spin" />
          <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.22em] text-[var(--vestara-text-shell-muted)] font-mono">
            SHUTTING DOWN AI OS
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center">
          <div className="animate-[pulseGlow_2.2s_ease-in-out_infinite]">
            <VestaraLogoTeal size={120} glow />
          </div>
          <div className="mt-6 flex flex-col items-center">
            <div className="text-[length:var(--vestara-font-size-display)] leading-none tracking-[-0.02em] text-[var(--vestara-text-shell-bright)] font-[family-name:var(--vestara-font-family-display)]">
              VESTARA
            </div>
            <div className="mt-1 text-[length:var(--vestara-font-size-caption)] tracking-[0.22em] text-[var(--vestara-text-shell-muted)] font-mono">
              AI OS
            </div>
            <div className="mt-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)]">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--vestara-accent-shell)] animate-pulse" />
              <span className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-secondary)] tracking-wide">
                v2.0.0 FINAL
              </span>
            </div>
          </div>
          <div aria-live="polite" className="mt-10 w-[280px] flex flex-col gap-1.5">
            {BOOT_LOGS.slice(0, logIdx).map((l) => (
              <div
                key={l}
                className="text-[length:var(--vestara-font-size-label)] font-mono text-[var(--vestara-text-shell-muted)] flex gap-2"
              >
                <span className="text-[var(--vestara-accent-shell)]">{l.slice(0, 6)}</span>
                <span className="text-[var(--vestara-text-shell-secondary)]/80">{l.slice(6)}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 w-[240px] h-[2px] bg-[var(--vestara-surface-shell-raised)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--vestara-accent-shell)] shadow-[var(--vestara-elevation-shell-glow)] transition-all duration-[var(--vestara-motion-fast)] ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-muted)]">
            {Math.round(progress)}% INITIALIZED
          </div>
        </div>
      )}
    </div>
  );
}
