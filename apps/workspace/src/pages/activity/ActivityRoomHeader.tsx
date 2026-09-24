import { StatusIndicator } from '@vestara/ui';
import { CONNECTION_STATUS_CONFIG } from './status-config';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { useActivityRoomUI } from '../../hooks/useActivityRoomUI';

interface ActivityRoomHeaderProps {
  readonly roomName: string;
  readonly state: M11CConnectionState;
  readonly paused: boolean;
  readonly recordCount: number;
  readonly cursor?: number;
  readonly unread?: number;
  readonly lastUpdatedAt?: number | null;
  readonly onPause: () => void;
  readonly onClear: () => void;
  readonly onOpenSettings?: () => void;
}

function formatFreshness(timestamp: number | null | undefined): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'updated just now';
  if (seconds < 60) return `updated ${seconds}s ago`;
  return `updated ${Math.floor(seconds / 60)}m ago`;
}

export default function ActivityRoomHeader({
  roomName,
  state,
  paused,
  recordCount,
  cursor,
  unread = 0,
  lastUpdatedAt = null,
  onPause,
  onClear,
  onOpenSettings,
}: ActivityRoomHeaderProps) {
  const ui = useActivityRoomUI();
  const toggleTerminalDrawer = ui.toggleTerminalDrawer;
  const config = CONNECTION_STATUS_CONFIG[state] ?? CONNECTION_STATUS_CONFIG.offline;
  const live = state === 'live' && !paused;
  const statusClass =
    config.variant === 'live' ? 'ar-status--live' : config.variant === 'error' || config.variant === 'off' ? 'ar-status--off' : 'ar-status--warn';
  // Paused is intentional (local), not degraded — keep its own label + buffered count.
  const statusLabel = paused ? (unread > 0 ? `Paused · ${unread} buffered` : 'Paused') : config.label;
  const freshness = formatFreshness(lastUpdatedAt);

  return (
    <header className="ar-header px-[var(--vestara-spacing-page)]" aria-label="Activity Room controls">
      <div className="ar-header__identity">
        <div className="min-w-0">
          <p className="ar-kicker">Live operations</p>
          <h1 className="ar-header__title">{roomName}</h1>
          <p className="ar-header__subtitle">
            {recordCount} records{cursor === undefined ? '' : ` · seq ${cursor}`}
            {freshness ? ` · ${freshness}` : ''}
          </p>
        </div>
      </div>
      <div className="ar-header__controls">
        <span className={`ar-status ${statusClass}`} role="status" aria-live="polite" title={paused ? 'Stream paused locally — live arrivals are buffered' : `Connection: ${config.label}`}>
          <StatusIndicator variant={config.variant} size="xs" pulse={live} ariaLabel={statusLabel} />
          {statusLabel}
        </span>
        <button type="button" className="ar-control-button" onClick={onPause} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="ar-control-button" onClick={onClear}>
          Clear
        </button>
        {onOpenSettings && (
          <button
            type="button"
            className="ar-control-button ar-control-button--icon"
            aria-label="Activity Room settings"
            onClick={onOpenSettings}
          >
            Settings
          </button>
        )}
        <button
          type="button"
          className="ar-control-button ar-control-button--icon"
          aria-label="Terminal"
          onClick={toggleTerminalDrawer}
        >
          ⌘
        </button>
      </div>
    </header>
  );
}
