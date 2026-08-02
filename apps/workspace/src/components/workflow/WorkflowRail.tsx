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

const AGENT_TONE: Record<string, string> = {
  conversation: 'text-(--vestara-purple)',
  analyst: 'text-(--vestara-blue)',
  planner: 'text-(--vestara-blue)',
  architect: 'text-(--vestara-blue)',
  developer: 'text-(--vestara-amber)',
  verifier: 'text-(--vestara-green)',
  reviewer: 'text-(--vestara-green)',
  system: 'text-(--vestara-text-muted)',
};

function agentTone(agentId: string): string {
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
          <span className="ml-1 px-1.5 py-0.5 rounded bg-(--vestara-red)/10 border border-(--vestara-red)/40 text-(--vestara-red) text-[8px] uppercase tracking-widest animate-pulse">
            live
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

      {/* Level 2: active stage card */}
      {active && (
        <div className="p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-md mb-2">
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
            <div className="text-[10px] text-(--vestara-amber) mt-0.5">blocked: {active.blockingReason}</div>
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
              {agent.status === 'active' ? '●' : '○'} {agent.name || agent.id}
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
