/**
 * WUX-001A — global workflow header.
 *
 * Shared across every workflow-scoped page. The authoritative state and the
 * observer recommendation are rendered as visually distinct chips and are never
 * conflated; shadow-mode observations are always labelled "Applied: No".
 */

export interface WorkflowHeaderPrimaryAction {
  readonly label: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

export interface WorkflowHeaderProps {
  readonly workflowId: string;
  readonly objective: string;
  readonly authoritativeState: string;
  readonly observedState?: string;
  readonly observedApplied?: boolean;
  readonly budgetUsed?: string;
  readonly budgetLimit?: string;
  readonly activeAgent?: string;
  readonly nextRequiredAction: string;
  readonly lastUpdated?: string;
  readonly primaryAction?: WorkflowHeaderPrimaryAction;
  readonly executionBlocked?: boolean;
}

export function WorkflowHeader(props: WorkflowHeaderProps) {
  return (
    <header className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-(--vestara-text-muted)">{props.workflowId}</div>
          <h1 className="mt-1 text-sm font-semibold text-(--vestara-text)">{props.objective}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-300">
            Authoritative · {props.authoritativeState}
          </span>
          {props.observedState && (
            <span className="rounded-md border border-dashed border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-300">
              Observed · {props.observedState} — Applied: {props.observedApplied ? 'Yes' : 'No'}
            </span>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className="text-[10px] text-(--vestara-text-muted)">Next required action</dt>
          <dd className="text-xs text-(--vestara-text)">{props.nextRequiredAction}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-(--vestara-text-muted)">Budget</dt>
          <dd className="text-xs text-(--vestara-text)">
            {props.budgetUsed ? `${props.budgetUsed}${props.budgetLimit ? ` / ${props.budgetLimit}` : ''}` : '—'}
          </dd>
        </div>
        {props.activeAgent && (
          <div>
            <dt className="text-[10px] text-(--vestara-text-muted)">Active agent</dt>
            <dd className="text-xs text-(--vestara-text)">{props.activeAgent}</dd>
          </div>
        )}
        {props.lastUpdated && (
          <div>
            <dt className="text-[10px] text-(--vestara-text-muted)">Last update</dt>
            <dd className="text-xs text-(--vestara-text)">{props.lastUpdated}</dd>
          </div>
        )}
      </dl>

      {props.primaryAction && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={props.primaryAction.onClick}
            disabled={props.primaryAction.disabled}
            className="rounded-md bg-[var(--vestara-accent,var(--color-sky-600))] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.primaryAction.label}
          </button>
          {props.primaryAction.hint && (
            <span className="text-[10px] text-(--vestara-text-muted)">{props.primaryAction.hint}</span>
          )}
        </div>
      )}

      {props.executionBlocked && (
        <div className="mt-3 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          Execution capability is not enabled for this trial — no implementation task can be created.
        </div>
      )}
    </header>
  );
}
