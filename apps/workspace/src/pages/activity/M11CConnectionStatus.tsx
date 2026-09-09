/**
 * M11C Connection Status Indicator
 *
 * Displays the Activity Room connection state in the header plinth:
 *   ● Live
 *   ◌ Connecting
 *   ◌ Reconnecting
 *   ⚠ Resyncing
 *   ○ Offline
 */

import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';

// ─── Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<M11CConnectionState, { readonly symbol: string; readonly label: string; readonly tone: 'live' | 'warn' | 'off' }> = {
  connecting: { symbol: '◌', label: 'Connecting', tone: 'warn' },
  live: { symbol: '●', label: 'Live', tone: 'live' },
  reconnecting: { symbol: '◌', label: 'Reconnecting', tone: 'warn' },
  offline: { symbol: '○', label: 'Offline', tone: 'off' },
  paused: { symbol: '⏸', label: 'Paused', tone: 'warn' },
  error: { symbol: '⚠', label: 'Resyncing', tone: 'warn' },
};

// ─── Component ───────────────────────────────────────────────

interface M11CConnectionStatusProps {
  readonly state: M11CConnectionState;
}

export default function M11CConnectionStatus({ state }: M11CConnectionStatusProps) {
  const config = STATUS_CONFIG[state] ?? STATUS_CONFIG.offline;

  return (
    <span
      className={`ar-status ar-status--${config.tone}`}
      title={`Activity Room connection: ${config.label}`}
      role="status"
      aria-live="polite"
    >
      <span className={`ar-lamp ar-lamp--${config.tone} ${state === 'live' ? 'ar-lamp--pulse' : ''}`} aria-hidden="true">
        {config.symbol}
      </span>
      {config.label}
    </span>
  );
}
