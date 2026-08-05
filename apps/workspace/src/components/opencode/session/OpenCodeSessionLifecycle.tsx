import type { OpenCodeLifecycleStageState, OpenCodeWorkflowOutcome } from './openCodeSessionReducer';

interface OpenCodeSessionLifecycleProps {
  lifecycle: readonly OpenCodeLifecycleStageState[];
  outcome: OpenCodeWorkflowOutcome;
  aborted: boolean;
}

const OUTCOME_LABEL: Record<OpenCodeWorkflowOutcome, string> = {
  completed: 'Completed successfully',
  failed: 'Failed',
  aborted: 'Aborted',
  unknown: 'Unknown outcome',
};

const OUTCOME_TONE: Record<OpenCodeWorkflowOutcome, string> = {
  completed: 'text-(--vestara-green)',
  failed: 'text-(--vestara-red)',
  aborted: 'text-(--vestara-amber)',
  unknown: 'text-(--vestara-text-muted)',
};

const STAGE_TONE: Record<OpenCodeLifecycleStageState['status'], string> = {
  pending: 'text-(--vestara-text-dim)',
  active: 'text-(--vestara-accent)',
  completed: 'text-(--vestara-green)',
  failed: 'text-(--vestara-red)',
  blocked: 'text-(--vestara-amber)',
  skipped: 'text-(--vestara-text-muted)',
};

export function OpenCodeSessionLifecycle({ lifecycle, outcome, aborted }: OpenCodeSessionLifecycleProps) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Lifecycle</div>
      <ol className="space-y-1.5">
        {lifecycle.map((entry) => (
          <li key={entry.stage} className="flex items-center gap-2 text-[11px]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${entry.status === 'active' ? 'bg-(--vestara-accent) animate-pulse' : entry.status === 'completed' ? 'bg-(--vestara-green)' : 'bg-zinc-700'}`}
            />
            <span className={`capitalize ${STAGE_TONE[entry.status]}`}>{entry.stage}</span>
          </li>
        ))}
      </ol>
      <div
        className={`mt-3 pt-2 border-t border-(--vestara-accent-border) text-[11px] font-medium ${OUTCOME_TONE[outcome]}`}
      >
        {OUTCOME_LABEL[outcome]}
      </div>
    </div>
  );
}
