import type { WorkflowSummary } from '@vestara/activity-room';
import { StatusIndicator } from '@vestara/ui';

interface ActivityRoomOperationalLaneProps {
  readonly workflow: WorkflowSummary;
}

const STATUS_LABELS: Record<WorkflowSummary['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatElapsed(startedAt: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s elapsed`;
  return `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s elapsed`;
}

export default function ActivityRoomOperationalLane({ workflow }: ActivityRoomOperationalLaneProps) {
  const progress = workflow.taskCount > 0 ? Math.round((workflow.completedTasks / workflow.taskCount) * 100) : 0;
  const statusLabel = STATUS_LABELS[workflow.status];
  const isActive = workflow.status === 'running' || workflow.status === 'pending';

  return (
    <section className="ar-operational-lane" aria-label="Current workflow operation">
      <div className="ar-operational-lane__identity">
        <div className="ar-operational-lane__glyph" aria-hidden="true">◇</div>
        <div className="min-w-0">
          <p className="ar-kicker">Operational lane</p>
          <div className="ar-operational-lane__status">
            <StatusIndicator variant={isActive ? 'live' : workflow.status === 'failed' ? 'error' : 'idle'} size="xs" pulse={isActive} ariaLabel={statusLabel} />
            <strong>{statusLabel}</strong>
            <span className="ar-operational-lane__run">{workflow.workflowRunId}</span>
          </div>
          <p className="ar-operational-lane__meta">
            {workflow.currentTask ?? 'Workflow operation'} · {formatElapsed(workflow.startedAt)}
          </p>
        </div>
      </div>

      <div className="ar-operational-lane__progress" aria-label={`${progress}% complete`}>
        <div className="ar-operational-lane__progress-head">
          <span>{workflow.completedTasks} of {workflow.taskCount} tasks complete</span>
          <strong>{progress}%</strong>
        </div>
        <progress className="ar-operational-lane__track" value={progress} max={100} aria-label={`${progress}% complete`} />
      </div>

      <div className="ar-operational-lane__queue">
        <span className="ar-kicker">Queue</span>
        <strong>{Math.max(0, workflow.taskCount - workflow.completedTasks)}</strong>
        {workflow.failedTasks > 0 && <span className="ar-operational-lane__failed">{workflow.failedTasks} failed</span>}
      </div>
    </section>
  );
}
