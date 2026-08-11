import { useMemo } from 'react';
import type { ActivityRecord, ActivityScope } from './activity-types';

interface ActivityScopeSelectorProps {
  records: readonly ActivityRecord[];
  scope: ActivityScope;
  onScopeChange: (scope: ActivityScope) => void;
}

function uniqueIds(records: readonly ActivityRecord[], key: 'workflowId' | 'sessionId'): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    const value = record[key];
    if (value !== undefined) seen.add(value);
  }
  return [...seen].sort();
}

export default function ActivityScopeSelector({ records, scope, onScopeChange }: ActivityScopeSelectorProps) {
  const workflows = useMemo(() => uniqueIds(records, 'workflowId'), [records]);
  const sessions = useMemo(() => uniqueIds(records, 'sessionId'), [records]);

  const selectClass =
    'rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-1 text-[10px] text-(--vestara-text-2) outline-none cursor-pointer';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">Scope</span>

      <button
        type="button"
        onClick={() => onScopeChange({})}
        className={`rounded-lg border px-2 py-1 text-[10px] transition-colors cursor-pointer ${
          scope.workflowId === undefined && scope.sessionId === undefined
            ? 'border-(--vestara-accent) bg-(--vestara-accent-bg) text-(--vestara-text)'
            : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-(--vestara-text-2) hover:text-(--vestara-text)'
        }`}
        aria-pressed={scope.workflowId === undefined && scope.sessionId === undefined}
      >
        All activity
      </button>

      {workflows.length > 0 && (
        <label className="flex items-center gap-1.5 text-[9px] text-(--vestara-text-dim)">
          Workflow
          <select
            value={scope.workflowId ?? ''}
            onChange={(event) => {
              const workflowId = event.target.value || undefined;
              onScopeChange({
                ...scope,
                workflowId,
                sessionId: workflowId !== scope.workflowId ? undefined : scope.sessionId,
              });
            }}
            aria-label="Scope to workflow"
            className={selectClass}
          >
            <option value="">All workflows</option>
            {workflows.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}

      {sessions.length > 0 && (
        <label className="flex items-center gap-1.5 text-[9px] text-(--vestara-text-dim)">
          Session
          <select
            value={scope.sessionId ?? ''}
            onChange={(event) => {
              const sessionId = event.target.value || undefined;
              onScopeChange({
                ...scope,
                sessionId,
                workflowId: sessionId !== scope.sessionId ? undefined : scope.workflowId,
              });
            }}
            aria-label="Scope to session"
            className={selectClass}
          >
            <option value="">All sessions</option>
            {sessions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
