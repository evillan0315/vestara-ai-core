import { useEffect, useRef, useState } from 'react';
import { StatusIndicator } from '@vestara/ui';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import MoreVertOutlinedIcon from '@mui/icons-material/MoreVertOutlined';
import PauseOutlinedIcon from '@mui/icons-material/PauseOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { SIZING } from '@vestara/ui-tokens';
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
  readonly onOpenReport?: () => void;
  /** Controlled participants-rail visibility (hero toggle). */
  readonly participantsVisible?: boolean;
  readonly onToggleParticipants?: () => void;
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
  onOpenReport,
  participantsVisible = true,
  onToggleParticipants,
}: ActivityRoomHeaderProps) {
  const ui = useActivityRoomUI();
  const { toggleDrawer, activeSurface, open } = useGlobalDrawer();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!actionsOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setActionsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);
  const config = CONNECTION_STATUS_CONFIG[state] ?? CONNECTION_STATUS_CONFIG.offline;
  const dataConfig = ACTIVITY_DATA_STATUS_CONFIG[activityDataStatus(dataAvailable, snapshotComplete)];
  const live = state === 'live' && !paused;
  const statusClass =
    config.variant === 'live' ? 'ar-status--live' : config.variant === 'error' || config.variant === 'off' ? 'ar-status--off' : 'ar-status--warn';
  // Paused is intentional (local), not degraded — keep its own label + buffered count.
  const statusLabel = paused ? (unread > 0 ? `Paused · ${unread} buffered` : 'Paused') : config.label;
  const freshness = formatFreshness(lastUpdatedAt);
  // P0 scan-first: 3 ordered signals — Attention > Live > Data.
  // Attention rolls blocked agents into the same tappable signal so critical
  // state has one focus target; Live merges working agents + running
  // workflows; Data collapses the two quiet pills into one tooltip.
  const totalAttention = attentionCount + blockedAgentCount;
  const dataTitle =
    `Activity data: ${dataConfig.label}` + (freshness ? ` · ${freshness}` : '');
  const liveTitle =
    `${workingAgentCount} agent${workingAgentCount === 1 ? '' : 's'} working · ` +
    `${runningWorkflowCount} workflow${runningWorkflowCount === 1 ? '' : 's'} running` +
    (workflowCount > 0 ? ` · ${workflowCount} total` : '');

  return (
    <header className="ar-header" aria-label="Activity Room controls">
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
        {totalAttention > 0 ? (
          <button
            type="button"
            className={`ar-signal ${blockedAgentCount > 0 ? 'ar-signal--blocked' : 'ar-signal--attention'}`}
            onClick={onFocusAttention}
            disabled={!onFocusAttention}
            title={onFocusAttention ? 'Focus needs-attention activity' : undefined}
            aria-label={`${totalAttention} need attention${criticalAttentionCount > 0 ? `, ${criticalAttentionCount} critical` : ''}${blockedAgentCount > 0 ? `, ${blockedAgentCount} blocked` : ''}`}
          >
            <strong>{totalAttention}</strong>
            <span>needs attention</span>
            {criticalAttentionCount > 0 && <small>{criticalAttentionCount} critical</small>}
            {blockedAgentCount > 0 && criticalAttentionCount === 0 && <small>{blockedAgentCount} blocked</small>}
            {blockedAgentCount > 0 && criticalAttentionCount > 0 && <small>{blockedAgentCount} blocked · {criticalAttentionCount} critical</small>}
          </button>
        ) : (
          <span className="ar-signal ar-signal--quiet"><strong>0</strong><span>needs attention</span></span>
        )}
        <span className="ar-signal ar-signal--live" title={liveTitle}>
          <strong>{workingAgentCount} · {runningWorkflowCount}</strong>
          <span>working · running</span>
        </span>
        <span className="ar-signal ar-signal--quiet" title={dataTitle}>
          <strong>Data</strong>
          <span>{freshness ?? dataConfig.label}</span>
        </span>
      </div>
      <div className="ar-header__controls">
        <span className={`ar-status ${statusClass}`} role="status" aria-live="polite" title={paused ? 'Live updates paused locally — live arrivals are buffered' : `Live Activity updates: ${config.label}`}>
          <StatusIndicator variant={config.variant} size="xs" pulse={live} ariaLabel={`${LIVE_STREAM_STATUS_PREFIX}: ${statusLabel}`} />
          {LIVE_STREAM_STATUS_PREFIX} · {statusLabel}
        </span>
        {onToggleParticipants && (
          <button
            type="button"
            className={`ar-control-button ar-control-button--icon ${participantsVisible ? 'ar-control-button--active' : ''}`}
            aria-label={participantsVisible ? 'Hide participants sidebar' : 'Show participants sidebar'}
            aria-pressed={participantsVisible}
            title={participantsVisible ? 'Hide participants sidebar' : 'Show participants sidebar'}
            onClick={onToggleParticipants}
          >
            <GroupOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
          </button>
        )}
        <div className="ar-actions" ref={actionsRef}>
          <button
            type="button"
            className={`ar-control-button ar-control-button--icon ${actionsOpen ? 'ar-control-button--active' : ''}`}
            aria-label="Activity actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            title="Activity actions (pause, clear, report)"
            onClick={() => setActionsOpen((v) => !v)}
          >
            <MoreVertOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
          </button>
          {actionsOpen && (
            <div className="ar-actions__menu" role="menu" aria-label="Activity actions">
              <button
                type="button"
                role="menuitem"
                className="ar-actions__item"
                onClick={() => { setActionsOpen(false); onPause(); }}
                aria-pressed={paused}
              >
                {paused
                  ? <PlayArrowOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
                  : <PauseOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />}
                <span>{paused ? 'Resume' : 'Pause'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="ar-actions__item"
                onClick={() => { setActionsOpen(false); onClear(); }}
              >
                <DeleteOutlineOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
                <span>Clear</span>
              </button>
              {onOpenReport && (
                <button
                  type="button"
                  role="menuitem"
                  className="ar-actions__item"
                  onClick={() => { setActionsOpen(false); onOpenReport(); }}
                >
                  <AssessmentOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
                  <span>Report</span>
                </button>
              )}
              {onOpenSettings && (
                <button
                  type="button"
                  role="menuitem"
                  className="ar-actions__item"
                  onClick={() => { setActionsOpen(false); onOpenSettings(); }}
                >
                  <TuneOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} aria-hidden="true" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          )}
        </div>
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
