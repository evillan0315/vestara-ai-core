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

import { StatusIndicator } from '@vestara/ui';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { CONNECTION_STATUS_CONFIG } from './status-config';

// ─── Component ───────────────────────────────────────────────

interface M11CConnectionStatusProps {
  readonly state: M11CConnectionState;
}

export default function M11CConnectionStatus({ state }: M11CConnectionStatusProps) {
  const config = CONNECTION_STATUS_CONFIG[state] ?? CONNECTION_STATUS_CONFIG.offline;

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
      <span className="text-[11px] text-(--vestara-text-muted)">{config.label}</span>
    </span>
  );
}
