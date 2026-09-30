import type { WorkflowGraphNode } from '@vestara/workflow-orchestrator';
import { navIcon } from '../../layouts/workspace-navigation';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel';

interface WorkflowNodeInspectorProps {
  node: WorkflowGraphNode | null;
  task?: {
    description: string;
    planId: string;
    dependencies: readonly string[];
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="workflow-inspector-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function WorkflowNodeInspector({ node, task }: WorkflowNodeInspectorProps) {
  if (!node) {
    return (
      <WorkspaceOperationalPanel icon={navIcon('workflows')} title="Node details" className="workflow-inspector workflow-panel-empty">
        <p>Select a plan or task in the graph to inspect its authoritative details.</p>
      </WorkspaceOperationalPanel>
    );
  }

  return (
    <WorkspaceOperationalPanel
      icon={navIcon('workflows')}
      title={node.label}
      description={`Selected ${node.kind}`}
      actions={<span className="workflow-status-chip" data-status={node.status}>{node.status}</span>}
      className="workflow-inspector"
    >
      {node.kind === 'task' && task && (
        <div className="workflow-inspector-operational">
          {task.description && <p>{task.description}</p>}
          <div className="workflow-inspector-dependencies">
            <span>Dependencies</span>
            <strong>{task.dependencies.length ? task.dependencies.join(', ') : 'None'}</strong>
          </div>
        </div>
      )}
      <div className="workflow-inspector-section-label">Technical identity</div>
      <dl>
        <DetailRow label="Source ID" value={node.source.id} />
        <DetailRow label="Node kind" value={node.kind} />
        {node.kind === 'task' && task && <DetailRow label="Plan ID" value={task.planId} />}
      </dl>
    </WorkspaceOperationalPanel>
  );
}
