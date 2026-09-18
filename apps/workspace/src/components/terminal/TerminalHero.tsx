import type { TerminalSession } from './types';
import { useVestaraTheme } from '@vestara/ui-theme';

interface TerminalHeroProps {
  session?: TerminalSession | null;
}

export function TerminalHero({ session }: TerminalHeroProps) {
  const { resolvedMode } = useVestaraTheme();

  return (
    <header className="flex items-center gap-3 px-4 py-2 bg-(--vestara-surface-panel) border-b border-(--vestara-accent-border)">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full {resolvedMode === 'dark' ? 'bg-green-500' : 'bg-green-300'}"/>
        <span className="text-(--vestara-text) font-medium">Vestara Terminal</span>
      </div>

      {session && (
        <div className="flex-1 flex items-center gap-2 truncate">
          <span className="text-(--vestara-text-dim)">Active session</span>
          <span className="text-(--vestara-text) font-mono truncate max-w-[300px]" title={session.cwd}>
            {session.cwd}
          </span>
        </div>
      )}

      {session && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full {resolvedMode === 'dark' ? 'bg-red-500' : 'bg-red-400'}"/>
          <span className="text-(--vestara-text-dim)">|</span>
          <span className="text-(--vestara-text-2)">{session.shell}</span>
        </div>
      )}
    </header>
  );
}