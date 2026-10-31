import { Activity, Box, Cpu, FolderOpen, LayoutDashboard, Mic, Settings, Store, Terminal } from 'lucide-react';
import { DOCK_TYPES } from '../lib/desktop.fixtures';
import type { WinData, WinType } from '../lib/types';
import { VestaraLogoTeal } from './VestaraLogoTeal';

const icons: Record<WinType, any> = {
  workspace: LayoutDashboard,
  overview: LayoutDashboard,
  terminal: Terminal,
  marketplace: Store,
  files: FolderOpen,
  settings: Settings,
  activity: Activity,
  agent: Box,
  diagnostic: Cpu,
  voice: Mic,
};

export function Dock({
  windows,
  onOpen,
  onRestore,
  types = DOCK_TYPES,
}: {
  windows: WinData[];
  onOpen: (t: WinType) => void;
  onRestore: (id: string) => void;
  types?: WinType[];
}) {
  return (
    <div
      role="toolbar"
      aria-label="Application dock"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 h-12 rounded-[var(--vestara-radius-xl)] bg-[var(--vestara-surface-shell-raised)]/80 backdrop-blur-xl border border-[var(--vestara-border-shell)] shadow-[var(--vestara-elevation-shell-float)]"
    >
      <div className="flex items-center gap-1">
        {types.map((t) => {
          const Icon = icons[t];
          const isOpen = windows.some((w) => w.type === t && !w.minimized);
          const hasMinimized = windows.some((w) => w.type === t && w.minimized);
          return (
            <button
              key={t}
              type="button"
              aria-label={`Open ${t} window`}
              onClick={() => {
                const minWin = windows.find((w) => w.type === t && w.minimized);
                if (minWin) onRestore(minWin.id);
                else onOpen(t);
              }}
              className={`relative w-8 h-8 rounded-[var(--vestara-radius-lg)] flex items-center justify-center border transition ${isOpen ? 'bg-[var(--vestara-surface-shell-hover)] border-[var(--vestara-accent-shell)]/20 text-[var(--vestara-accent-shell)]' : 'bg-transparent border-transparent text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-raised)] hover:border-[var(--vestara-border-shell)] hover:text-[var(--vestara-text-shell-primary)]'}`}
            >
              <Icon size={14} />
              {(isOpen || hasMinimized) && (
                <span
                  className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${hasMinimized ? 'bg-[var(--vestara-status-shell-warning)]' : 'bg-[var(--vestara-accent-shell)]'}`}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="w-px h-6 bg-[var(--vestara-border-shell)] mx-1" />
      <div className="w-6 h-6 rounded-[var(--vestara-radius-md)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] flex items-center justify-center">
        <VestaraLogoTeal size={14} />
      </div>
    </div>
  );
}
