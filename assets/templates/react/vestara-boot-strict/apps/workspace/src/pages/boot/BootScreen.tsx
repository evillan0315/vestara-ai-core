import { BootSteps, VerifiedHash } from '@vestara/types/boot';
import React, { useEffect } from 'react';
import { HashVerifier } from './components/HashVerifier';
import { MatrixCanvas } from './components/MatrixCanvas';
import { ProgressBar } from './components/ProgressBar';
import { SystemLog } from './components/SystemLog';
import { VLogo } from './components/VLogo';
import { useBootSequence } from './hooks/useBootSequence';

export function BootScreen() {
  const {
    phase,
    setPhase,
    hashText,
    setHashText,
    progress,
    setProgress,
    activeIndex,
    setActiveIndex,
    completedSteps,
    setCompletedSteps,
    paused,
    showRecovery,
    showExtManager,
    replayKey,
    replay,
    clearTimers,
    timers,
  } = useBootSequence();
  const [glitching, setGlitching] = React.useState(false);

  // Hash typing animation - phase 0
  useEffect(() => {
    if (phase !== 0 || paused) return;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setHashText(VerifiedHash.slice(0, i));
      if (i >= VerifiedHash.length) {
        window.clearInterval(id);
        const t = window.setTimeout(() => setPhase(1), 420);
        timers.current.push(t);
      }
    }, 18);
    return () => window.clearInterval(id);
  }, [phase, paused, replayKey]);

  // Phase transitions
  useEffect(() => {
    if (paused) return;
    if (phase === 1) {
      const t = window.setTimeout(() => setPhase(2), 850);
      timers.current.push(t);
      return () => window.clearTimeout(t);
    }
    if (phase === 2) {
      const t = window.setTimeout(() => setPhase(3), 750);
      timers.current.push(t);
      return () => window.clearTimeout(t);
    }
    if (phase === 4) {
      const t = window.setTimeout(() => setPhase(5), 1400);
      timers.current.push(t);
      return () => window.clearTimeout(t);
    }
  }, [phase, paused]);

  // Logging + progress - phase 3
  useEffect(() => {
    if (phase !== 3 || paused) return;
    let p = progress;
    const interval = window.setInterval(() => {
      p = Math.min(100, p + (Math.random() * 1.8 + 0.7));
      setProgress(p);
      const idx = Math.min(BootSteps.length - 1, Math.floor((p / 100) * BootSteps.length));
      setActiveIndex(idx);
      setCompletedSteps((prev) => {
        const next = [...prev];
        for (let j = 0; j < idx; j++) if (!next.includes(j)) next.push(j);
        if (p > 98 && !next.includes(BootSteps.length - 1)) next.push(BootSteps.length - 1);
        return next;
      });
      if (p >= 100) {
        window.clearInterval(interval);
        const t = window.setTimeout(() => setPhase(4), 350);
        timers.current.push(t);
      }
    }, 38);
    return () => window.clearInterval(interval);
  }, [phase, paused, progress]);

  // Glitch effect
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Math.random() > 0.72 && !paused) {
        setGlitching(true);
        setTimeout(() => setGlitching(false), 120 + Math.random() * 160);
      }
    }, 900);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div
      className="relative min-h-[100dvh] w-full bg-[#050507] text-[#E6F1F3] overflow-hidden flex flex-col items-center justify-center select-none"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('[data-no-replay]')) return;
        replay();
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Syne:wght@500;600;700&display=swap'); @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}} @keyframes glowPulse{0%,100%{filter:drop-shadow(0 0 8px rgba(0,229,255,0.55)) drop-shadow(0 0 24px rgba(0,229,255,0.18))}50%{filter:drop-shadow(0 0 14px rgba(0,229,255,0.85)) drop-shadow(0 0 42px rgba(0,229,255,0.28))}} @keyframes barShine{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}} @keyframes glitchX{0%{transform:translate(0) skew(0)}20%{transform:translate(-1px,0) skew(0.6deg)}40%{transform:translate(1px,0) skew(-0.4deg)}60%{transform:translate(-0.5px,0.5px)}80%{transform:translate(0.5px,0)}100%{transform:translate(0)}} @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_18%,rgba(0,229,255,0.09),transparent_60%),radial-gradient(35%_35%_at_85%_78%,rgba(0,229,255,0.06),transparent_60%)]" />
        <MatrixCanvas paused={paused} replayKey={replayKey} />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="z-10 flex flex-col items-center gap-8">
        {phase === 0 && <HashVerifier hashText={hashText} fullHash={VerifiedHash} />}
        {phase >= 1 && (
          <>
            <VLogo glitching={glitching} phase={phase} />
            <div
              className={`transition-all duration-700 ${phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            >
              <div className="font-['Syne'] text-[11px] tracking-[0.18em] text-white/30 text-center">
                Let&apos;s Change the World.
              </div>
            </div>
          </>
        )}
        {phase === 3 && (
          <>
            <SystemLog steps={BootSteps} activeIndex={activeIndex} completed={completedSteps} progress={progress} />
            <ProgressBar progress={progress} />
          </>
        )}
        {phase === 4 && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-[32px] h-[32px] rounded-full border border-[#00FFA3]/20 bg-[#00FFA3]/10 flex items-center justify-center">
              <span className="text-[#00FFA3]">✓</span>
            </div>
            <div className="font-['Syne'] text-[22px] tracking-[-0.01em]">Ready</div>
            <div className="font-mono text-[10px] text-white/40">Immutable A/B • Verified Boot • Portable SSD</div>
          </div>
        )}
        {phase === 5 && (
          <div className="w-[760px] max-w-[90vw] aspect-[16/10] rounded-[18px] border border-white/[0.07] bg-[#0A0A0C]/80 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset] p-4">
            <div className="flex gap-1.5 mb-4">
              <div className="w-[10px] h-[10px] rounded-full bg-[#FF5F56]" />
              <div className="w-[10px] h-[10px] rounded-full bg-[#FFBD2E]" />
              <div className="w-[10px] h-[10px] rounded-full bg-[#27CA3F]" />
            </div>
            <div className="grid grid-cols-[200px_1fr] gap-4 h-[calc(100%-34px)]">
              <div className="rounded-[12px] bg-white/[0.03] border border-white/[0.05] p-3">
                <div className="font-mono text-[10px] text-white/40">Inbox • Workspace • Vault</div>
              </div>
              <div className="rounded-[12px] bg-white/[0.03] border border-white/[0.05] p-3">
                <div className="font-mono text-[10px] text-white/40">Desktop Preview — Vestara AI OS v1.0.0</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="absolute bottom-[42px] left-1/2 -translate-x-1/2 flex gap-3 font-mono text-[10px] text-white/25"
        data-no-replay
      >
        <span className="hidden sm:flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded-[4px] bg-white/[0.06] border border-white/[0.06]">SPACE</kbd>{' '}
          {paused ? 'Resume' : 'Pause'}
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded-[4px] bg-white/[0.06] border border-white/[0.06]">ESC</kbd> Recovery
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded-[4px] bg-white/[0.06] border border-white/[0.06]">E</kbd> Extensions
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded-[4px] bg-white/[0.06] border border-white/[0.06]">R</kbd> Replay
        </span>
      </div>

      {showRecovery && (
        <div
          className="absolute inset-0 z-30 bg-[#050507]/80 backdrop-blur-2xl flex items-center justify-center p-6"
          data-no-replay
        >
          <div className="w-full max-w-[520px] rounded-[16px] border border-white/[0.08] bg-[#0E0E11] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <div className="font-['Syne'] text-[15px] mb-4">Recovery Console</div>
            <div className="space-y-2 font-mono text-[11px] text-white/60">
              <div className="flex justify-between">
                <span>Slot A</span>
                <span className="text-[#00FFA3]">Active • Verified</span>
              </div>
              <div className="flex justify-between">
                <span>Slot B</span>
                <span className="text-white/30">Standby • v1.0.0</span>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="px-3 py-1.5 rounded-[8px] bg-white/[0.06] border border-white/[0.06]">
                  Rollback to B
                </button>
                <button className="px-3 py-1.5 rounded-[8px] bg-[#00E5FF]/15 border border-[#00E5FF]/20 text-[#00E5FF]">
                  Verify Disk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExtManager && (
        <div
          className="absolute inset-0 z-30 bg-[#050507]/80 backdrop-blur-2xl flex items-center justify-center p-6"
          data-no-replay
        >
          <div className="w-full max-w-[520px] rounded-[16px] border border-white/[0.08] bg-[#0E0E11] p-6">
            <div className="font-['Syne'] text-[15px] mb-4">Extension Manager</div>
            <div className="space-y-2 font-mono text-[11px] text-white/60">
              <div>filesystem-ext • sandbox • wasm</div>
              <div>local-llm • on-demand • no auto-start</div>
              <div>browser-bridge • isolated</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
