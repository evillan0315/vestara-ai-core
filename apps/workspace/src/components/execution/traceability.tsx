/**
 * Traceability tab — dependency / traceability graph.
 *
 * Renders the execution trace as kind-grouped columns (request → plan →
 * task → execution/agent → capability → artifact → review/verification).
 * Clicking a node focuses the graph on its reachable subgraph.
 */

import { useEffect, useMemo } from 'react';
import type { TraceNode } from '../../lib/execution';
import { tone } from '../../lib/execution';
import { useExecution } from './ExecutionContext';

function toneClass(t: string): string {
  return t === 'pass'
    ? 'exec-status-pass'
    : t === 'fail'
      ? 'exec-status-fail'
      : t === 'warn'
        ? 'exec-status-warn'
        : 'exec-status-unknown';
}

/** Coerce a trace node label to a string; a file-change object must never render as a React child. */
function labelOf(node: TraceNode): string {
  return typeof node.label === 'string' ? node.label : String(node.label ?? node.id);
}

const KIND_ORDER = [
  'request',
  'project',
  'plan',
  'task',
  'execution',
  'agent',
  'capability',
  'artifact',
  'review',
  'verification',
];
const KIND_LABEL: Record<string, string> = {
  request: 'User Request',
  project: 'Projects',
  plan: 'Plans',
  task: 'Tasks',
  execution: 'Executions',
  agent: 'Agents',
  capability: 'Capabilities',
  artifact: 'Artifacts',
  review: 'Reviews',
  verification: 'Verification',
};

export function TraceabilityPanel() {
  const { trace, traceLoading, traceTarget, loadTrace, search } = useExecution();

  useEffect(() => {
    if (trace === null && !traceLoading) void loadTrace();
  }, [trace, traceLoading, loadTrace]);

  const columns = useMemo(() => {
    const map = new Map<string, TraceNode[]>();
    for (const n of trace?.nodes ?? []) {
      const list = map.get(n.kind) ?? [];
      list.push(n);
      map.set(n.kind, list);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({ kind: k, nodes: map.get(k) ?? [] }));
  }, [trace]);

  const filteredColumns = useMemo(() => {
    if (!search.trim()) return columns;
    const q = search.toLowerCase();
    return columns
      .map((c) => ({
        ...c,
        nodes: c.nodes.filter((n) => n.label.toLowerCase().includes(q) || (n.meta ?? '').toLowerCase().includes(q)),
      }))
      .filter((c) => c.nodes.length > 0);
  }, [columns, search]);

  const focusTarget = (id: string) => {
    if (traceTarget === id) {
      void loadTrace();
    } else {
      void loadTrace(id);
    }
  };

  return (
    <div className="exec-card exec-card-body">
      <div className="flex items-center justify-between mb-2">
        <div className="exec-section-title">
          Execution Trace
          {traceTarget && <span className="text-zinc-500"> · focused on {traceTarget}</span>}
          <span className="text-zinc-500">
            {' '}
            · {trace?.nodes.length ?? 0} nodes / {trace?.edges.length ?? 0} edges
          </span>
        </div>
        {traceTarget && (
          <button type="button" className="exec-btn" onClick={() => void loadTrace()}>
            Clear focus
          </button>
        )}
      </div>
      {traceLoading && trace === null && <p className="exec-empty animate-pulse">Building trace graph…</p>}
      {!traceLoading && trace && trace.nodes.length === 0 && <p className="exec-empty">Nothing to trace yet.</p>}
      {trace && trace.nodes.length > 0 && (
        <div className="exec-trace-grid">
          {filteredColumns.map((col) => (
            <div key={col.kind} className="exec-trace-col">
              <div className="exec-sub-title">{KIND_LABEL[col.kind] ?? col.kind}</div>
              <div className="space-y-1">
                {col.nodes.slice(0, 60).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`exec-trace-node ${traceTarget === n.id ? 'exec-trace-node-active' : ''}`}
                    onClick={() => focusTarget(n.id)}
                    title={n.meta ?? n.id}
                  >
                    <span className={`exec-status-dot ${toneClass(tone(n.status))}`} />
                    <span className="truncate">{n.label}</span>
                  </button>
                ))}
                {col.nodes.length > 60 && (
                  <div className="text-[10px] text-zinc-600">+{col.nodes.length - 60} more</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
