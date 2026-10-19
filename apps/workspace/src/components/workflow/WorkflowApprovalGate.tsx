import { Badge, Button } from '@vestara/ui';
import type { ApprovalGate } from '../../lib/orchestration-approval';

export interface WorkflowApprovalGateProps {
  gate: ApprovalGate;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Human decision surface for the two orchestration approval gates. Both
 * outcomes are always visible — approval is never the only affordance.
 * Every visual value comes from a `--vestara-*` token.
 */
export function WorkflowApprovalGate({ gate, busy, error, onApprove, onReject }: WorkflowApprovalGateProps) {
  return (
    <section
      className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-surface-panel)] p-[var(--vestara-spacing-3)]"
      aria-label={`${gate.title} approval gate`}
    >
      <div className="flex flex-wrap items-start justify-between gap-[var(--vestara-spacing-2)]">
        <div>
          <div className="font-mono text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
            Approval gate
          </div>
          <h3 className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
            {gate.title}
          </h3>
          <p className="mt-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]">
            {gate.detail}
          </p>
        </div>
        <Badge variant="warning" size="sm">
          Awaiting your decision
        </Badge>
      </div>
      <div className="mt-[var(--vestara-spacing-3)] flex flex-wrap gap-[var(--vestara-spacing-2)]">
        <Button variant="primary" size="sm" onClick={onApprove} loading={busy} disabled={busy}>
          {gate.approveLabel}
        </Button>
        <Button variant="danger" size="sm" onClick={onReject} disabled={busy}>
          {gate.rejectLabel}
        </Button>
      </div>
      {error && (
        <p
          className="mt-[var(--vestara-spacing-2)] text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-status-error)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
