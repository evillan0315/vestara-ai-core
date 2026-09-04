/**
 * GA-UI-007 — AssistantFilesSummary
 *
 * Compact rollup of authoritative edit projections (assistant.execution.v1
 * kind 'edit') into a "Files modified" card. Presentation-only: file paths
 * and +/- counts come exclusively from the projection; nothing is fabricated
 * (no elapsed time, no ownership, no verification). Rendered once per turn,
 * after the assistant response, matching the reference surface.
 */

import type { AssistantExecutionDetail } from '@vestara/shared';

function filenameOf(file: string): string {
  const segments = file.split('/');
  return segments[segments.length - 1] ?? file;
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
      className="mt-2 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60"
    >
      <div className="border-b border-zinc-800/70 px-2.5 py-1.5 text-[10px] font-medium text-zinc-500">
        Files modified
      </div>
      <ul className="min-w-0 px-1 py-1">
        {editDetails.map((edit, index) => (
          <li
            key={`${edit.file}:${index}`}
            data-testid="files-summary-item"
            title={edit.file}
            className="flex min-w-0 items-baseline gap-2 px-1.5 py-1 text-[11px]"
          >
            <span className="min-w-0 truncate text-zinc-300">{filenameOf(edit.file)}</span>
            {(typeof edit.additions === 'number' || typeof edit.deletions === 'number') && (
              <span className="ml-auto shrink-0 text-zinc-600 tabular-nums">
                {typeof edit.additions === 'number' && <span className="text-emerald-500/70">+{edit.additions}</span>}
                {typeof edit.additions === 'number' && typeof edit.deletions === 'number' && <span> </span>}
                {typeof edit.deletions === 'number' && <span className="text-red-400/70">-{edit.deletions}</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}