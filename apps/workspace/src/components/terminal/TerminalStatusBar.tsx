import type { TerminalSession } from './types';
import { useVestaraTheme } from '@vestara/ui-theme';

interface TerminalStatusBarProps {
  session: TerminalSession | null;
  connected: boolean;
  reconnectCount: number;
  uptime: number;
}

export function TerminalStatusBar({ session, connected, reconnectCount, uptime }: TerminalStatusBarProps) {
  const { resolvedMode } = useVestaraTheme();
  const isConnected = resolvedMode === 'dark'
    ? connected ? '--vestara-status-active' : '--vestara-status-error'
    : connected ? '--vestara-status-active' : '--vestara-status-error';

  const fmtUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-1 bg-[var(--vestara-accent-bg)] border-t border-[var(--vestara-accent-border)] text-[10px]">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${connected ? 'var(--vestara-status-active)' : 'var(--vestara-status-error)'}`} />
        <span className={connected ? 'var(--vestara-status-active)' : 'var(--vestara-status-error)'}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {connected && (
          <div className="flex items-end gap-[1px] ml-1">
            <span className="w-[2px] h-[6px] rounded-sm" />
            <span className="w-[2px] h-[8px] rounded-sm" />
            <span className="w-[2px] h-[10px] rounded-sm" />
            <span className="w-[2px] h-[12px] rounded-sm" />
          </div>
        )}
      </div>

      {session && (
        <>
          <span className="text-[var(--vestara-text-dim)]">|</span>
          <span className="text-[var(--vestara-text-2)] font-mono truncate max-w-[200px]" title={session?.cwd}>
            {session?.cwd}
          </span>
          <span className="text-[var(--vestara-text-dim)]">|</span>
          <span className="text-[var(--vestara-text-2)]">{session?.shell}</span>
          {session?.processStatus === 'running' && (
            <>
              <span className="text-[var(--vestara-text-dim)]">|</span>
              <span className="var(--vestara-status-running)">⟳ running</span>
            </>
          )}
          {session?.exitCode !== undefined && (
            <>
              <span className="text-[var(--vestara-text-dim)]">|</span>
              <span className={session.exitCode === 0 ? 'var(--vestara-status-success)' : 'var(--vestara-status-error)'}>
                {session.exitCode === 0 ? '✓' : '×'} exit {session.exitCode}
              </span>
            </>
          )}
        </>
      )}

      {connected && uptime > 0 && (
        <>
          <span className="text-[var(--vestara-text-dim)]">|</span>
          <span className="text-[var(--vestara-text-muted)]">{fmtUptime(uptime)}</span>
        </>
      )}

      {reconnectCount > 0 && (
        <>
          <span className="text-[var(--vestara-text-dim)]">|</span>
          <span className="text-[var(--vestara-text-dim)]">reconnects: {reconnectCount}</span>
        </>
      )}
    </div>
  );
}
