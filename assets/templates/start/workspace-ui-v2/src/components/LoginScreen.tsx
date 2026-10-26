import { Activity, Store, Terminal } from 'lucide-react';
import { useState } from 'react';
import type { LoginMode } from '../lib/types';
import { VestaraLogoTeal } from './VestaraLogoTeal';

export function LoginScreen({ onLogin, mode }: { onLogin: () => void; mode: LoginMode }) {
  const [pwd, setPwd] = useState('');
  const title = mode === 'locked' ? 'Locked' : mode === 'switch' ? 'Switch User' : 'Welcome back';
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center">
      <img
        src={new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.png', import.meta.url).href}
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
      />
      <div className="absolute inset-0 bg-[#0a1214]/65 backdrop-blur-[20px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1214]/20 via-transparent to-[#0a1214]/60" />
      <div className="relative z-10 w-[960px] max-w-[92vw] h-[560px] max-h-[88vh] rounded-[20px] bg-[#0d191b]/85 border border-[#1a3a3d] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden grid grid-cols-1 md:grid-cols-[45%_55%] backdrop-blur-xl">
        <div className="relative p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#1a3a3d]/60 bg-[#0d191b]/40">
          <div>
            <div className="flex items-center gap-3">
              <VestaraLogoTeal size={44} glow />
              <div>
                <div className="text-[13px] font-bold tracking-[0.08em] text-[#e6fff9]">VESTARA</div>
                <div className="text-[9px] tracking-[0.22em] text-[#5a7a78] -mt-0.5">SHELL OS</div>
              </div>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
            </div>
            <div className="mt-8">
              <div
                className="text-[28px] leading-[1.1] text-[#e6fff9]"
                style={{ fontFamily: 'Instrument Serif, serif' }}
              >
                First-class
                <br />
                Desktop Shell
              </div>
              <div className="mt-3 text-[11px] leading-5 text-[#8ab3ad] max-w-[220px]">
                Draggable Workspace
                <br />
                Wired Packages
                <br />
                Teal V identity system
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-3">
              {[
                { t: 'Terminal', d: 'wired registry', i: Terminal },
                { t: 'Activity', d: '7 agents mesh', i: Activity },
                { t: 'Marketplace', d: 'package index', i: Store },
              ].map((c, idx) => (
                <div
                  key={idx}
                  className="rounded-[10px] bg-[#111e20]/70 border border-[#1a3a3d]/60 p-3 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-[8px] bg-[#0d191b] border border-[#1a3a3d] flex items-center justify-center">
                    <c.i size={14} className="text-[#5a7a78]" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-[#c8ddd9]">{c.t}</div>
                    <div className="text-[9px] font-mono text-[#5a7a78]">{c.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] font-mono text-[#4a6a68] mt-6">
            v7.15.112 FINAL • teal identity • 32px header • drag shell
          </div>
        </div>

        <div className="p-8 flex flex-col justify-center">
          <div className="mb-6">
            <div className="text-[24px] font-medium text-[#e6fff9]" style={{ fontFamily: 'Instrument Serif, serif' }}>
              {title}, Director.
            </div>
            <div className="text-[11px] text-[#8ab3ad] mt-1">
              {mode === 'locked'
                ? 'Enter password to unlock'
                : mode === 'switch'
                  ? 'Select user to switch'
                  : 'Secure login to Vestara Desktop'}{' '}
              • vestara-platform
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-2.5 rounded-[12px] bg-[#111e20] border border-[#1a3a3d]">
              <div className="w-9 h-9 rounded-full bg-[#2de8c3] flex items-center justify-center text-[12px] font-bold text-[#0a1214]">
                E
              </div>
              <div>
                <div className="text-[12px] text-[#c8ddd9] font-medium">Eddie R Villanueva</div>
                <div className="text-[10px] text-[#5a7a78]">Online • 7 agents • 1 workflow</div>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.12em] text-[#5a7a78] font-mono">PASSWORD</label>
              <input
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                type="password"
                placeholder="••••••••"
                className="mt-1.5 w-full h-10 rounded-[10px] bg-[#0a1214] border border-[#1a3a3d] px-3 text-[12px] text-[#c8ddd9] placeholder:text-[#4a6a68] outline-none focus:border-[#2de8c3]/40"
                onKeyDown={(e) => e.key === 'Enter' && onLogin()}
              />
            </div>
            <button
              onClick={onLogin}
              className="w-full h-11 rounded-[10px] bg-[#2de8c3] text-[#0a1214] text-[12px] font-bold tracking-wide hover:brightness-105 transition"
            >
              Continue → Desktop
            </button>
            <div className="flex justify-between text-[10px] font-mono">
              <button className="text-[#5a7a78] hover:text-[#8ab3ad]">Biometric • Touch ID</button>
              <button className="text-[#5a7a78] hover:text-[#8ab3ad]">Skip to Desktop</button>
            </div>
            <div className="pt-4 border-t border-[#1a3a3d]/50 text-[10px] font-mono text-[#4a6a68] flex justify-between">
              <span>7 agents ready</span>
              <span>192.168.8.1 • OpenCode Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
