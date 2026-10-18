/**
 * GA-UI-007 — AssistantFilesSummary
 *
 * Compact rollup of authoritative edit projections (assistant.execution.v1
 * kind 'edit') into a "Files modified" card. Presentation-only: file paths,
 * M/A/D status, and +/- counts come exclusively from the projection; nothing
 * is fabricated (no elapsed time, no ownership, no verification). Rendered
 * once per turn, after the assistant response, matching the reference surface.
 */

import type { AssistantExecutionDetail, EditExecutionDetail } from '@vestara/shared';

function filenameOf(file: string): string {
  const segments = file.split('/');
  return segments[segments.length - 1] ?? file;
}

/** M/A/D status badge styling. */
function OperationBadge({ operation }: { operation?: EditExecutionDetail['operation'] }) {
  if (!operation || operation === 'modified') return null;
  const styles: Record<string, string> = {
    added: 'bg-(status-success-bg) text-(--vestara-status-success)',
    deleted: 'bg-(status-error-bg) text-(--vestara-status-error)',
    renamed: 'bg-(accent-bg) text-(--vestara-accent-text)',
  };
  const labels: Record<string, string> = {
    added: 'A',
    deleted: 'D',
    renamed: 'R',
  };
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-(--vestara-font-size-micro) font-bold leading-none ${styles[operation]}`}
      aria-label={operation}
    >
      {labels[operation]}
    </span>
  );
}

export interface AssistantFilesSummaryProps {
  edits: readonly AssistantExecutionDetail[];
}

export function AssistantFilesSummary({ edits }: AssistantFilesSummaryProps) {
  const editDetails = edits.filter(
    (e): e is Extract<AssistantExecutionDetail, { kind: 'edit' }> => e.kind === 'edit' && e.state === 'completed',
  );
  if (editDetails.length === 0) return null;

  return (
    <div
      data-testid="assistant-files-summary"
      role="group"
      aria-label={`Files modified — ${editDetails.length}`}
      className="mt-2 min-w-0 rounded-xl border border-(--vestara-border-default)/70 bg-gradient-to-b from-(--vestara-surface-shell)/80 to-(--vestara-surface-shell)/40 overflow-hidden"
    >
      <div className="border-b border-(--vestara-border-default)/70 px-3 py-1.5 flex items-center gap-1.5">
        <svg className="h-3 w-3 shrink-0 text-(--vestara-text-muted)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-(--vestara-font-size-caption) font-semibold tracking-tight text-(--vestara-text-secondary)">
          Files modified
        </span>
        <span className="ml-auto rounded-full bg-(--vestara-surface-interactive)/70 px-1.5 py-0.5 text-(--vestara-font-size-micro) font-medium text-(--vestara-text-muted) tabular-nums">
          {editDetails.length}
        </span>
      </div>
      <ul className="min-w-0 px-1 py-1">
        {editDetails.map((edit, index) => (
          <li
            key={`${edit.file}:${index}`}
            data-testid="files-summary-item"
            data-operation={edit.operation ?? 'modified'}
            title={edit.file}
            className="flex min-w-0 items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-(--vestara-surface-interactive)/40 transition-colors text-(--vestara-font-size-label)"
          >
            <OperationBadge operation={edit.operation} />
            <svg className="h-3 w-3 shrink-0 text-(--vestara-text-disabled)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="min-w-0 truncate text-(--vestara-text-primary)">{filenameOf(edit.file)}</span>
            {(typeof edit.additions === 'number' || typeof edit.deletions === 'number') && (
              <span className="ml-auto shrink-0 text-(--vestara-text-disabled) tabular-nums font-mono">
                {typeof edit.additions === 'number' && <span className="text-(--vestara-status-success)/80">+{edit.additions}</span>}
                {typeof edit.additions === 'number' && typeof edit.deletions === 'number' && <span className="text-(--vestara-text-disabled)">/</span>}
                {typeof edit.deletions === 'number' && <span className="text-(--vestara-status-error)/80">-{edit.deletions}</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}