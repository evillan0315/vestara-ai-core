/**
 * Executions tab — unified execution queue + execution sessions.
 */

import { useState } from 'react';
import type { QueueEntry } from '../../lib/execution';
import { executionApi, formatTime, tone } from '../../lib/execution';
import { threadIdFromSession } from '../../lib/agent-harness';
import { inspectEntity } from '../graph/GraphContext';
import { useExecution } from './ExecutionContext';
import { HarnessThreadTimeline } from './harness-timeline';

const WORKFLOW_DEFS = [
  { id: 'feature', label: 'Feature Development', steps: 4 },
  { id: 'analyze', label: 'Repository Analysis', steps: 3 },
  { id: 'document', label: 'Documentation Generation', steps: 2 },
  { id: 'refactor', label: 'Code Refactoring', steps: 3 },
  { id: 'release', label: 'Release Preparation', steps: 3 },
];

function toneClass(t: string): string {
  return t === 'pass'
    ? 'exec-status-pass'
    : t === 'fail'
      ? 'exec-status-fail'
      : t === 'warn'
        ? 'exec-status-warn'
        : 'exec-status-unknown';
}

function kindIcon(kind: QueueEntry['kind']): string {
  switch (kind) {
    case 'session':
      return '⧉';
    case 'plan':
      return '◈';
    case 'task':
      return '☐';
    case 'execution':
      return '⚙';
  }
}

export function ExecutionsPanel() {
  const { dashboard, refresh, search, selectedSession, selectSession } = useExecution();
  const queue = dashboard?.queue ?? [];
  const summary = dashboard?.queueSummary;
  const sessions = dashboard?.sessions ?? [];
  const [wfGoal, setWfGoal] = useState('');
  const [wfType, setWfType] = useState('feature');
  const [wfStarting, setWfStarting] = useState(false);
  const [wfError, setWfError] = useState<string | null>(null);

  const startWorkflow = async () => {
    const goal = wfGoal.trim();
    if (!goal) {
      setWfError('A goal is required.');
      return;
    }
    setWfStarting(true);
    setWfError(null);
    try {
      const created = await executionApi.start(goal, wfType);
      if (!created) throw new Error('Workflow start failed');
      setWfGoal('');
      if (created.id) selectSession(created.id);
      refresh();
    } catch (caught) {
      setWfError(caught instanceof Error ? caught.message : 'Unable to start the workflow');
    } finally {
      setWfStarting(false);
    }
  };

  const filtered = queue.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.status.toLowerCase().includes(q) ||
      (e.agentId ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Start a New Workflow</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={wfGoal}
            onChange={(e) => setWfGoal(e.target.value)}
            placeholder="What should this workflow accomplish?"
            className="exec-input min-w-[220px] flex-1"
          />
          <select
            value={wfType}
            onChange={(e) => setWfType(e.target.value)}
            className="exec-input"
            aria-label="Workflow type"
          >
            {WORKFLOW_DEFS.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.label} · {wf.steps} step(s)
              </option>
            ))}
          </select>
          <button
            type="button"
            className="exec-btn exec-btn-primary"
            onClick={() => void startWorkflow()}
            disabled={wfStarting}
          >
            {wfStarting ? 'Starting…' : 'Start workflow'}
          </button>
        </div>
        {wfError && <p className="exec-empty mt-1">{wfError}</p>}
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          {(
            [
              ['Total', summary.total, 'neutral'],
              ['Running', summary.running, 'ok'],
              ['Pending', summary.pending, 'neutral'],
              ['Waiting Approval', summary.waitingApproval, 'warn'],
              ['Blocked', summary.blocked, 'bad'],
              ['Retrying', summary.retrying, 'warn'],
              ['Completed', summary.completed, 'ok'],
              ['Failed', summary.failed, 'bad'],
            ] as Array<[string, number, string]>
          ).map(([label, value, toneV]) => (
            <div
              key={label}
              className="exec-stat"
              style={{
                borderTopColor:
                  toneV === 'ok'
                    ? 'var(--vestara-green)'
                    : toneV === 'bad'
                      ? 'var(--vestara-red)'
                      : toneV === 'warn'
                        ? 'var(--vestara-amber)'
                        : 'var(--vestara-accent)',
              }}
            >
              <span className="exec-stat-value">{value}</span>
              <span className="exec-stat-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="exec-card exec-card-body">
        <div className="exec-section-title">
          Execution Queue <span className="text-zinc-500">{filtered.length}</span>
        </div>
        {filtered.length === 0 && <p className="exec-empty">Queue is empty</p>}
        <div className="overflow-auto max-h-[46vh]">
          <table className="exec-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Title</th>
                <th>Status</th>
                <th>Agent</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="text-zinc-500">{kindIcon(e.kind)}</td>
                  <td className="exec-cell-truncate" title={e.title}>
                    {e.title || e.id}
                  </td>
                  <td>
                    <span className={`exec-status-chip ${toneClass(tone(e.status))}`}>{e.status}</span>
                  </td>
                  <td className="font-mono text-[11px] text-zinc-500">{e.agentId ?? '—'}</td>
                  <td className="text-zinc-500">{e.updated ? formatTime(e.updated) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="exec-card exec-card-body">
        <div className="exec-section-title">Execution Sessions</div>
        {sessions.length === 0 && <p className="exec-empty">No execution sessions yet</p>}
        <div className="space-y-1">
          {sessions.map((s) => {
            const harnessThreadId = threadIdFromSession(s.workflowId);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSession(selectedSession === s.id ? null : s.id)}
                className={`exec-session-row ${selectedSession === s.id ? 'exec-session-active' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`exec-status-chip ${toneClass(tone(s.status))}`}>{s.status}</span>
                  {harnessThreadId && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-accent-text)">harness</span>
                  )}
                  <span className="text-[12px] text-zinc-100 truncate">{s.goal || s.id}</span>
                  <button
                    type="button"
                    className="exec-btn ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      inspectEntity(`session://${s.id}`);
                    }}
                    title="Open in Engineering Graph"
                  >
                    graph
                  </button>
                  <span className="text-[10px] text-zinc-500">{formatTime(s.createdAt)}</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  steps {s.timeline?.length ?? 0} · artifacts {s.metrics?.artifactCount ?? 0} · approvals{' '}
                  {s.approvals?.length ?? 0}
                  {harnessThreadId && <span className="ml-1">· durable thread</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {(() => {
        const selected = sessions.find((s) => s.id === selectedSession);
        const harnessThreadId = selected ? threadIdFromSession(selected.workflowId) : null;
        if (!selected || !harnessThreadId) return null;
        return <HarnessThreadTimeline threadId={harnessThreadId} />;
      })()}
    </div>
  );
}
