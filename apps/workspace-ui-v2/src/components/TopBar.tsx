import { Battery, ChevronDown, Clock3, Search, Wifi } from 'lucide-react';
import { VestaraLogoTeal } from './VestaraLogoTeal';

export function TopBar({
  onLogoClick,
  onAvatarClick,
  timeStr,
  dateStr,
}: {
  onLogoClick: () => void;
  onAvatarClick: () => void;
  timeStr: string;
  dateStr: string;
}) {
  return (
    <header className="h-[var(--vestara-sizing-topbar-height)] shrink-0 w-full bg-[var(--vestara-surface-shell-panel)]/80 backdrop-blur-xl border-b border-[var(--vestara-border-shell)]/60 flex items-center justify-between px-3 sticky top-0 z-30">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onLogoClick}
          aria-label="Open system menu"
          className="flex items-center gap-2 hover:opacity-90"
        >
          <VestaraLogoTeal size={20} glow />
          <span className="text-[length:var(--vestara-font-size-label)] font-bold tracking-[-0.02em] text-[var(--vestara-text-shell-primary)]">
            VESTARA
          </span>
          <span className="w-1 h-1 rounded-full bg-[var(--vestara-status-shell-success)] animate-pulse" />
          <span className="text-[length:var(--vestara-font-size-micro)] px-1.5 py-0.5 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-muted)] font-mono">
            v2.0
          </span>
        </button>
      </div>

      <div className="hidden md:flex items-center">
        <div className="flex items-center gap-1.5 h-[22px] w-[var(--vestara-sizing-topbar-spotlight-width)] rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] px-3">
          <Search size={10} className="text-[var(--vestara-text-shell-muted)]" />
          <span className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] font-mono">
            Spotlight
          </span>
          <span className="ml-auto text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-faint)] border border-[var(--vestara-border-shell)] rounded px-1">
            ⌘K
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden sm:flex items-center gap-1.5 mr-2 px-2 h-[22px] rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)]">
          <Clock3 size={10} className="text-[var(--vestara-text-shell-muted)]" />
          <span className="text-[length:var(--vestara-font-size-caption)] font-mono text-[var(--vestara-text-shell-primary)]">
            {timeStr.split(':').slice(0, 2).join(':')}
            <span className="text-[var(--vestara-accent-shell)]">:{timeStr.split(':')[2]}</span>
          </span>
          <span className="text-[length:var(--vestara-font-size-micro)] text-[var(--vestara-text-shell-muted)]">
            {dateStr}
          </span>
        </div>
        <button
          type="button"
          aria-label="Wi-Fi status"
          className="w-6 h-6 rounded-[var(--vestara-radius-md)] flex items-center justify-center hover:bg-[var(--vestara-surface-shell-raised)] border border-transparent hover:border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)] hover:text-[var(--vestara-text-shell-primary)] transition"
        >
          <Wifi size={12} />
        </button>
        <button
          type="button"
          aria-label="Battery status"
          className="w-6 h-6 rounded-[var(--vestara-radius-md)] flex items-center justify-center hover:bg-[var(--vestara-surface-shell-raised)] border border-transparent hover:border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-secondary)] hover:text-[var(--vestara-text-shell-primary)] transition"
        >
          <Battery size={12} />
        </button>
        <button
          type="button"
          onClick={onAvatarClick}
          aria-label="Account menu"
          className="flex items-center gap-1 pl-1 pr-1.5 h-6 rounded-full bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] hover:border-[var(--vestara-accent-shell)]/30 hover:bg-[var(--vestara-surface-shell-hover)] transition"
        >
          <div className="w-4 h-4 rounded-full bg-[var(--vestara-accent-shell)] flex items-center justify-center text-[length:var(--vestara-font-size-micro-small)] font-bold text-[var(--vestara-surface-shell-canvas)]">
            E
          </div>
          <ChevronDown size={10} className="text-[var(--vestara-text-shell-muted)]" />
        </button>
      </div>
    </header>
  );
}
