import type { TerminalSession } from './types';

interface TerminalStatusBarProps {
  session: TerminalSession | null;
  connected: boolean;
  reconnectCount: number;
  uptime: number;
}

export function TerminalStatusBar({ session, connected, reconnectCount, uptime }: TerminalStatusBarProps) {
  const fmtUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-1 bg-zinc-900 border-t border-zinc-800/60 text-[10px]">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className={connected ? 'text-green-400' : 'text-red-400'}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {session && (
        <>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500 font-mono truncate max-w-[200px]" title={session.cwd}>
            {session.cwd}
          </span>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-500">{session.shell}</span>
          {session.processStatus === 'running' && (
            <>
              <span className="text-zinc-700">|</span>
              <span className="text-amber-400">⟳ running</span>
            </>
          )}
          {session.exitCode !== undefined && (
            <>
              <span className="text-zinc-700">|</span>
              <span className={session.exitCode === 0 ? 'text-green-500' : 'text-red-400'}>
                {session.exitCode === 0 ? '✓' : '×'} exit {session.exitCode}
              </span>
            </>
          )}
        </>
      )}

      {connected && uptime > 0 && (
        <>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-600">{fmtUptime(uptime)}</span>
        </>
      )}

      {reconnectCount > 0 && (
        <>
          <span className="text-zinc-700">|</span>
          <span className="text-zinc-700">reconnects: {reconnectCount}</span>
        </>
      )}
    </div>
  );
}
