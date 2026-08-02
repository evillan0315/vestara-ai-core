/**
 * WorkflowRail — reusable eight-stage lifecycle rail (Level 1) + active stage
 * card (Level 2) + approvals + verification, consumed by both the Sessions and
 * Agent Control pages. Renders from the canonical workflow projection.
 */

import { harnessApi } from '../../lib/agent-harness';
import type { WorkflowProjection, WorkflowStage } from '../../lib/workflow';

function mark(stage: WorkflowStage): { glyph: string; color: string } {
  switch (stage.status) {
    case 'completed':
      return { glyph: '✓', color: 'text-(--vestara-green)' };
    case 'failed':
      return { glyph: '✗', color: 'text-(--vestara-red)' };
    case 'blocked':
      return { glyph: '⊘', color: 'text-(--vestara-amber)' };
    case 'active':
      return { glyph: '●', color: 'text-(--vestara-accent-text)' };
    default:
      return { glyph: '○', color: 'text-(--vestara-text-dim)' };
  }
}

export function WorkflowRail({
  workflow,
  onRefresh,
}: {
  workflow: WorkflowProjection | null;
  onRefresh?: () => void;
}) {
  if (!workflow) return null;
  const active = workflow.stages.find((stage) => stage.status === 'active');
  const pending = workflow.approvals.filter((approval) => approval.status === 'pending');

  const resolveApproval = async (approvalId: string, approved: boolean) => {
    await harnessApi.resolveApproval(workflow.threadId, approvalId, approved);
    onRefresh?.();
  };

  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      {/* Level 1: lifecycle rail */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] mb-2">
        {workflow.stages.map((stage, index) => {
          const { glyph, color } = mark(stage);
          return (
            <span key={stage.id} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-(--vestara-text-dim)">━</span>}
              <span className={`${color} font-medium`}>
                {glyph} {stage.label}
              </span>
            </span>
          );
        })}
        <span className="ml-auto text-[9px] uppercase tracking-wider text-(--vestara-text-muted)">
          {workflow.status}
        </span>
      </div>

      {/* Level 2: active stage card */}
      {active && (
        <div className="p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-md mb-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-(--vestara-text)">{active.label}</span>
            <span className="text-(--vestara-text-muted)">
              {active.agentId ? `agent ${active.agentId}` : ''}
              {active.durationMs != null ? ` · ${(active.durationMs / 1000).toFixed(1)}s` : ''}
            </span>
          </div>
          {active.activeOperation && (
            <div className="text-[10px] text-(--vestara-accent-text) mt-0.5">{active.activeOperation}</div>
          )}
          <div className="text-[9px] text-(--vestara-text-muted) mt-0.5">
            tools {active.tools.length} · files {active.files.length} · evidence {active.evidenceCount}
          </div>
        </div>
      )}

      {/* Approvals */}
      {pending.length > 0 && (
        <div className="space-y-1 mb-2">
          {pending.map((approval) => (
            <div key={approval.id} className="flex items-center gap-2 text-[10px] text-(--vestara-text-2)">
              <span className="text-(--vestara-amber)">⚠</span>
              <span className="flex-1 truncate">
                {approval.tool} — {approval.reason}
              </span>
              <button
                type="button"
                onClick={() => void resolveApproval(approval.id, true)}
                className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-green)/10 border border-(--vestara-green)/40 text-(--vestara-green) hover:bg-(--vestara-green)/20 cursor-pointer"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void resolveApproval(approval.id, false)}
                className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-red)/10 border border-(--vestara-red)/40 text-(--vestara-red) hover:bg-(--vestara-red)/20 cursor-pointer"
              >
                Deny
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Verification + metrics */}
      <div className="flex items-center gap-2 flex-wrap text-[9px] text-(--vestara-text-muted)">
        {workflow.verification && (
          <span>
            Verification:{' '}
            <span
              className={
                workflow.verification.status === 'passed'
                  ? 'text-(--vestara-green)'
                  : workflow.verification.status === 'failed'
                    ? 'text-(--vestara-red)'
                    : 'text-(--vestara-amber)'
              }
            >
              {workflow.verification.status}
            </span>
            {workflow.verification.confidence != null && ` (${Math.round(workflow.verification.confidence * 100)}%)`}
          </span>
        )}
        <span>· {(workflow.metrics.elapsedMs / 1000).toFixed(1)}s</span>
        <span>· {workflow.metrics.stagesCompleted}/{workflow.stages.length} stages</span>
        <span>· +{workflow.metrics.additions} -{workflow.metrics.deletions}</span>
      </div>
    </div>
  );
}
