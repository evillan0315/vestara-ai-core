import type { TerminalSession } from './types';
import { useVestaraTheme } from '@vestara/ui-theme';

interface TerminalHeroProps {
  session?: TerminalSession | null;
}

export function TerminalHero({ session }: TerminalHeroProps) {
  const { resolvedMode } = useVestaraTheme();

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-[var(--vestara-surface-panel)] border-b border-[var(--vestara-accent-border)]">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full var(--vestara-status-active)" />
        <span className="text-[var(--vestara-text)] font-medium">Vestara Terminal</span>
      </div>

      {session && (
        <div className="flex-1 flex items-center gap-2 truncate">
          <span className="text-[var(--vestara-text-dim)]">Active session</span>
          <span className="text-[var(--vestara-text)] font-mono truncate max-w-[300px]" title={session?.cwd}>
            {session?.cwd}
          </span>
        </div>
      )}

      {session && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full var(--vestara-status-active)" />
          <span className="text-[var(--vestara-text-dim)]">|</span>
          <span className="text-[var(--vestara-text-2)]">{session?.shell}</span>
        </div>
      )}
    </header>
  );
}