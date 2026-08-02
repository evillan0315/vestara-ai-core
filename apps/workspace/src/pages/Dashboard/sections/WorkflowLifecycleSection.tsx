/**
 * WorkflowLifecycleSection — the Dashboard's live engineering-workflow view,
 * aligned with the four milestones: durable agent execution, engineering
 * event projection, the real-time workflow lifecycle, and the end-to-end
 * execution loop (approvals → verification → terminal outcome).
 */

import { useState } from 'react';
import { WorkflowDiagram } from '../../../components/workflow/WorkflowDiagram';
import { WorkflowRail } from '../../../components/workflow/WorkflowRail';
import type { WorkflowProjection } from '../../../lib/workflow';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface WorkflowLifecycleSectionProps {
  harnessThreads: Array<{ id: string; status: string; title?: string }>;
  workflowProjections: WorkflowProjection[];
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function WorkflowLifecycleSection({
  harnessThreads,
  workflowProjections,
  execSessions,
  dragSection,
}: WorkflowLifecycleSectionProps) {
  const [showChanges, setShowChanges] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const harnessSessions = execSessions.filter((session) => ((session.workflowId as string) ?? '').startsWith('thread:'));
  const runningThreads = harnessThreads.filter(
    (thread) => thread.status === 'running' || thread.status === 'active',
  ).length;
  const pendingApprovals = workflowProjections.reduce(
    (sum, workflow) => sum + workflow.approvals.filter((approval) => approval.status === 'pending').length,
    0,
  );
  const totalAdditions = workflowProjections.reduce((sum, workflow) => sum + workflow.metrics.additions, 0);
  const totalDeletions = workflowProjections.reduce((sum, workflow) => sum + workflow.metrics.deletions, 0);
  const activeAgents = [
    ...new Set(
      workflowProjections.flatMap((workflow) =>
        workflow.agents.filter((agent) => agent.status === 'active').map((agent) => agent.name || agent.id),
      ),
    ),
  ];

  if (harnessThreads.length === 0 && harnessSessions.length === 0) return null;

  return (
    <DashboardSection title="Live Engineering Workflow" icon="◈" dragSection={dragSection}>
      {/* Status strip */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-(--vestara-text-2) mb-2">
        <span>
          <span className="text-(--vestara-text) font-semibold">{harnessThreads.length}</span> harness threads
        </span>
        <span className="text-(--vestara-text-dim)">·</span>
        <span className="text-(--vestara-green)">
          {runningThreads} running
        </span>
        <span className="text-(--vestara-text-dim)">·</span>
        <span>
          <span className="text-(--vestara-amber) font-semibold">{pendingApprovals}</span> approvals pending
        </span>
        {totalAdditions + totalDeletions > 0 && (
          <>
            <span className="text-(--vestara-text-dim)">·</span>
            <span>
              <span className="text-(--vestara-green)">+{totalAdditions}</span>{' '}
              <span className="text-(--vestara-red)">-{totalDeletions}</span>
            </span>
          </>
        )}
        {activeAgents.length > 0 && (
          <>
            <span className="text-(--vestara-text-dim)">·</span>
            <span className="text-(--vestara-accent-text)">{activeAgents.join(', ')} active</span>
          </>
        )}
        <button
          type="button"
          onClick={() => setShowChanges((current) => !current)}
          className="text-[9px] px-2 py-1 rounded bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
        >
          {showChanges ? 'Hide changes' : 'Show changes'}
        </button>
        <button
          type="button"
          onClick={() => setShowDiagram((current) => !current)}
          className={`text-[9px] px-2 py-1 rounded border cursor-pointer ${
            showDiagram
              ? 'bg-(--vestara-accent-bg) border-(--vestara-accent-border-active) text-(--vestara-accent-text)'
              : 'bg-(--vestara-accent-bg) border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text)'
          }`}
        >
          {showDiagram ? 'Hide diagram' : 'Diagram'}
        </button>
      </div>

      {/* Active workflow rails + premium diagram */}
      {workflowProjections.length === 0 && (
        <p className="text-[10px] text-(--vestara-text-muted)">
          No active workflows. Start a harness run to watch the live lifecycle here.
        </p>
      )}
      <div className="space-y-2">
        {workflowProjections.map((workflow) => (
          <div key={workflow.workflowId}>
            <WorkflowRail workflow={workflow} />
            {showDiagram && <WorkflowDiagram workflow={workflow} />}
            {showChanges && workflow.changes.files.length > 0 && (
              <div className="mt-1 p-2 bg-black/30 border border-(--vestara-accent-border)/50 rounded-md">
                <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-1">
                  Changed files ({workflow.changes.files.length}) · {workflow.changes.summary}
                </div>
                <div className="space-y-0.5 max-h-40 overflow-auto">
                  {workflow.changes.files.map((change) => (
                    <div key={`${change.path}-${change.operation}`} className="text-[9px] font-mono text-(--vestara-text-2)">
                      <span
                        className={
                          change.operation === 'delete'
                            ? 'text-(--vestara-red)'
                            : change.operation === 'create'
                              ? 'text-(--vestara-green)'
                              : 'text-(--vestara-amber)'
                        }
                      >
                        {change.operation}
                      </span>{' '}
                      {change.path} <span className="text-(--vestara-text-dim)">+{change.additions} -{change.deletions}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
