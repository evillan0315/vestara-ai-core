import { Activity, FolderOpen, LayoutDashboard, Store, Terminal } from 'lucide-react';
import { DESKTOP_ICONS } from '../lib/desktop.fixtures';
import type { WinType } from '../lib/types';

const ICONS = {
  overview: LayoutDashboard,
  activity: Activity,
  marketplace: Store,
  terminal: Terminal,
  files: FolderOpen,
} as const;

export function DesktopIcons({ onOpen }: { onOpen: (t: WinType) => void }) {
  return (
    <div className="absolute left-3 top-[48px] z-10 flex flex-col gap-3">
      {DESKTOP_ICONS.map((it) => {
        const Icon = ICONS[it.type];
        return (
          <button
            key={it.label}
            type="button"
            aria-label={`Open ${it.label}`}
            onDoubleClick={() => onOpen(it.type)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(it.type);
              }
            }}
            className="group w-[72px] flex flex-col items-center gap-1.5"
          >
            <div className="w-10 h-10 rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)]/60 border border-[var(--vestara-border-shell)]/50 group-hover:bg-[var(--vestara-surface-shell-hover)] group-hover:border-[var(--vestara-accent-shell)]/20 flex items-center justify-center backdrop-blur-sm transition">
              <Icon
                size={16}
                className="text-[var(--vestara-text-shell-secondary)] group-hover:text-[var(--vestara-text-shell-primary)]"
              />
            </div>
            <span className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)] group-hover:text-[var(--vestara-text-shell-primary)] font-mono text-center leading-tight">
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
