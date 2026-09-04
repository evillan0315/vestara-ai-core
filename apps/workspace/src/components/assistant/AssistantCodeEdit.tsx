/**
 * GA-UX-PREMIUM M4A — AssistantCodeEdit.
 *
 * Deterministic presentation acceptance against the authoritative
 * `assistant.execution.v1` edit projection. Consumes typed structured
 * execution data ONLY — it never discovers edit evidence from status prose,
 * Assistant response text, tool output, repository rereads, git diff, or
 * browser state.
 *
 * Supports all three authoritative representations:
 * - diffRepresentation = 'patch'      → renders the runtime patch (unified-diff
 *   line classification for presentation only; the authoritative object stays
 *   the runtime patch string — never converted to hunks).
 * - diffRepresentation = 'hunks'      → renders runtime structured hunks,
 *   preserving optional line metadata exactly (never manufactured).
 * - diffRepresentation = 'unavailable'→ restrained "Diff unavailable" — no fake
 *   diff, no implication that no change occurred.
 *
 * Presentation-only: Copy path / Copy diff / expand-collapse. NO Apply /
 * Accept / Reject / Revert / Run (observational surface).
 */

import { useCallback, useState } from 'react';
import type { EditExecutionDetail } from '@vestara/shared';

// ─── Deterministic presentation rules ─────────────────────────

/** Diff line classification for unified-diff text (authorized by M4A). */
export type DiffLineKind = 'hunk' | 'add' | 'delete' | 'context';

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'delete';
  return 'context';
}

export function countChangedPatchLines(patch: string): number {
  return patch.split('\n').filter((line) => classifyDiffLine(line) === 'add' || classifyDiffLine(line) === 'delete').length;
}

/** Changed-line count of an edit detail (additions/deletions or derived). */
export function editChangedLines(detail: EditExecutionDetail): number | undefined {
  if (typeof detail.additions === 'number' || typeof detail.deletions === 'number') {
    return (detail.additions ?? 0) + (detail.deletions ?? 0);
  }
  if (detail.diffRepresentation === 'patch' && detail.patch) return countChangedPatchLines(detail.patch);
  if (detail.diffRepresentation === 'hunks' && detail.hunks) {
    return detail.hunks.reduce((total, hunk) => total + countChangedPatchLines(hunk.content), 0);
  }
  return undefined;
}

/**
 * Deterministic expansion rule (no viewport guessing): small edits (≤ 12
 * changed lines, or unknown count) default expanded; large edits collapse.
 */
export function resolveDefaultExpanded(detail: EditExecutionDetail): boolean {
  if (detail.diffRepresentation === 'unavailable') return false;
  const changed = editChangedLines(detail);
  return changed === undefined || changed <= 12;
}

// ─── Serialization (presentation-derived, never authority) ────

/** Presentational copy of a hunk header using ONLY fields the runtime supplied. */
function hunkHeader(hunk: { oldStart?: number; oldLines?: number; newStart?: number; newLines?: number }): string {
  const oldSide = [hunk.oldStart, hunk.oldLines].filter((v): v is number => v !== undefined).join(',');
  const newSide = [hunk.newStart, hunk.newLines].filter((v): v is number => v !== undefined).join(',');
  return `@@ -${oldSide} +${newSide} @@`;
}

/** Presentational diff text for Copy diff (Vestara-derived presentation). */
export function diffToText(detail: EditExecutionDetail): string {
  if (detail.diffRepresentation === 'patch' && detail.patch) return detail.patch;
  if (detail.diffRepresentation === 'hunks' && detail.hunks) {
    return detail.hunks.map((hunk) => `${hunkHeader(hunk)}\n${hunk.content}`).join('\n');
  }
  return '';
}

// ─── Component ────────────────────────────────────────────────

const OPERATION_LABEL: Record<string, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
  renamed: 'Renamed',
};

function filenameOf(file: string): string {
  const segments = file.split('/');
  return segments[segments.length - 1] ?? file;
}

