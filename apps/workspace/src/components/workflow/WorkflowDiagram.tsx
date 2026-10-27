/**
 * WorkflowDiagram — premium horizontal lifecycle graph (Phase 7).
 * Completed stages are ✓, active pulses ●, pending ○, failed ✗, blocked ⊘.
 * The active connector animates; clicking a stage expands a detail drawer
 * (tools, files, evidence, verification, blocking reason).
 */

import { useState } from 'react';
import type { WorkflowProjection, WorkflowStage } from '../../lib/workflow';
import { agentTone } from './WorkflowRail';

function mark(stage: WorkflowStage): { glyph: string; color: string; bg: string } {
  switch (stage.status) {
    case 'completed':
      return {
        glyph: '✓',
        color: 'text-[var(--vestara-status-success)]',
        bg: 'bg-[var(--vestara-status-success-bg)]',
      };
    case 'failed':
      return {
        glyph: '✗',
        color: 'text-[var(--vestara-status-error)]',
        bg: 'bg-[var(--vestara-status-error-bg)]',
      };
    case 'blocked':
      return {
        glyph: '⊘',
        color: 'text-[var(--vestara-status-error)]',
        bg: 'bg-[var(--vestara-status-error-bg)]',
      };
    case 'active':
      return {
        glyph: '●',
        color: 'text-[var(--vestara-accent-text)]',
        bg: 'bg-[var(--vestara-accent-bg)]',
      };
    default:
      return {
        glyph: '○',
        color: 'text-[var(--vestara-text-muted)]',
        bg: 'bg-[var(--vestara-surface-panel-raised)]',
      };
  }
}

export function WorkflowDiagram({ workflow }: { workflow: WorkflowProjection | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!workflow) return null;

  const selected = workflow.stages.find((stage) => stage.id === expanded);

  return (
    <div className="mt-2 rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-2">
      <div className="mb-2 text-[length:var(--vestara-font-size-caption)] uppercase tracking-wider text-[var(--vestara-text-muted)]">
        Lifecycle Graph
      </div>
      {/* Horizontal flow */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {workflow.stages.map((stage, index) => {
          const { glyph, color, bg } = mark(stage);
          const isActive = stage.status === 'active';
          const isStuck = stage.status === 'blocked' || stage.status === 'failed';
          return (
            <div key={stage.id} className="flex shrink-0 items-center gap-1">
              {index > 0 && (
                <span
                  className={`text-[11px] text-[var(--vestara-text-muted)] ${isActive ? 'motion-safe:animate-pulse text-[var(--vestara-accent-text)]' : ''}`}
                >
                  ━━
                </span>
              )}
              <button
                type="button"
                onClick={() => setExpanded(expanded === stage.id ? null : stage.id)}
                aria-current={isStuck ? 'true' : undefined}
                title={stage.blockingReason ? `Blocked: ${stage.blockingReason}` : `${stage.label} — ${stage.status}`}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${bg} ${
                  isStuck
                    ? 'border-dashed border-[var(--vestara-status-error-border)] ring-1 ring-[var(--vestara-status-error-border)]'
                    : expanded === stage.id
                      ? 'border-[var(--vestara-accent-border-active)]'
                      : 'border-[var(--vestara-border-subtle)]'
                } ${isActive ? 'ring-1 ring-[var(--vestara-accent-border)]' : ''}`}
              >
                <span className={`${color} text-[11px] font-medium`}>
                  {glyph} {stage.label}
                </span>
                {stage.agentId && (
                  <span className={`text-[8px] ${agentTone(stage.agentId)}`}>({stage.agentId})</span>
                )}
                {stage.durationMs != null && (
                  <span className="text-[8px] text-(--vestara-text-dim)">{(stage.durationMs / 1000).toFixed(1)}s</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Expandable stage drawer */}
      {selected && (
        <div className="mt-2 p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[10px] font-semibold ${mark(selected).color}`}>{selected.label}</span>
            <span className="text-[9px] text-(--vestara-text-muted)">
              {selected.status}
              {selected.agentId ? (
                <>
                  {' · '}<span className={agentTone(selected.agentId)}>{selected.agentId}</span>
                </>
              ) : (
                ''
              )}
            </span>
          </div>
          {selected.blockingReason && (
            <div
              role="alert"
              className="mb-1 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-2 py-1 text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-status-error)]"
            >
              ⊘ Blocked — {selected.blockingReason}
            </div>
          )}
          {selected.verification?.retryCount ? (
            <div className="text-[9px] text-(--vestara-text-muted) mb-1">
              verification {selected.verification.status} · retry {selected.verification.retryCount}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px] text-(--vestara-text-muted)">
            <div>tools ({selected.tools.length})</div>
            <div>files ({selected.files.length})</div>
            <div>evidence ({selected.evidenceCount})</div>
            <div>
              {selected.startedAt
                ? `${new Date(selected.startedAt).toLocaleTimeString()}${selected.completedAt ? ` → ${new Date(selected.completedAt).toLocaleTimeString()}` : ''}`
                : 'not started'}
            </div>
          </div>
          {selected.tools.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {selected.tools.slice(0, 8).map((tool) => (
                <span
                  key={tool}
                  className="rounded bg-[var(--vestara-surface-panel-raised)] px-1 py-0.5 font-mono text-[8px] text-[var(--vestara-text-muted)]"
                >
                  {tool}
                </span>
              ))}
            </div>
          )}
          {selected.files.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {selected.files.slice(0, 6).map((file) => (
                <span
                  key={file}
                  className="rounded bg-[var(--vestara-surface-panel-raised)] px-1 py-0.5 font-mono text-[8px] text-[var(--vestara-text-secondary)]"
                >
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
