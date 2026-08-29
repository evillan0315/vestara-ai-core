/**
 * WorkflowDiagram — premium horizontal lifecycle graph (Phase 7).
 * Completed stages are ✓, active pulses ●, pending ○, failed ✗, blocked ⊘.
 * The active connector animates; clicking a stage expands a detail drawer
 * (tools, files, evidence, verification, blocking reason).
 */

import { useState } from 'react';
import type { WorkflowProjection, WorkflowStage } from '../../lib/workflow';

function mark(stage: WorkflowStage): { glyph: string; color: string; bg: string } {
  switch (stage.status) {
    case 'completed':
      return { glyph: '✓', color: 'text-(--vestara-green)', bg: 'bg-(--vestara-green)/10' };
    case 'failed':
      return { glyph: '✗', color: 'text-(--vestara-red)', bg: 'bg-(--vestara-red)/10' };
    case 'blocked':
      return { glyph: '⊘', color: 'text-(--vestara-amber)', bg: 'bg-(--vestara-amber)/10' };
    case 'active':
      return { glyph: '●', color: 'text-(--vestara-accent-text)', bg: 'bg-(--vestara-accent-bg)' };
    default:
      return { glyph: '○', color: 'text-(--vestara-text-dim)', bg: 'bg-zinc-800/40' };
  }
}

export function WorkflowDiagram({ workflow }: { workflow: WorkflowProjection | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!workflow) return null;

  const selected = workflow.stages.find((stage) => stage.id === expanded);

  return (
    <div className="mt-2 p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-md">
      <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">
        Lifecycle Graph
      </div>
      {/* Horizontal flow */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {workflow.stages.map((stage, index) => {
          const { glyph, color, bg } = mark(stage);
          const isActive = stage.status === 'active';
          return (
            <div key={stage.id} className="flex items-center gap-1 shrink-0">
              {index > 0 && (
                <span
                  className={`text-(--vestara-text-dim) text-[11px] ${isActive ? 'animate-pulse text-(--vestara-accent-text)' : ''}`}
                >
                  ━━
                </span>
              )}
              <button
                type="button"
                onClick={() => setExpanded(expanded === stage.id ? null : stage.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${bg} cursor-pointer transition-colors ${
                  expanded === stage.id ? 'border-(--vestara-accent-border-active)' : 'border-(--vestara-accent-border)'
                } ${isActive ? 'ring-1 ring-(--vestara-accent-border)' : ''}`}
              >
                <span className={`${color} text-[11px] font-medium`}>
                  {glyph} {stage.label}
                </span>
                {stage.agentId && (
                  <span className="text-[8px] text-(--vestara-text-muted)">({stage.agentId})</span>
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
              {selected.agentId ? ` · ${selected.agentId}` : ''}
            </span>
          </div>
          {selected.blockingReason && (
            <div className="text-[10px] text-(--vestara-amber) mb-1">blocked: {selected.blockingReason}</div>
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
            <div className="flex flex-wrap gap-1 mt-1.5">
              {selected.tools.slice(0, 8).map((tool) => (
                <span key={tool} className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted) font-mono">
                  {tool}
                </span>
              ))}
            </div>
          )}
          {selected.files.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {selected.files.slice(0, 6).map((file) => (
                <span key={file} className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-2) font-mono">
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