export interface AssistantCodeEditProps {
  detail: EditExecutionDetail;
  /**
   * GA-UI-007: "Open in editor" navigation affordance. Bounded — never an
   * execution authority; the caller decides what "open" means (path copy
   * fallback today). When absent, the button is hidden.
   */
  onOpenInEditor?: (file: string) => void;
}

export function AssistantCodeEdit({ detail, onOpenInEditor }: AssistantCodeEditProps) {
  const [expanded, setExpanded] = useState<boolean>(() => resolveDefaultExpanded(detail));
  const [copied, setCopied] = useState<'path' | 'diff' | null>(null);
  const [openInEditorDone, setOpenInEditorDone] = useState(false);

  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const filename = filenameOf(detail.file);
  const label = detail.operation ? OPERATION_LABEL[detail.operation] ?? 'Edit' : 'Edit';
  const truncated = detail.patchTruncated === true || detail.hunksTruncated === true;
  const failed = detail.state === 'failed';

  const copyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(detail.file);
      setCopied('path');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, [detail.file]);

  const copyDiff = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diffToText(detail));
      setCopied('diff');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, [detail]);

  // GA-UI-007: "Open in editor" — bounded navigation affordance (caller-owned
  // semantics; today a copy-path fallback with visible feedback).
  const openInEditor = useCallback(() => {
    if (!onOpenInEditor) return;
    onOpenInEditor(detail.file);
    setOpenInEditorDone(true);
    setTimeout(() => setOpenInEditorDone(false), 2000);
  }, [onOpenInEditor, detail.file]);

  return (
    <div
      data-testid="assistant-code-edit"
      data-operation={detail.operation ?? 'edit'}
      data-state={detail.state}
      data-representation={detail.diffRepresentation}
      className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60"
    >
      {/* Header: operation · filename (primary) · counts · lifecycle · actions */}
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-1.5">
        {detail.state === 'running' ? (
          <span data-testid="code-edit-lifecycle" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 motion-reduce:animate-none animate-pulse" aria-hidden="true" />
        ) : detail.state === 'completed' ? (
          <span data-testid="code-edit-lifecycle" className="text-[11px] leading-none text-emerald-500/80" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span data-testid="code-edit-lifecycle" className="text-[11px] leading-none text-red-400/80" aria-hidden="true">
            ✕
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} diff for ${filename}`}
          className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
          data-testid="code-edit-toggle"
        >
          <span aria-hidden="true" className="text-[10px] text-zinc-600 shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className={`text-[12px] leading-snug truncate shrink-0 ${failed ? 'text-red-300/90' : 'text-zinc-300'}`}>
            {label}
          </span>
          <span className="min-w-0 text-[12px] leading-snug truncate text-zinc-200 font-medium">
            {filename}
          </span>
          {(typeof detail.additions === 'number' || typeof detail.deletions === 'number') && (
            <span data-testid="code-edit-counts" className="shrink-0 text-[11px] leading-snug text-zinc-500 tabular-nums">
              {typeof detail.additions === 'number' && <span className="text-emerald-500/70">+{detail.additions}</span>}
              {typeof detail.additions === 'number' && typeof detail.deletions === 'number' && <span> </span>}
              {typeof detail.deletions === 'number' && <span className="text-red-400/70">-{detail.deletions}</span>}
            </span>
          )}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {truncated && (
            <span
              data-testid="code-edit-truncated"
              title="The runtime diff exceeded the projection bound"
              className="mr-1 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] leading-none text-amber-500/90"
            >
              Diff preview truncated
            </span>
          )}
          <button
            type="button"
            onClick={copyPath}
            data-testid="code-edit-copy-path"
            title="Copy path"
            aria-label="Copy repository-relative path"
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {copied === 'path' ? 'Copied' : 'Path'}
          </button>
          <button
            type="button"
            onClick={copyDiff}
            data-testid="code-edit-copy-diff"
            title="Copy diff"
            aria-label="Copy diff"
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {copied === 'diff' ? 'Copied' : 'Diff'}
          </button>
          {onOpenInEditor && (
            <button
              type="button"
              onClick={openInEditor}
              data-testid="code-edit-open-in-editor"
              title="Open in editor (copies the repository-relative path)"
              aria-label="Open in editor"
              className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {openInEditorDone ? 'Copied' : 'Editor'}
            </button>
          )}
        </div>
      </div>

      {/* Secondary line: repository-relative path + unavailable/truncation prose */}
      <div className="flex min-w-0 items-center gap-2 px-2.5 pb-1.5 -mt-0.5">
        <span
          data-testid="code-edit-path"
          title={detail.file}
          className="min-w-0 truncate text-[10px] leading-none text-zinc-600"
        >
          {detail.file}
        </span>
        {detail.diffRepresentation === 'unavailable' && (
          <span data-testid="code-edit-unavailable" className="shrink-0 text-[10px] leading-none text-zinc-600 italic">
            Diff unavailable
          </span>
        )}
      </div>

      {/* Diff body */}
      {expanded && detail.diffRepresentation !== 'unavailable' && (
        <div data-testid="code-edit-diff" className="max-w-full border-t border-zinc-800/70 px-2 py-1.5">
          {detail.diffRepresentation === 'patch' && detail.patch ? (
            <PatchDiff patch={detail.patch} />
          ) : detail.diffRepresentation === 'hunks' && detail.hunks ? (
            <HunkDiff hunks={detail.hunks} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Diff renderers (internal horizontal scroll, restrained grammar) ──

function DiffLine({ line }: { line: string }) {
  const kind = classifyDiffLine(line);
  const marker = kind === 'add' ? '+' : kind === 'delete' ? '-' : kind === 'hunk' ? '@' : '';
  const content = kind === 'hunk' ? line : line.slice(1);
  return (
    <div
      data-testid="diff-line"
      data-kind={kind}
      className={`flex min-w-max px-1.5 leading-[1.5] text-[11px] font-mono whitespace-pre ${
        kind === 'add'
          ? 'bg-emerald-500/[0.06] text-emerald-300/80'
          : kind === 'delete'
            ? 'bg-red-500/[0.05] text-red-300/70'
            : kind === 'hunk'
              ? 'bg-zinc-800/60 text-amber-400/70'
              : 'text-zinc-500'
      }`}
    >
      <span aria-hidden="true" className={`w-3 shrink-0 select-none ${kind === 'add' ? 'text-emerald-500/60' : kind === 'delete' ? 'text-red-400/60' : 'text-transparent'}`}>
        {marker}
      </span>
      <span className="min-w-0">{content}</span>
    </div>
  );
}

function PatchDiff({ patch }: { patch: string }) {
  const lines = patch.split('\n');
  // Trailing newline yields a final empty line — drop it for presentation.
  if (lines[lines.length - 1] === '') lines.pop();
  return (
    <div data-testid="patch-diff" className="max-w-full overflow-x-auto rounded-md bg-zinc-950/50 py-1" role="region" aria-label="Runtime diff">
      {lines.map((line, index) => (
        <DiffLine key={`${index}:${line.slice(0, 40)}`} line={line} />
      ))}
    </div>
  );
}

function HunkDiff({ hunks }: { hunks: readonly { oldStart?: number; oldLines?: number; newStart?: number; newLines?: number; content: string }[] }) {
  return (
    <div data-testid="hunk-diff" className="max-w-full overflow-x-auto rounded-md bg-zinc-950/50 py-1" role="region" aria-label="Runtime diff">
      {hunks.map((hunk, hunkIndex) => {
        const lines = hunk.content.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        return (
          <div key={hunkIndex} data-testid="hunk">
            <DiffLine line={hunkHeader(hunk)} />
            {lines.map((line, index) => (
              <DiffLine key={`${hunkIndex}:${index}:${line.slice(0, 40)}`} line={line} />
            ))}
          </div>
        );
      })}
    </div>
  );
}