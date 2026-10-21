import { Lock, LogOut, Power, Settings, Users } from 'lucide-react';
import { useEffect } from 'react';
import { SHELL_USER, SYSTEM_MENU_MAIN, SYSTEM_MENU_SESSION, type SystemMenuIcon } from '../lib/desktop.fixtures';

const MENU_ICONS: Record<SystemMenuIcon, typeof Lock> = {
  lock: Lock,
  users: Users,
  settings: Settings,
  logout: LogOut,
  power: Power,
};

export function SystemMenu({ onAction, onClose }: { onAction: (a: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <button
        type="button"
        aria-label="Close system menu"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div
        role="menu"
        aria-label="System menu"
        className="absolute top-[40px] right-3 w-[220px] rounded-[var(--vestara-radius-xl)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] shadow-[var(--vestara-elevation-shell-float)] p-1.5 z-50 overflow-hidden"
      >
        <div className="px-2.5 py-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[var(--vestara-accent-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-label)] font-bold text-[var(--vestara-surface-shell-canvas)]">
            {SHELL_USER.initial}
          </div>
          <div>
            <div className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
              {SHELL_USER.name}
            </div>
            <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[var(--vestara-status-shell-success)] animate-pulse" />
              {SHELL_USER.statusShort}
            </div>
          </div>
        </div>
        <div className="h-px bg-[var(--vestara-border-shell)] my-1" />
        {SYSTEM_MENU_MAIN.map((it) => {
          const Icon = MENU_ICONS[it.icon];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onAction(it.id)}
              className="w-full h-8 rounded-[var(--vestara-radius-lg)] px-2.5 flex items-center gap-2.5 text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-hover)] hover:text-[var(--vestara-text-shell-primary)] transition text-left"
            >
              <Icon size={12} />
              {it.label}
            </button>
          );
        })}
        <div className="h-px bg-[var(--vestara-border-shell)] my-1" />
        {SYSTEM_MENU_SESSION.map((it) => {
          const Icon = MENU_ICONS[it.icon];
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onAction(it.id)}
              className={`w-full h-8 rounded-[var(--vestara-radius-lg)] px-2.5 flex items-center gap-2.5 text-[length:var(--vestara-font-size-label)] transition text-left ${it.danger ? 'text-[var(--vestara-status-shell-danger-light)] hover:bg-[var(--vestara-status-shell-danger)]/10 hover:text-[var(--vestara-status-shell-danger)]' : 'text-[var(--vestara-text-shell-secondary)] hover:bg-[var(--vestara-surface-shell-hover)] hover:text-[var(--vestara-text-shell-primary)]'}`}
            >
              <Icon size={12} />
              {it.label}
            </button>
          );
        })}
        <div className="mt-2 px-2.5 py-1.5 rounded-[var(--vestara-radius-lg)] bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)]/60">
          <div className="text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-muted)]">
            VESTARA SHELL OS • 112 FINAL
          </div>
          <div className="text-[length:var(--vestara-font-size-micro)] font-mono text-[var(--vestara-text-shell-faint)]">
            192.168.8.1 • 128ms • OpenCode Online
          </div>
        </div>
      </div>
    </>
  );
}
