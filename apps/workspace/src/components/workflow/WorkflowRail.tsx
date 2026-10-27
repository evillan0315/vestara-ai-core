/**
 * WorkflowRail — reusable eight-stage lifecycle rail (Level 1) + active stage
 * card (Level 2) + owning-agent attribution + approvals + verification.
 * Renders from the canonical workflow projection.
 */

import { useState } from 'react';
import { harnessApi } from '../../lib/agent-harness';
import type { WorkflowProjection, WorkflowStage } from '../../lib/workflow';
import { WorkflowReplay } from './WorkflowReplay';
import { WorkflowSwimlanes } from './WorkflowSwimlanes';

function mark(stage: WorkflowStage): { glyph: string; color: string } {
  switch (stage.status) {
    case 'completed':
      return { glyph: '✓', color: 'text-(--vestara-status-success)' };
    case 'failed':
      return { glyph: '✗', color: 'text-(--vestara-status-error)' };
    case 'blocked':
      return { glyph: '⊘', color: 'text-(--vestara-status-error)' };
    case 'active':
      return { glyph: '●', color: 'text-(--vestara-accent-text)' };
    default:
      return { glyph: '○', color: 'text-(--vestara-text-dim)' };
  }
}

const AGENT_TONE: Record<string, string> = {
  conversation: 'text-(--vestara-purple)',
  assistant: 'text-(--vestara-purple)',
  context: 'text-(--vestara-status-info)',
  analyst: 'text-(--vestara-status-info)',
  planner: 'text-(--vestara-status-info)',
  planning: 'text-(--vestara-status-info)',
  architect: 'text-(--vestara-status-info)',
  developer: 'text-(--vestara-status-warning)',
  verifier: 'text-(--vestara-status-success)',
  reviewer: 'text-(--vestara-status-success)',
  system: 'text-(--vestara-text-muted)',
};

/** Shared agent→tone mapping (also used by WorkflowDiagram attribution). */
export function agentTone(agentId: string): string {
  const key = agentId.toLowerCase().replace(/[^a-z]/g, '');
  for (const [name, tone] of Object.entries(AGENT_TONE)) {
    if (key.includes(name)) return tone;
  }
  return 'text-(--vestara-text-muted)';
}

