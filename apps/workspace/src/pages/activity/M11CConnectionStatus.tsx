/**
 * M11C Connection Status Indicator
 *
 * Displays the Activity Room connection state in the header plinth:
 *   ● Live
 *   ◌ Connecting
 *   ◌ Reconnecting
 *   ⚠ Resyncing
 *   ○ Offline
 *
 * Uses the shared StatusIndicator from @vestara/ui for consistent
 * status presentation across the workspace.
 */

import { StatusIndicator, type StatusVariant } from '@vestara/ui';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';

// ─── Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<M11CConnectionState, { readonly label: string; readonly variant: StatusVariant }> = {
  connecting: { label: 'Connecting', variant: 'warn' },
  live: { label: 'Live', variant: 'live' },
  reconnecting: { label: 'Reconnecting', variant: 'warn' },
  offline: { label: 'Offline', variant: 'off' },
  paused: { label: 'Paused', variant: 'idle' },
  error: { label: 'Resyncing', variant: 'error' },
};

// ─── Component ───────────────────────────────────────────────

interface M11CConnectionStatusProps {
  readonly state: M11CConnectionState;
}

export default function M11CConnectionStatus({ state }: M11CConnectionStatusProps) {
  const config = STATUS_CONFIG[state] ?? STATUS_CONFIG.offline;

  return (
    <span
      className="ar-status flex items-center gap-1.5"
      title={`Activity Room connection: ${config.label}`}
      role="status"
      aria-live="polite"
    >
      <StatusIndicator
        variant={config.variant}
        size="sm"
        pulse={state === 'live'}
        ariaLabel={`Connection: ${config.label}`}
      />
      <span className="text-[11px] text-zinc-400">{config.label}</span>
    </span>
  );
}
