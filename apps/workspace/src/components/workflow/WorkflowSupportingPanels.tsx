import type { WorkflowArtifact } from '@vestara/workflow-orchestrator';
import { navIcon } from '../../layouts/workspace-navigation';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel';

interface WorkflowSupportingPanelsProps {
  audit: readonly { type: string; at: string }[];
  artifacts: readonly Pick<WorkflowArtifact, 'id' | 'kind' | 'planId' | 'taskId' | 'createdAt'>[];
  variant?: 'graph' | 'evidence';
}

function ActivityPanel({ audit }: Pick<WorkflowSupportingPanelsProps, 'audit'>) {
  return (
    <WorkspaceOperationalPanel icon={navIcon('activity')} title="Recent activity" actions={<span className="workflow-panel-count">{audit.length}</span>} className="workflow-support-panel">
      {audit.length === 0 ? <p className="workflow-muted">No orchestration events are available.</p> : <ul className="workflow-event-list">
        {audit.slice(0, 6).map((event) => <li key={`${event.at}-${event.type}`}><span className="workflow-event-dot" aria-hidden="true" /><span>{event.type.replace('orchestration.', '')}</span><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time></li>)}
      </ul>}
    </WorkspaceOperationalPanel>
  );
}

function ExecutionPanel() {
  return (
    <WorkspaceOperationalPanel icon={navIcon('executions')} title="Execution timeline" description="Unavailable in the current WorkflowOrchestrator snapshot." className="workflow-support-panel workflow-execution-unavailable" tone="info">
      <p className="workflow-muted">Execution lineage is unavailable in the current WorkflowOrchestrator snapshot.</p>
    </WorkspaceOperationalPanel>
  );
}

function ArtifactsPanel({ artifacts }: Pick<WorkflowSupportingPanelsProps, 'artifacts'>) {
  return (
    <WorkspaceOperationalPanel icon={navIcon('artifacts')} title="Artifacts" actions={<span className="workflow-panel-count">{artifacts.length}</span>} className="workflow-support-panel workflow-artifacts-panel">
      {artifacts.length === 0 ? <p className="workflow-muted">No workflow artifacts are available.</p> : <ul className="workflow-artifact-list">
        {artifacts.slice(0, 12).map((artifact) => <li key={artifact.id}><span>{artifact.kind}</span><small>{artifact.taskId ?? artifact.planId ?? artifact.id}</small></li>)}
      </ul>}
    </WorkspaceOperationalPanel>
  );
}

export function WorkflowSupportingPanels({ audit, artifacts, variant = 'graph' }: WorkflowSupportingPanelsProps) {
  if (variant === 'evidence') return <div className="workflow-evidence-layout"><ArtifactsPanel artifacts={artifacts} /><ActivityPanel audit={audit} /><ExecutionPanel /></div>;
  return <div className="workflow-support-grid"><ActivityPanel audit={audit} /><ExecutionPanel /><ArtifactsPanel artifacts={artifacts} /></div>;
}
