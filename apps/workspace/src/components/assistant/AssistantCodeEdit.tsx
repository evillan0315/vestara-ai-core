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
  const language = detectLanguage(detail.file);

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
      className="min-w-0 rounded-xl border border-(--vestara-border-default)/70 bg-gradient-to-b from-(--vestara-surface-shell)/80 to-(--vestara-surface-shell)/40 overflow-hidden"
    >
      {/* Header: operation · filename (primary) · counts · lifecycle · actions */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        {detail.state === 'running' ? (
          <span data-testid="code-edit-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-(accent-bg)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--vestara-accent) motion-reduce:animate-none animate-pulse" aria-hidden="true" />
          </span>
        ) : detail.state === 'completed' ? (
          <span data-testid="code-edit-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-(status-success-bg) text-(--vestara-font-size-caption) leading-none text-(--vestara-status-success)" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span data-testid="code-edit-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-(status-error-bg) text-(--vestara-font-size-caption) leading-none text-(--vestara-status-error)" aria-hidden="true">
            ✕
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} diff for ${filename}`}
          className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-(--vestara-accent)/60"
          data-testid="code-edit-toggle"
        >
          <span aria-hidden="true" className="text-(--vestara-font-size-caption) text-(--vestara-text-disabled) shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className={`text-(--vestara-font-size-body-small) leading-snug truncate shrink-0 ${failed ? 'text-(--vestara-status-error)/90' : 'text-(--vestara-text-primary)'}`}>
            {label}
          </span>
          <span className="min-w-0 text-(--vestara-font-size-body-small) leading-snug truncate text-(--vestara-text-primary) font-medium">
            {filename}
          </span>
          {language && (
            <span className="shrink-0 rounded bg-(--vestara-surface-interactive)/80 px-1.5 py-px text-(--vestara-font-size-micro) font-medium text-(--vestara-text-muted) uppercase tracking-wider">
              {language}
            </span>
          )}
          {(typeof detail.additions === 'number' || typeof detail.deletions === 'number') && (
            <span data-testid="code-edit-counts" className="shrink-0 text-(--vestara-font-size-label) leading-snug text-(--vestara-text-muted) tabular-nums">
              {typeof detail.additions === 'number' && <span className="text-(--vestara-status-success)/70">+{detail.additions}</span>}
              {typeof detail.additions === 'number' && typeof detail.deletions === 'number' && <span> </span>}
              {typeof detail.deletions === 'number' && <span className="text-(--vestara-status-error)/70">-{detail.deletions}</span>}
            </span>
          )}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {truncated && (
            <span
              data-testid="code-edit-truncated"
              title="The runtime diff exceeded the projection bound"
              className="mr-1 rounded bg-(accent-bg) px-1 py-0.5 text-(--vestara-font-size-caption) leading-none text-(--vestara-accent-text)/90"
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
            className="rounded px-1.5 py-0.5 text-(--vestara-font-size-label) text-(--vestara-text-muted) hover:text-(--vestara-text-primary) hover:bg-(--vestara-surface-interactive) transition-colors cursor-pointer"
          >
            {copied === 'path' ? 'Copied' : 'Path'}
          </button>
          <button
            type="button"
            onClick={copyDiff}
            data-testid="code-edit-copy-diff"
            title="Copy diff"
            aria-label="Copy diff"
            className="rounded px-1.5 py-0.5 text-(--vestara-font-size-label) text-(--vestara-text-muted) hover:text-(--vestara-text-primary) hover:bg-(--vestara-surface-interactive) transition-colors cursor-pointer"
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
              className="rounded px-1.5 py-0.5 text-(--vestara-font-size-label) text-(--vestara-text-muted) hover:text-(--vestara-text-primary) hover:bg-(--vestara-surface-interactive) transition-colors cursor-pointer"
            >
              {openInEditorDone ? 'Copied' : 'Editor'}
            </button>
          )}
        </div>
      </div>

      {/* Secondary line: repository-relative path + unavailable/truncation prose */}
      <div className="flex min-w-0 items-center gap-2 px-3 pb-2 -mt-0.5">
        <span
          data-testid="code-edit-path"
          title={detail.file}
          className="min-w-0 truncate text-(--vestara-font-size-caption) leading-none text-(--vestara-text-disabled) font-mono"
        >
          {detail.file}
        </span>
        {detail.diffRepresentation === 'unavailable' && (
          <span data-testid="code-edit-unavailable" className="shrink-0 text-(--vestara-font-size-caption) leading-none text-(--vestara-text-disabled) italic">
            Diff unavailable
          </span>
        )}
      </div>

      {/* Diff body */}
      {expanded && detail.diffRepresentation !== 'unavailable' && (
        <div data-testid="code-edit-diff" className="max-w-full border-t border-(--vestara-border-default)/70 px-2 py-2 assistant-expand-enter">
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

/** Detect language from file extension for presentation labeling. */
function detectLanguage(file: string): string | undefined {
  const ext = file.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  const langMap: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
    css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', yaml: 'YAML',
    yml: 'YAML', md: 'Markdown', sh: 'Shell', bash: 'Shell', sql: 'SQL',
    xml: 'XML', toml: 'TOML', lua: 'Lua', c: 'C', cpp: 'C++', h: 'C/C++',
  };
  return langMap[ext];
}

function DiffLine({ line, oldLineNum, newLineNum }: { line: string; oldLineNum?: number; newLineNum?: number }) {
  const kind = classifyDiffLine(line);
  const marker = kind === 'add' ? '+' : kind === 'delete' ? '-' : kind === 'hunk' ? '@' : '';
  const content = kind === 'hunk' ? line : line.slice(1);
  return (
    <div
      data-testid="diff-line"
      data-kind={kind}
      className={`flex min-w-max leading-[1.6] text-(--vestara-font-size-label) font-mono whitespace-pre ${
        kind === 'add'
          ? 'bg-(--vestara-status-success)/[0.08] text-(--vestara-status-success)/90 border-l-2 border-(status-success-border)'
          : kind === 'delete'
            ? 'bg-(--vestara-status-error)/[0.06] text-(--vestara-status-error)/80 border-l-2 border-(status-error-border)'
            : kind === 'hunk'
              ? 'bg-(--vestara-surface-interactive)/50 text-(--vestara-accent-text)/80 border-l-2 border-(accent-border) font-semibold'
              : 'text-(--vestara-text-muted) border-l-2 border-transparent'
      }`}
    >
      {/* Line number gutter */}
      {kind !== 'hunk' && (
        <span className="inline-flex w-16 shrink-0 select-none text-right pr-2 text-(--vestara-text-disabled)" aria-hidden="true">
          <span className="w-6 inline-block text-right">{oldLineNum ?? ''}</span>
          <span className="w-6 inline-block text-right">{newLineNum ?? ''}</span>
        </span>
      )}
      {kind === 'hunk' && (
        <span className="inline-flex w-16 shrink-0 select-none" aria-hidden="true" />
      )}
      <span aria-hidden="true" className={`w-4 shrink-0 select-none text-center ${kind === 'add' ? 'text-(--vestara-status-success)/70' : kind === 'delete' ? 'text-(--vestara-status-error)/70' : 'text-transparent'}`}>
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

  // Compute line numbers from the patch
  let oldNum = 0;
  let newNum = 0;
  const lineNumbers: Array<{ old?: number; new?: number }> = [];
  for (const line of lines) {
    const kind = classifyDiffLine(line);
    if (kind === 'hunk') {
      // Parse hunk header for starting line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldNum = parseInt(match[1], 10);
        newNum = parseInt(match[2], 10);
      }
      lineNumbers.push({});
    } else if (kind === 'add') {
      lineNumbers.push({ new: newNum });
      newNum++;
    } else if (kind === 'delete') {
      lineNumbers.push({ old: oldNum });
      oldNum++;
    } else {
      lineNumbers.push({ old: oldNum, new: newNum });
      oldNum++;
      newNum++;
    }
  }

  return (
    <div data-testid="patch-diff" className="max-w-full overflow-x-auto rounded-md bg-(--vestara-surface-canvas)/50 py-1" role="region" aria-label="Runtime diff">
      {lines.map((line, index) => (
        <DiffLine
          key={`${index}:${line.slice(0, 40)}`}
          line={line}
          oldLineNum={lineNumbers[index]?.old}
          newLineNum={lineNumbers[index]?.new}
        />
      ))}
    </div>
  );
}

function HunkDiff({ hunks }: { hunks: readonly { oldStart?: number; oldLines?: number; newStart?: number; newLines?: number; content: string }[] }) {
  return (
    <div data-testid="hunk-diff" className="max-w-full overflow-x-auto rounded-md bg-(--vestara-surface-canvas)/50 py-1" role="region" aria-label="Runtime diff">
      {hunks.map((hunk, hunkIndex) => {
        const lines = hunk.content.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        let oldNum = hunk.oldStart ?? 0;
        let newNum = hunk.newStart ?? 0;
        const lineNumbers: Array<{ old?: number; new?: number }> = [];
        for (const line of lines) {
          const kind = classifyDiffLine(line);
          if (kind === 'add') {
            lineNumbers.push({ new: newNum });
            newNum++;
          } else if (kind === 'delete') {
            lineNumbers.push({ old: oldNum });
            oldNum++;
          } else {
            lineNumbers.push({ old: oldNum, new: newNum });
            oldNum++;
            newNum++;
          }
        }

        return (
          <div key={hunkIndex} data-testid="hunk">
            <DiffLine line={hunkHeader(hunk)} />
            {lines.map((line, index) => (
              <DiffLine
                key={`${hunkIndex}:${index}:${line.slice(0, 40)}`}
                line={line}
                oldLineNum={lineNumbers[index]?.old}
                newLineNum={lineNumbers[index]?.new}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}