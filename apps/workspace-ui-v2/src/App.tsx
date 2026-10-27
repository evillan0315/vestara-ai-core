import { useCallback, useEffect, useRef, useState } from 'react';
import { BootScreen } from './components/BootScreen';
import { DesktopIcons } from './components/DesktopIcons';
import { Dock } from './components/Dock';
import { FloatingAssistant } from './components/FloatingAssistant';
import { LoginScreen } from './components/LoginScreen';
import { SystemMenu } from './components/SystemMenu';
import { TopBar } from './components/TopBar';
import { VestaraWindow } from './components/VestaraWindow';
import { getColdStartWinType, subscribeDeepLinks } from './lib/deep-link';
import { DEFAULT_WINDOWS, WINDOW_TITLES } from './lib/desktop.fixtures';
import type { LoginMode, Phase, WinData, WinType } from './lib/types';
import { WALLPAPER_SOURCES } from './lib/wallpapers';
import { applyPersistedShellAppearance } from './lib/workspace-settings-model';
import { ActivityRoomPkg } from './packages/ActivityRoom';
import { AgentPkg } from './packages/AgentWorkforce';
import { DiagnosticPkg } from './packages/Diagnostic';
import { FilesPkg } from './packages/Files';
import { MarketplacePkg } from './packages/Marketplace';
import { OverviewPkg } from './packages/Overview';
import { SettingsPkg } from './packages/Settings';
import { TerminalPkg } from './packages/Terminal';

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [loginMode, setLoginMode] = useState<LoginMode>('default');
  const [showMenu, setShowMenu] = useState(false);
  const [now, setNow] = useState(new Date());
  const [zCounter, setZCounter] = useState(10);
  const spawnRef = useRef(0);

  const [wins, setWins] = useState<WinData[]>(DEFAULT_WINDOWS);

  // Shell boot: apply the persisted, framework-validated appearance once.
  useEffect(() => {
    applyPersistedShellAppearance().catch(() => {});
  }, []);

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();

  const bringFront = (id: string) => {
    setZCounter((z) => z + 1);
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: zCounter + 1 } : w)));
  };

  const updateWin = (id: string, patch: Partial<WinData>) =>
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const openType = (t: WinType) => {
    const existing = wins.find((w) => w.type === t);
    if (existing) {
      if (existing.minimized) updateWin(existing.id, { minimized: false });
      bringFront(existing.id);
      return;
    }
    const n = ++spawnRef.current;
    const id = `win-${t}-${n}`;
    const titles = WINDOW_TITLES;
    setZCounter((z) => z + 1);
    setWins((w) => [
      ...w,
      {
        id,
        title: titles[t],
        subtitle: `${t} • wired registry`,
        x: 120 + ((n * 53) % 120),
        y: 60 + ((n * 37) % 120),
        w: 640,
        h: 400,
        z: zCounter + 1,
        minimized: false,
        maximized: false,
        type: t,
      },
    ]);
  };

  const closeWin = (id: string) => setWins((ws) => ws.filter((w) => w.id !== id));
  const minimizeWin = (id: string) => updateWin(id, { minimized: true });

  const handleSystemAction = (a: string) => {
    setShowMenu(false);
    if (a === 'lockscreen') {
      setLoginMode('locked');
      setPhase('login');
    }
    if (a === 'logout') {
      setLoginMode('default');
      setPhase('login');
    }
    if (a === 'switch') {
      setLoginMode('switch');
      setPhase('login');
    }
    if (a === 'shutdown') {
      setPhase('shutdown');
    }
    if (a === 'settings') {
      openType('settings');
    }
  };

  const renderPkg = (type: WinType) => {
    switch (type) {
      case 'terminal':
        return <TerminalPkg />;
      case 'activity':
        return <ActivityRoomPkg />;
      case 'marketplace':
        return <MarketplacePkg />;
      case 'overview':
        return <OverviewPkg />;
      case 'workspace':
        return <OverviewPkg />;
      case 'settings':
        return <SettingsPkg />;
      case 'agent':
        return <AgentPkg />;
      case 'diagnostic':
        return <DiagnosticPkg />;
      case 'files':
        return <FilesPkg />;
      default:
        return (
          <div className="p-4 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-muted)]">
            Package {type} wired
          </div>
        );
    }
  };

  // Stable callbacks: App re-renders every second (clock), and an inline
  // onDone would reset BootScreen's timers on each render — the boot screen
  // would never advance to login.
  const handleBootDone = useCallback(() => setPhase('login'), []);
  const handleShutdownDone = useCallback(() => {
    setLoginMode('default');
    setPhase('login');
  }, []);
  const handleLogin = useCallback(() => setPhase('desktop'), []);

  // U3 — `teal://vestara-shell` deep links: cold-start opens the launch
  // package, running-app links open on arrival. No-op in the browser
  // (`subscribeDeepLinks` / `getColdStartWinType` resolve to null outside
  // the Tauri shell). `openTypeRef` keeps the subscription stable across
  // the per-second clock re-renders.
  const openTypeRef = useRef(openType);
  openTypeRef.current = openType;
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    getColdStartWinType().then((target) => {
      if (target && !cancelled) openTypeRef.current(target);
    });
    subscribeDeepLinks((target) => {
      openTypeRef.current(target);
    }).then((stop) => {
      unlisten = stop;
      if (cancelled) stop();
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (phase === 'boot') return <BootScreen onDone={handleBootDone} />;
  if (phase === 'shutdown') return <BootScreen shutting onDone={handleShutdownDone} />;
  if (phase === 'login') return <LoginScreen mode={loginMode} onLogin={handleLogin} />;

  return (
    <div className="w-screen h-screen overflow-hidden bg-[var(--vestara-surface-shell-canvas)] relative select-none">
      <picture>
        <source srcSet={WALLPAPER_SOURCES.avif} type="image/avif" />
        <source srcSet={WALLPAPER_SOURCES.webp} type="image/webp" />
        <img src={WALLPAPER_SOURCES.png} className="absolute inset-0 w-full h-full object-cover" alt="" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--vestara-surface-shell-canvas)]/30 via-[var(--vestara-surface-shell-canvas)]/10 to-[var(--vestara-surface-shell-canvas)]/60" />
      <div className="absolute inset-0 bg-[var(--vestara-surface-shell-canvas)]/20 backdrop-blur-[0.5px]" />

      <div className="relative z-10 w-full h-full flex flex-col">
        <TopBar
          onLogoClick={() => setShowMenu((v) => !v)}
          onAvatarClick={() => setShowMenu((v) => !v)}
          timeStr={timeStr}
          dateStr={dateStr}
        />
        {showMenu && <SystemMenu onAction={handleSystemAction} onClose={() => setShowMenu(false)} />}

        <div className="flex-1 relative overflow-hidden">
          <DesktopIcons onOpen={openType} />
          {wins.map((w) => (
            <VestaraWindow
              key={w.id}
              data={w}
              isFocused={w.z === Math.max(...wins.filter((x) => !x.minimized).map((x) => x.z), 0)}
              onFocus={bringFront}
              onClose={closeWin}
              onMinimize={minimizeWin}
              onUpdate={updateWin}
            >
              {renderPkg(w.type)}
            </VestaraWindow>
          ))}
        </div>

        <Dock
          windows={wins}
          onOpen={openType}
          onRestore={(id) => {
            updateWin(id, { minimized: false });
            bringFront(id);
          }}
        />

        <FloatingAssistant onAction={openType} />

        <div className="absolute bottom-2 left-3 text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-muted)]/60 pointer-events-none">
          Vestara Desktop • {wins.filter((w) => !w.minimized).length} windows • 7 agents • v112 FINAL • 32px header •
          teal logo
        </div>
      </div>
    </div>
  );
}
