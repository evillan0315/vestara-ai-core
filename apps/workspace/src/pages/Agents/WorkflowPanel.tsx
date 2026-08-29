import { useState } from 'react';
import type { MultiAgentWorkflowTemplateId } from '../../lib/workflow';

interface WorkflowPanelProps {
  open: boolean;
  onStart: (goal: string, template: MultiAgentWorkflowTemplateId) => Promise<boolean>;
}

export default function WorkflowPanel({ open, onStart }: WorkflowPanelProps) {
  const [workflowGoal, setWorkflowGoal] = useState('');
  const [workflowTemplate, setWorkflowTemplate] = useState<MultiAgentWorkflowTemplateId>('default');
  const [startingWorkflow, setStartingWorkflow] = useState(false);

  const startWorkflow = async () => {
    if (!workflowGoal.trim()) return;
    setStartingWorkflow(true);
    try {
      const ok = await onStart(workflowGoal.trim(), workflowTemplate);
      if (ok) setWorkflowGoal('');
    } finally {
      setStartingWorkflow(false);
    }
  };

  if (!open) return null;

  return (
    <div className="p-3 mb-4 bg-(--vestara-accent-bg) border border-purple-400/30 rounded-lg">
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">
        Multi-Agent Workflow — planner → developer → verifier → reviewer
      </div>
      <div className="flex items-center gap-2">
        <select
          value={workflowTemplate}
          onChange={(e) => setWorkflowTemplate(e.target.value as MultiAgentWorkflowTemplateId)}
          className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg px-2 py-1.5 text-[10px] outline-none focus:border-(--vestara-accent-border-active) cursor-pointer shrink-0"
          title="Workflow template (preset stage plan)"
        >
          <option value="default">Standard pipeline</option>
          <option value="agent-control-restructure">Restructure Agent Control</option>
          <option value="activity-room-premium-redesign">Activity Room Premium Redesign</option>
        </select>
        <input
          value={workflowGoal}
          onChange={(e) => setWorkflowGoal(e.target.value)}
          placeholder="Describe the goal for the workflow..."
          onKeyDown={(e) => e.key === 'Enter' && !startingWorkflow && void startWorkflow()}
          className="flex-1 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text) placeholder-zinc-600 outline-none focus:border-(--vestara-accent-border-active)"
        />
        <button
          onClick={() => void startWorkflow()}
          disabled={startingWorkflow || !workflowGoal.trim()}
          className="text-[10px] px-3 py-1.5 bg-purple-400/10 border border-purple-400/30 text-purple-400 rounded-lg hover:bg-purple-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium shrink-0"
        >
          {startingWorkflow ? 'Starting...' : 'Start'}
        </button>
      </div>
    </div>
  );
}
