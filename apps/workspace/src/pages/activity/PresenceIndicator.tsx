/**
 * AR-UI-B1: Presence Indicator Component
 *
 * Displays real-time presence status for agents with heartbeat indicators,
 * connection status, and activity previews.
 *
 * Architecture Traceability:
 *   AR-UI-B: Presence Layer (phases 3-6)
 *   @see AR-UI-A: Authoritative Team Roster (phases 0-2)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback } from 'react';
import type { PresenceEntry, PresenceStateData } from './presence-types';

// ─── Presence Styling ──────────────────────────────────────────

const PRESENCE_STYLES: Record<PresenceEntry['state'], { dot: string; label: string; pulse: boolean }> = {
  online: {
    dot: 'bg-emerald-400',
    label: 'Online',
    pulse: true,
  },
  busy: {
    dot: 'bg-amber-400',
    label: 'Busy',
    pulse: true,
  },
  idle: {
    dot: 'bg-zinc-500',
    label: 'Idle',
    pulse: false,
  },
  away: {
    dot: 'bg-zinc-600',
    label: 'Away',
    pulse: false,
  },
  offline: {
    dot: 'bg-zinc-700',
    label: 'Offline',
    pulse: false,
  },
};

// ─── Presence Dot Component ────────────────────────────────────

interface PresenceDotProps {
  state: PresenceEntry['state'];
  size?: 'sm' | 'md' | 'lg';
}

export function PresenceDot({ state, size = 'md' }: PresenceDotProps) {
  const style = PRESENCE_STYLES[state];
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  return (
    <span className="relative inline-flex">
      <span
        className={`
          ${sizeClasses[size]} rounded-full ${style.dot}
          ${style.pulse ? 'shadow-[0_0_6px_currentColor]' : ''}
        `}
      />
      {style.pulse && (
        <span
          className={`
            absolute inline-flex h-full w-full rounded-full ${style.dot} opacity-75
            animate-ping
          `}
        />
      )}
    </span>
  );
}

// ─── Heartbeat Indicator Component ─────────────────────────────

interface HeartbeatIndicatorProps {
  lastHeartbeatAt: string;
  intervalMs?: number;
}

export function HeartbeatIndicator({
  lastHeartbeatAt,
  intervalMs = 5000,
}: HeartbeatIndicatorProps) {
  const elapsed = Date.now() - new Date(lastHeartbeatAt).getTime();
  const freshness = elapsed < intervalMs * 2 ? 'fresh' : elapsed < intervalMs * 4 ? 'stale' : 'old';

  const freshnessStyles = {
    fresh: 'text-emerald-400',
    stale: 'text-amber-400',
    old: 'text-red-400',
  };

  return (
    <span className={`text-[10px] ${freshnessStyles[freshness]}`}>
      {freshness === 'fresh' ? '●' : freshness === 'stale' ? '◐' : '○'}
    </span>
  );
}

// ─── Task Progress Component ───────────────────────────────────

interface TaskProgressProps {
  task: PresenceEntry['currentTask'];
}

export function TaskProgress({ task }: TaskProgressProps) {
  if (!task) return null;

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-(--vestara-accent-text) rounded-full transition-all duration-300"
          style={{ width: `${task.progress}%` }}
        />
      </div>
      <span className="text-[10px] text-(--vestara-text-muted)">{task.progress}%</span>
    </div>
  );
}

// ─── Presence Entry Component ──────────────────────────────────

interface PresenceEntryProps {
  entry: PresenceEntry;
  showTask?: boolean;
  showActivity?: boolean;
}

export function PresenceEntryComponent({
  entry,
  showTask = true,
  showActivity = true,
}: PresenceEntryProps) {
  const style = PRESENCE_STYLES[entry.state];

  return (
    <div className="flex items-center gap-2">
      <PresenceDot state={entry.state} />
      <span className="text-xs text-(--vestara-text-1)">{style.label}</span>
      {entry.currentTask && showTask && (
        <span className="text-[10px] text-(--vestara-text-muted) truncate">
          · {entry.currentTask.description}
        </span>
      )}
      {entry.lastActivity && showActivity && (
        <span className="text-[10px] text-(--vestara-text-muted) truncate">
          · {entry.lastActivity.summary}
        </span>
      )}
    </div>
  );
}

// ─── Presence Stats Component ──────────────────────────────────

interface PresenceStatsProps {
  state: PresenceStateData;
}

export function PresenceStats({ state }: PresenceStatsProps) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-(--vestara-text-muted)">
      <span className="flex items-center gap-1">
        <PresenceDot state="online" size="sm" />
        {state.onlineCount}
      </span>
      <span className="flex items-center gap-1">
        <PresenceDot state="busy" size="sm" />
        {state.busyCount}
      </span>
      <span className="flex items-center gap-1">
        <PresenceDot state="idle" size="sm" />
        {state.idleCount}
      </span>
      <span className="flex items-center gap-1">
        <PresenceDot state="offline" size="sm" />
        {state.offlineCount}
      </span>
    </div>
  );
}

// ─── Main Presence Indicator Component ─────────────────────────

export interface PresenceIndicatorProps {
  /** Presence state */
  state: PresenceStateData;

  /** Whether to show detailed info */
  detailed?: boolean;

  /** Callback when an agent is clicked */
  onAgentClick?: (agentId: string) => void;
}

export function PresenceIndicator({
  state,
  detailed = false,
  onAgentClick,
}: PresenceIndicatorProps) {
  const handleClick = useCallback(
    (agentId: string) => {
      onAgentClick?.(agentId);
    },
    [onAgentClick],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Stats bar */}
      <PresenceStats state={state} />

      {/* Agent list (detailed mode) */}
      {detailed && (
        <div className="space-y-1">
          {state.entries.map((entry) => (
            <button
              key={entry.agentId}
              type="button"
              onClick={() => handleClick(entry.agentId)}
              className="flex items-center gap-2 w-full px-2 py-1 rounded hover:bg-(--vestara-surface-hover) text-left cursor-pointer"
            >
              <PresenceDot state={entry.state} size="sm" />
              <span className="text-xs text-(--vestara-text-1) truncate flex-1">
                {entry.agentId}
              </span>
              {entry.currentTask && (
                <span className="text-[10px] text-(--vestara-text-muted) truncate">
                  {entry.currentTask.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