export function WorkflowRail({
  workflow,
  onRefresh,
}: {
  workflow: WorkflowProjection | null;
  onRefresh?: () => void;
}) {
  if (!workflow) return null;
  const [showSwimlanes, setShowSwimlanes] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const active = workflow.stages.find((stage) => stage.status === 'active');
  const pendingApprovals = workflow.approvals.filter((approval) => approval.status === 'pending');
  const live = workflow.status === 'running' || workflow.status === 'awaiting-approval';
  const owningAgents = new Set(workflow.stages.map((stage) => stage.agentId).filter(Boolean));
  const multiAgent = owningAgents.size > 1;
  const stuckStages = workflow.stages.filter((stage) => stage.status === 'blocked' || stage.status === 'failed');
  const progressPct =
    workflow.stages.length > 0
      ? Math.round((workflow.metrics.stagesCompleted / workflow.stages.length) * 100)
      : 0;

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
              {stage.agentId && stage.status !== 'pending' && (
                <span className={`text-[8px] ${agentTone(stage.agentId)}`}>({stage.agentId})</span>
              )}
            </span>
          );
        })}
        {live && (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-(--vestara-status-error-bg) border border-(--vestara-status-error-border) text-(--vestara-status-error) text-[8px] uppercase tracking-widest motion-safe:animate-pulse">
            live
          </span>
        )}
        {stuckStages.length > 0 && (
          <span
            role="alert"
            aria-live="polite"
            className="ml-1 px-1.5 py-0.5 rounded bg-[var(--vestara-status-error-bg)] border border-[var(--vestara-status-error-border)] text-[var(--vestara-status-error)] text-[8px] uppercase tracking-widest font-semibold"
          >
            ⊘ {stuckStages.length} blocked
          </span>
        )}
        {multiAgent && (
          <span
            title={`Multi-agent workflow — ${owningAgents.size} owning agents`}
            className="ml-1 px-1.5 py-0.5 rounded bg-(--vestara-purple)/10 border border-(--vestara-purple)/40 text-(--vestara-purple) text-[8px] uppercase tracking-widest"
          >
            multi-agent · {owningAgents.size}
          </span>
        )}
        <span className="ml-auto text-[9px] uppercase tracking-wider text-(--vestara-text-muted)">
          {workflow.status}
        </span>
      </div>
      {/* Stage progress: completed share of the lifecycle spine */}
      <div
        className="mb-2 h-1 overflow-hidden rounded-full bg-[var(--vestara-surface-panel-raised)]"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Workflow progress ${progressPct}%`}
        title={`${workflow.metrics.stagesCompleted}/${workflow.stages.length} stages complete`}
      >
        <div
          className="h-full rounded-full bg-[var(--vestara-status-success)]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Level 2: active stage card */}
      {active && (
        <div className="mb-2 rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-(--vestara-text)">
              {active.label}
              {active.agentId && (
                <span className={`ml-1.5 text-[9px] ${agentTone(active.agentId)}`}>· {active.agentId}</span>
              )}
            </span>
            <span className="text-(--vestara-text-muted)">
              {active.durationMs != null ? `${(active.durationMs / 1000).toFixed(1)}s` : ''}
            </span>
          </div>
          {active.activeOperation && (
            <div className="text-[10px] text-(--vestara-accent-text) mt-0.5">{active.activeOperation}</div>
          )}
          {active.blockingReason && (
            <div
              role="alert"
              className="mt-1 rounded-[var(--vestara-radius-md)] border border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-2 py-1 text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-status-error)]"
            >
              ⊘ Blocked — {active.blockingReason}
            </div>
          )}
          <div className="text-[9px] text-(--vestara-text-muted) mt-0.5">
            tools {active.tools.length} · files {active.files.length} · evidence {active.evidenceCount}
          </div>
        </div>
      )}

      {/* Owning agents */}
      {workflow.agents.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {workflow.agents.map((agent) => (
            <span key={agent.id} className={`text-[9px] ${agentTone(agent.id)}`}>
              {agent.status === 'active'
                ? '●'
                : agent.status === 'completed'
                  ? '✓'
                  : agent.status === 'failed'
                    ? '✗'
                    : '○'}{' '}
              {agent.name || agent.id}
            </span>
          ))}
          {workflow.swimlanes?.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSwimlanes((current) => !current)}
              className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
            >
              {showSwimlanes ? 'Hide lanes' : 'Swimlanes'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowReplay((current) => !current)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
          >
            {showReplay ? 'Hide replay' : 'Replay'}
          </button>
        </div>
      )}
      {showSwimlanes && <WorkflowSwimlanes lanes={workflow.swimlanes ?? []} />}
      {showReplay && <WorkflowReplay threadId={workflow.threadId} />}

      {/* Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="space-y-1 mb-2">
          {pendingApprovals.map((approval) => (
            <div key={approval.id} className="flex items-center gap-2 text-[10px] text-(--vestara-text-secondary)">
              <span className="text-(--vestara-status-warning)">⚠</span>
              <span className="flex-1 truncate">
                {approval.tool} — {approval.reason}
              </span>
              <button
                type="button"
                onClick={() => void resolveApproval(approval.id, true)}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--vestara-status-success-bg)] border border-[var(--vestara-status-success-border)] text-[var(--vestara-status-success)] hover:opacity-80 cursor-pointer"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void resolveApproval(approval.id, false)}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--vestara-status-error-bg)] border border-[var(--vestara-status-error-border)] text-[var(--vestara-status-error)] hover:opacity-80 cursor-pointer"
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
                  ? 'text-(--vestara-status-success)'
                  : workflow.verification.status === 'failed'
                    ? 'text-(--vestara-status-error)'
                    : 'text-(--vestara-status-warning)'
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
