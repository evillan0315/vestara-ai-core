/**
 * FILES-PAGE-001 FP-9: File operations status bar.
 *
 * Consumes operation state from useFileOperations; never an execution
 * authority. Idle/active/success/failure plus first-class approval
 * (FP-10) with Review (approve + retry) and reject paths.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-9/FP-10.
 */

import { useState } from 'react';
import type { FileOpStatus, UseFileOperationsReturn } from '../hooks/useFileOperations';

interface FileOperationsBarProps {
  readonly ops: UseFileOperationsReturn;
}

function toneFor(state: FileOpStatus): 'idle' | 'active' | 'success' | 'failure' | 'approval' {
  return state.status;
}

export function FileOperationsBar({ ops }: FileOperationsBarProps) {
  const [busy, setBusy] = useState(false);
  const state = ops.state;
  const tone = toneFor(state);

  const dotClass =
    tone === 'active'
      ? 'bg-[var(--vestara-status-running)]'
      : tone === 'success'
        ? 'bg-[var(--vestara-status-success)]'
        : tone === 'failure'
          ? 'bg-[var(--vestara-status-error)]'
          : tone === 'approval'
            ? 'bg-[var(--vestara-status-warning)]'
            : 'bg-[var(--vestara-status-idle)]';

  const headline =
    state.status === 'idle'
      ? 'Ready · No active operations'
      : state.status === 'active'
        ? state.label
        : state.status === 'success'
          ? `${state.label} — done`
          : state.status === 'failure'
            ? `${state.label} failed`
            : `Approval required — ${state.label}`;

  const detail =
    state.status === 'failure' || state.status === 'approval' ? state.detail : undefined;

  const withBusy = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-10 flex-wrap items-center gap-2 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-3 py-2"
      role="status"
      aria-live="polite"
      aria-label="File operations"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--vestara-text-primary)]">
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
        File Operations
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--vestara-text-secondary)]" title={detail ?? headline}>
        {headline}
        {detail && <span className="text-[var(--vestara-text-muted)]"> — {detail}</span>}
      </span>
      {state.status === 'approval' && (
        <>
          <button
            type="button"
            onClick={withBusy(ops.approve)}
            disabled={busy}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-focus)] bg-[var(--vestara-accent-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--vestara-text-primary)] hover:border-[var(--vestara-border-default)] disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Review & approve'}
          </button>
          <button
            type="button"
            onClick={withBusy(ops.reject)}
            disabled={busy}
            className="rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-subtle)] px-2.5 py-1 text-xs text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)] disabled:opacity-50"
          >
            Reject
          </button>
        </>
      )}
      {state.status !== 'idle' && state.status !== 'active' && (
        <button
          type="button"
          onClick={ops.dismiss}
          aria-label="Dismiss operation status"
          className="rounded-[var(--vestara-radius-md)] px-2 py-1 text-xs text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
