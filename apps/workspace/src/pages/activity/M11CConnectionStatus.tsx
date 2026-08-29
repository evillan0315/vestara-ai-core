/**
 * M11C Connection Status Indicator
 *
 * Displays the Activity Room connection state in the header:
 *   ● Live
 *   ◌ Connecting
 *   ◌ Reconnecting
 *   ⚠ Resyncing
 *   ○ Offline
 */

import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';

// ─── Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<M11CConnectionState, { readonly symbol: string; readonly label: string; readonly color: string }> = {
  connecting: { symbol: '◌', label: 'Connecting', color: 'text-(--vestara-amber)' },
  live: { symbol: '●', label: 'Live', color: 'text-(--vestara-green)' },
  reconnecting: { symbol: '◌', label: 'Reconnecting', color: 'text-(--vestara-amber)' },
  offline: { symbol: '○', label: 'Offline', color: 'text-(--vestara-red)' },
  paused: { symbol: '⏸', label: 'Paused', color: 'text-(--vestara-amber)' },
  error: { symbol: '⚠', label: 'Resyncing', color: 'text-(--vestara-amber)' },
};

// ─── Component ───────────────────────────────────────────────

interface M11CConnectionStatusProps {
  readonly state: M11CConnectionState;
}

export default function M11CConnectionStatus({ state }: M11CConnectionStatusProps) {
  const config = STATUS_CONFIG[state] ?? STATUS_CONFIG.offline;

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-3 py-1.5 text-[10px] ${config.color}`}
      title={`Activity Room connection: ${config.label}`}
      role="status"
      aria-live="polite"
    >
      <span className={config.state === 'live' ? 'animate-pulse' : ''}>{config.symbol}</span>
      {config.label}
    </span>
  );
}
