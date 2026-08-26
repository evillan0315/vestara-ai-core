import type { EffectiveUnitState } from '../../lib/activity';
import ActivityScopeSelector from './ActivityScopeSelector';
import ExecutionPulse from './ExecutionPulse';
import { effectLabel, formatRelative } from './activity-formatters';
import type {
  ActivityProjectionRecord,
  ActivityScope,
  AuxiliarySourceStatus,
  WorkflowParticipant,
} from './activity-types';

/**
 * Workflow Browser (AR-02) — the navigation and health plane of the room.
 * Renders LIGHTWEIGHT SUMMARIES ONLY: one row per active unit (identity, latest
 * disposition, event count, relative last activity). Never full activity per
 * workflow. Unit rows are derived from effective state and are never persisted.
 * Selecting a unit scopes the stream via the shared URL-scope path.
 */
export default function ActivityWorkflowBrowser({
  records,
  scope,
  onScopeChange,
  units,
  status,
  onRetry,
  participants,
  className,
}: {
  records: readonly ActivityProjectionRecord[];
  scope: ActivityScope;
  onScopeChange: (scope: ActivityScope) => void;
  units: readonly EffectiveUnitState[];
  status: AuxiliarySourceStatus;
  onRetry: () => void;
  participants?: readonly WorkflowParticipant[];
  className?: string;
}) {
  const scopeForUnit = (unit: EffectiveUnitState): ActivityScope =>
    unit.workflowId !== undefined ? { workflowId: unit.workflowId } : { sessionId: unit.sessionId };

  const isSelected = (unit: EffectiveUnitState): boolean =>
    unit.workflowId !== undefined
      ? scope.workflowId === unit.workflowId
      : scope.sessionId === unit.sessionId;

  return (
    <section
      className={`flex w-full min-w-0 flex-col gap-3 overflow-y-auto rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-2 sm:p-3 ${className ?? ''}`}
      aria-label="Workflow browser"
    >
      <div className="px-1 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Workflows</div>

      <div className="shrink-0">
        <ActivityScopeSelector records={records} scope={scope} onScopeChange={onScopeChange} />
      </div>

      {participants !== undefined && participants.length > 0 && (
        <div className="shrink-0">
          <ExecutionPulse participants={participants} />
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {status === 'loading' && (
          <p className="px-2 py-1 text-[10px] text-(--vestara-text-muted)">Loading workflows…</p>
        )}
        {status === 'error' && (
          <p className="flex items-center gap-2 px-2 py-1 text-[10px] text-(--vestara-amber)">
            <span>Workflows are unavailable.</span>
            <button type="button" onClick={onRetry} className="shrink-0 underline cursor-pointer">
              Retry
            </button>
          </p>
        )}
        {status === 'stale' && (
          <p className="flex items-center gap-2 px-2 py-1 text-[10px] text-(--vestara-amber)">
            <span>Showing previously computed workflows — the latest refresh failed.</span>
            <button type="button" onClick={onRetry} className="shrink-0 underline cursor-pointer">
              Retry
            </button>
          </p>
        )}
        {status === 'ready' && units.length === 0 && (
          <p className="px-2 py-1 text-[10px] text-(--vestara-text-muted)">No active workflows yet.</p>
        )}
        {units.map((unit) => (
          <button
            key={`${unit.workflowId ?? ''}-${unit.sessionId ?? ''}`}
            type="button"
            onClick={() => onScopeChange(scopeForUnit(unit))}
            aria-pressed={isSelected(unit)}
            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
              isSelected(unit)
                ? 'border-(--vestara-accent) bg-(--vestara-accent-bg)'
                : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) hover:border-(--vestara-accent-border-hover)'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium text-(--vestara-text-2)">
                {unit.workflowId ?? unit.sessionId}
              </span>
              <span className="shrink-0 text-[9px] text-(--vestara-text-dim)">
                {formatRelative(unit.lastActivity)}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-(--vestara-text-muted)">
              {effectLabel(unit.latestEffect ?? 'message')} · {unit.recordCount} events
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}