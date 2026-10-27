/**
 * WorkflowApprovalActions — per-project approval CTA row.
 *
 * Presentation only: renders the approval-required block the inspector owns.
 * Resolution (approve/deny) hands back to the page, which owns refresh +
 * detail reload. Busy state stays a prop so only the clicked task disables.
 */

import { ActionIcon } from '@vestara/ui';
import { icons } from '@vestara/ui-components';
import type { OrchestrationApprovalTask } from './orchestration-project-types';

export interface WorkflowApprovalActionsProps {
  projectId: string;
  approvals: OrchestrationApprovalTask[];
  busy: string | null;
  onResolve: (projectId: string, taskId: string, approved: boolean) => void;
}

export function WorkflowApprovalActions({ projectId, approvals, busy, onResolve }: WorkflowApprovalActionsProps) {
  if (approvals.length === 0) return null;
  return (
    <div className="mt-[var(--vestara-spacing-3)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] p-[var(--vestara-spacing-3)]">
      <div className="text-xs font-medium text-[var(--vestara-status-warning)] mb-[var(--vestara-spacing-2)]">Approval required</div>
      <div className="space-y-[var(--vestara-spacing-2)]">
        {approvals.map((task) => (
          <div key={task.id} className="flex items-center gap-[var(--vestara-spacing-3)] flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--vestara-text-primary)]">{task.summary}</p>
              <p className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{task.approvalReason ?? 'high-risk change'}</p>
            </div>
            <div className="flex items-center gap-[var(--vestara-spacing-1)]">
              <ActionIcon
                size="sm"
                tone="success"
                label={`Approve ${task.summary}`}
                icon={<icons.Check size={14} />}
                onClick={() => void onResolve(projectId, task.id, true)}
                disabled={busy === task.id}
              />
              <ActionIcon
                size="sm"
                tone="destructive"
                label={`Deny ${task.summary}`}
                icon={<icons.X size={14} />}
                onClick={() => void onResolve(projectId, task.id, false)}
                disabled={busy === task.id}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
