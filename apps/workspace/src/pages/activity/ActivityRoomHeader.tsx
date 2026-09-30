import { StatusIndicator } from '@vestara/ui';
import {
  ACTIVITY_DATA_STATUS_CONFIG,
  CONNECTION_STATUS_CONFIG,
  LIVE_STREAM_STATUS_PREFIX,
  activityDataStatus,
} from './status-config';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';
import { useActivityRoomUI } from '../../hooks/useActivityRoomUI';
import { useGlobalDrawer } from '../../contexts/GlobalDrawerContext';

interface ActivityRoomHeaderProps {
  readonly roomName: string;
  readonly state: M11CConnectionState;
  readonly paused: boolean;
  readonly recordCount: number;
  readonly cursor?: number;
  readonly unread?: number;
  readonly lastUpdatedAt?: number | null;
  readonly dataAvailable: boolean;
  readonly snapshotComplete: boolean;
  readonly onPause: () => void;
  readonly onClear: () => void;
  readonly attentionCount?: number;
  readonly criticalAttentionCount?: number;
  readonly workingAgentCount?: number;
  readonly blockedAgentCount?: number;
  readonly workflowCount?: number;
  readonly runningWorkflowCount?: number;
  readonly onFocusAttention?: () => void;
  readonly scopeLabel?: string;
  readonly onClearScope?: () => void;
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
  dataAvailable,
  snapshotComplete,
  onPause,
  onClear,
  attentionCount = 0,
  criticalAttentionCount = 0,
  workingAgentCount = 0,
  blockedAgentCount = 0,
  workflowCount = 0,
  runningWorkflowCount = 0,
  onFocusAttention,
  scopeLabel,
  onClearScope,
  onOpenSettings,
}: ActivityRoomHeaderProps) {
  const ui = useActivityRoomUI();
  const { toggleDrawer, activeSurface, open } = useGlobalDrawer();
  const config = CONNECTION_STATUS_CONFIG[state] ?? CONNECTION_STATUS_CONFIG.offline;
  const dataConfig = ACTIVITY_DATA_STATUS_CONFIG[activityDataStatus(dataAvailable, snapshotComplete)];
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
          {scopeLabel && (
            <button
              type="button"
              className="ar-header__scope"
              onClick={onClearScope}
              disabled={!onClearScope}
              title={onClearScope ? 'Clear active scope' : undefined}
            >
              <span>Scope: {scopeLabel}</span>
              {onClearScope && <span aria-hidden="true">×</span>}
            </button>
          )}
        </div>
      </div>
      <div className="ar-header__signals" aria-label="Operational summary">
        {attentionCount > 0 ? (
          <button
            type="button"
            className="ar-signal ar-signal--attention"
            onClick={onFocusAttention}
            disabled={!onFocusAttention}
            title={onFocusAttention ? 'Focus needs-attention activity' : undefined}
          >
            <strong>{attentionCount}</strong>
            <span>needs attention</span>
            {criticalAttentionCount > 0 && <small>{criticalAttentionCount} critical</small>}
          </button>
        ) : (
          <span className="ar-signal ar-signal--quiet"><strong>0</strong><span>needs attention</span></span>
        )}
        <span className="ar-signal"><strong>{workingAgentCount}</strong><span>working</span></span>
        {blockedAgentCount > 0 && (
          <span className="ar-signal ar-signal--blocked"><strong>{blockedAgentCount}</strong><span>blocked</span></span>
        )}
        <span className="ar-signal"><strong>{runningWorkflowCount}</strong><span>workflows running</span></span>
        {workflowCount > 0 && runningWorkflowCount === 0 && (
          <span className="ar-signal ar-signal--quiet"><strong>{workflowCount}</strong><span>workflows</span></span>
        )}
        <span className="ar-signal ar-signal--quiet"><strong>Activity data</strong><span>{dataConfig.label}</span></span>
        {freshness && <span className="ar-signal ar-signal--quiet"><strong>Data</strong><span>{freshness}</span></span>}
      </div>
      <div className="ar-header__controls">
        <span className={`ar-status ${statusClass}`} role="status" aria-live="polite" title={paused ? 'Live updates paused locally — live arrivals are buffered' : `Live Activity updates: ${config.label}`}>
          <StatusIndicator variant={config.variant} size="xs" pulse={live} ariaLabel={`${LIVE_STREAM_STATUS_PREFIX}: ${statusLabel}`} />
          {LIVE_STREAM_STATUS_PREFIX} · {statusLabel}
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
          className={`ar-control-button ar-control-button--icon ar-control-button--terminal ${open && activeSurface === 'terminal' ? 'ar-control-button--active' : ''}`}
          aria-label="Terminal"
          aria-pressed={open && activeSurface === 'terminal'}
          title="Open Terminal ( ` )"
          onClick={() => toggleDrawer('terminal')}
        >
          <span aria-hidden="true">⌘</span>
        </button>
      </div>
    </header>
  );
}
