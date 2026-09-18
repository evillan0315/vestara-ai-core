/**
 * FILES-EDITOR-001 F-E-3: Editor status footer.
 *
 * Path, dirty indicator, cursor line/column, language, size. Presentation
 * only — cursor position is reported by CodeEditor via onCursorChange.
 *
 * Architecture Traceability:
 *   IDE-RECOVERY-001 §F (ai-planner EditorStatusFooter, Vestara tokens).
 */

interface EditorStatusFooterProps {
  readonly filePath: string;
  readonly hasUnsavedChanges: boolean;
  readonly line: number;
  readonly column: number;
  readonly language?: string;
  readonly sizeBytes?: number;
}

export function EditorStatusFooter({
  filePath,
  hasUnsavedChanges,
  line,
  column,
  language,
  sizeBytes,
}: EditorStatusFooterProps) {
  const sizeLabel =
    sizeBytes === undefined
      ? null
      : sizeBytes < 1024
        ? `${sizeBytes} B`
        : `${(sizeBytes / 1024).toFixed(1)} KB`;
  return (
    <div
      className="flex items-center gap-3 border-t border-[var(--vestara-border-subtle)] bg-[var(--files-editor-toolbar-bg)] px-3 py-1 text-xs text-[var(--vestara-text-muted)]"
      role="status"
      aria-label="Editor status"
    >
      <span className="max-w-56 truncate font-mono" title={filePath}>
        {filePath}
      </span>
      {language && <span className="shrink-0">{language}</span>}
      {sizeLabel && (
        <span className="shrink-0 tabular-nums" aria-label={`File size ${sizeLabel}`}>
          {sizeLabel}
        </span>
      )}
      <span className="flex-1" />
      {hasUnsavedChanges && (
        <span className="shrink-0 text-[var(--vestara-status-warning)]" aria-live="polite">
          ● Unsaved
        </span>
      )}
      <span className="shrink-0 tabular-nums" aria-label={`Cursor at line ${line}, column ${column}`}>
        Ln {line}, Col {column}
      </span>
    </div>
  );
}
