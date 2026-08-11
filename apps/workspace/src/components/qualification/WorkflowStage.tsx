/**
 * WUX-001A — workflow lifecycle progress component.
 *
 * A shared UI projection of the canonical workflow stages. It is a display
 * component only and never replaces authoritative domain state.
 */

export interface WorkflowStageState {
  readonly stage: string;
  readonly label: string;
  readonly state: 'complete' | 'active' | 'pending' | 'blocked' | 'failed' | 'indeterminate' | 'skipped' | 'paused';
  /** Route or section responsible for this stage (for stage-click navigation). */
  readonly href?: string;
}

export const DEFAULT_WORKFLOW_STAGES: readonly WorkflowStageState[] = [
  { stage: 'intake', label: 'Objective', state: 'pending' },
  { stage: 'planning', label: 'Plan', state: 'pending' },
  { stage: 'plan-review', label: 'Plan Review', state: 'pending' },
  { stage: 'human-approval', label: 'Human Approval', state: 'pending' },
  { stage: 'execution', label: 'Execution', state: 'pending' },
  { stage: 'implementation-review', label: 'Review', state: 'pending' },
  { stage: 'verification', label: 'Verification', state: 'pending' },
  { stage: 'completion', label: 'Completion', state: 'pending' },
];

const DOT: Record<WorkflowStageState['state'], string> = {
  complete: 'bg-emerald-500 text-emerald-950',
  active: 'bg-sky-500 text-sky-950',
  pending: 'bg-zinc-700 text-zinc-300',
  blocked: 'bg-red-500 text-red-950',
  failed: 'bg-red-600 text-red-950',
  indeterminate: 'bg-amber-500 text-amber-950',
  skipped: 'bg-zinc-800 text-zinc-500',
  paused: 'bg-amber-400 text-amber-950',
};

export function stageForWorkflow(currentStage?: string): WorkflowStageState[] {
  const activeIndex = DEFAULT_WORKFLOW_STAGES.findIndex((stage) => stage.stage === currentStage);
  return DEFAULT_WORKFLOW_STAGES.map((stage, index) => {
    if (index === activeIndex) return { ...stage, state: 'active' };
    if (activeIndex < 0) return stage;
    return index < activeIndex ? { ...stage, state: 'complete' } : stage;
  });
}

export function WorkflowStage({
  stages,
  onClick,
}: {
  stages: readonly WorkflowStageState[];
  onClick?: (stage: WorkflowStageState) => void;
}) {
  return (
    <ol className="space-y-1">
      {stages.map((stage) => (
        <li key={stage.stage}>
          <button
            type="button"
            onClick={() => onClick?.(stage)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-white/5 disabled:cursor-default disabled:opacity-100"
            disabled={!onClick}
          >
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[stage.state]}`} aria-hidden="true" />
            <span className="text-(--vestara-text)">{stage.label}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">
              {stage.state}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
