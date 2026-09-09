/**
 * AR-UI-A1: Team Roster Component
 *
 * Displays the authoritative team roster with real agent data,
 * runtime status visualization, active work counters, and
 * latest activity previews.
 *
 * Architecture Traceability:
 *   AR-UI-A: Authoritative Team Roster (phases 0-2)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback } from 'react';
import type { TeamRosterEntry, TeamRosterState } from './team-roster-types';

// ─── Status Styling ────────────────────────────────────────────

const STATUS_STYLES: Record<TeamRosterEntry['runtimeStatus'], { dot: string; label: string; bg: string }> = {
  working: {
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
    label: 'Working',
    bg: 'bg-emerald-500/10',
  },
  waiting: {
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
    label: 'Waiting',
    bg: 'bg-amber-500/10',
  },
  error: {
    dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]',
    label: 'Error',
    bg: 'bg-red-500/10',
  },
  idle: {
    dot: 'bg-zinc-500',
    label: 'Idle',
    bg: 'bg-zinc-500/10',
  },
  offline: {
    dot: 'bg-zinc-700',
    label: 'Offline',
    bg: 'bg-zinc-700/10',
  },
};

// ─── Agent Role Icons ──────────────────────────────────────────

function AgentRoleIcon({ role }: { role: string }) {
  // Simple role-based icons
  const iconMap: Record<string, string> = {
    context: '🔍',
    developer: '💻',
    planning: '📋',
    reviewer: '👁️',
    verifier: '✅',
    assistant: '⚡',
    custom: '🔧',
  };
  return <span className="text-sm">{iconMap[role] ?? '🤖'}</span>;
}

// ─── Roster Entry Component ────────────────────────────────────

interface RosterEntryProps {
  entry: TeamRosterEntry;
  onSelect: (agentId: string) => void;
}

function RosterEntryComponent({ entry, onSelect }: RosterEntryProps) {
  const style = STATUS_STYLES[entry.runtimeStatus];
  const hasWork = entry.activeWorkCount > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.agent.id)}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150
        hover:bg-(--vestara-surface-hover) cursor-pointer
        ${entry.isSelected ? 'bg-(--vestara-accent-bg) ring-1 ring-(--vestara-accent-border)' : ''}
      `}
    >
      {/* Status dot */}
      <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${style.dot}`} />

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <AgentRoleIcon role={entry.agent.role} />
          <span className="text-sm font-medium text-(--vestara-text-1) truncate">
            {entry.agent.name}
          </span>
          {hasWork && (
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-(--vestara-accent-bg) text-(--vestara-accent-text) rounded-full">
              {entry.activeWorkCount}
            </span>
          )}
        </div>

        {/* Status and latest activity */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] ${entry.runtimeStatus === 'error' ? 'text-red-400' : 'text-(--vestara-text-muted)'}`}>
            {style.label}
          </span>
          {entry.latestActivity && (
            <span className="text-[11px] text-(--vestara-text-muted) truncate">
              · {entry.latestActivity.summary}
            </span>
          )}
        </div>
      </div>

      {/* Role badge */}
      <span className="flex-shrink-0 px-2 py-0.5 text-[10px] font-medium text-(--vestara-text-muted) bg-((--vestara-surface-secondary)) rounded">
        {entry.agent.role}
      </span>
    </button>
  );
}

// ─── Summary Stats Component ───────────────────────────────────

function RosterStats({ state }: { state: TeamRosterState }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-[11px] text-(--vestara-text-muted) border-b border-(--vestara-border)">
      <span className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        {state.activeCount} active
      </span>
      <span className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-zinc-500" />
        {state.idleCount} idle
      </span>
      {state.errorCount > 0 && (
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          {state.errorCount} error
        </span>
      )}
      <span className="ml-auto">{state.totalCount} total</span>
    </div>
  );
}

// ─── Main Roster Component ─────────────────────────────────────

export interface TeamRosterProps {
  /** Roster state */
  state: TeamRosterState;

  /** Whether the roster is loading */
  isLoading?: boolean;

  /** Error message */
  error?: string | null;

  /** Callback when an agent is selected */
  onSelectAgent?: (agentId: string) => void;

  /** Callback to refresh the roster */
  onRefresh?: () => void;
}

export function TeamRoster({
  state,
  isLoading,
  error,
  onSelectAgent,
  onRefresh,
}: TeamRosterProps) {
  const handleSelect = useCallback(
    (agentId: string) => {
      onSelectAgent?.(agentId);
    },
    [onSelectAgent],
  );

  return (
    <div className="flex flex-col h-full bg-(--vestara-surface) rounded-lg border border-(--vestara-border)">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--vestara-border)">
        <h3 className="text-sm font-semibold text-(--vestara-text-1)">
          Team Roster
        </h3>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="w-3 h-3 border-2 border-(--vestara-accent-border) border-t-transparent rounded-full animate-spin" />
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-1 rounded hover:bg-(--vestara-surface-hover) text-(--vestara-text-muted) cursor-pointer"
              title="Refresh roster"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <RosterStats state={state} />

      {/* Error */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
          {error}
        </div>
      )}

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {state.entries.length === 0 ? (
          <div className="text-center py-8 text-sm text-(--vestara-text-muted)">
            No agents found
          </div>
        ) : (
          state.entries.map((entry) => (
            <RosterEntryComponent
              key={entry.agent.id}
              entry={entry}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 text-[10px] text-(--vestara-text-muted) border-t border-(--vestara-border) text-center">
        Last updated: {new Date(state.lastUpdatedAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
