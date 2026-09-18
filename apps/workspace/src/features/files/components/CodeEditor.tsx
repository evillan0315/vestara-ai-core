/**
 * Reusable Code Editor Component
 *
 * View/read-only mode + edit mode with syntax highlighting via highlight.js.
 * Dirty-state awareness, explicit save, keyboard accessibility, large-file safety.
 * Saves via the authoritative /api/files/write endpoint (filesystem-runtime).
 *
 * Architecture Traceability:
 *   FILES-ASSETS-001: Assets, Media Preview & Reusable Code Viewer/Editor
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { Button, Card, CardContent, Pill, EmptyState } from '@vestara/ui';
import { getHighlightLanguage, type FileClassification } from '../file-classification';

interface CodeEditorProps {
  /** File path (workspace-relative) */
  filePath: string;
  /** Initial content */
  content: string;
  /** File classification for language detection */
  classification: FileClassification;
  /** Read-only mode (no edit/save) */
  readOnly?: boolean;
  /** Called when content is saved successfully */
  onSave?: (newContent: string) => void;
  /** Called when dirty state changes */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called with the live draft text (F-E-2 per-tab draft isolation). */
  onDraftChange?: (draft: string) => void;
  /** Called with 1-based cursor line/column in edit mode (F-E-3 status footer). */
  onCursorChange?: (line: number, column: number) => void;
  /** Maximum file size for editing (bytes) */
  maxEditSize?: number;
}

const MAX_EDIT_SIZE_DEFAULT = 2 * 1024 * 1024; // 2 MB
/** Warning tier: files above this size edit slowly (F-E-3, below the hard cap). */
const LARGE_FILE_WARN_SIZE = 512 * 1024; // 512 KB

export function CodeEditor({
  filePath,
  content: initialContent,
  classification,
  readOnly = false,
  onSave,
  onDirtyChange,
  onDraftChange,
  onCursorChange,
  maxEditSize = MAX_EDIT_SIZE_DEFAULT,
}: CodeEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightedRef = useRef<HTMLPreElement>(null);
  const originalContentRef = useRef(initialContent);

  // Update content when initialContent changes (e.g., file switched)
  useEffect(() => {
    if (!isDirty) {
      setContent(initialContent);
      originalContentRef.current = initialContent;
      setIsDirty(false);
      onDirtyChange?.(false);
    }
  }, [initialContent, isDirty, onDirtyChange]);

  // Track dirty state + lift the live draft for per-tab isolation (F-E-2)
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    const dirty = content !== originalContentRef.current;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
    onDraftChangeRef.current?.(content);
  }, [content, onDirtyChange]);

  // Apply syntax highlighting in view mode
  useEffect(() => {
    if (!isEditing && highlightedRef.current) {
      const lang = getHighlightLanguage(classification.languageHint);
      const codeEl = highlightedRef.current.querySelector('code');
      if (codeEl && lang && hljs.getLanguage(lang)) {
        hljs.highlightElement(codeEl);
      }
    }
  }, [isEditing, content, classification.languageHint]);

  const handleEdit = useCallback(() => {
    if (!readOnly) {
      setIsEditing(true);
      // Focus textarea on next tick
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [readOnly]);

  const handleSave = useCallback(async () => {
    if (isSaving || readOnly) return;

    const contentSize = new Blob([content]).size;
    if (contentSize > maxEditSize) {
      setError(`File size (${contentSize} bytes) exceeds edit limit (${maxEditSize} bytes)`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Save failed: ${res.status}`);
      }

      originalContentRef.current = content;
      setIsDirty(false);
      setIsEditing(false);
      setLastSaved(new Date().toISOString());
      onSave?.(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [content, filePath, isSaving, maxEditSize, onSave, readOnly]);

  const handleCancel = useCallback(() => {
    setContent(originalContentRef.current);
    setIsEditing(false);
    setIsDirty(false);
    setError(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isEditing && !readOnly) handleSave();
      }
      // Escape to cancel
      if (e.key === 'Escape' && isEditing) {
        e.preventDefault();
        handleCancel();
      }
      // Tab handling for indentation
      if (e.key === 'Tab' && isEditing) {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newContent = content.substring(0, start) + '  ' + content.substring(end);
        setContent(newContent);
        // Restore cursor position after state update
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    },
    [content, handleSave, handleCancel, isEditing, readOnly],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

  const reportCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const upToCursor = ta.value.slice(0, pos);
    const line = upToCursor.split('\n').length;
    const column = pos - (upToCursor.lastIndexOf('\n') + 1) + 1;
    onCursorChange?.(line, column);
  }, [onCursorChange]);

  const size = new Blob([content]).size;
  const sizeKB = (size / 1024).toFixed(1);
  const isLarge = size > maxEditSize;
  const isHefty = !isLarge && size > LARGE_FILE_WARN_SIZE;

  const language = classification.languageHint || 'plaintext';

  return (
    <Card className="code-editor min-w-0">
      <CardContent className="p-0">
        {/* Toolbar */}
        <div
          className="code-editor-toolbar flex items-center gap-2 px-3 py-2 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)]"
          role="toolbar"
          aria-label="Code editor actions"
        >
          <span className="font-mono text-xs text-[var(--vestara-text-muted)] truncate max-w-[200px]" title={filePath}>
            {filePath}
          </span>
          <span className="mpg-tag-pill text-[var(--vestara-text-secondary)]">{language}</span>
          <span className="flex-1" />
          <span className="text-xs text-[var(--vestara-text-muted)] tabular-nums">
            {sizeKB} KB
            {isLarge && <span className="ml-1 text-[var(--vestara-status-warning)]">⚠ Too large to edit</span>}
            {isHefty && (
              <span className="ml-1 text-[var(--vestara-status-warning)]" title="Large file: editing may be slow">
                ⚠ Large file
              </span>
            )}
          </span>
          {lastSaved && (
            <span className="text-xs text-[var(--vestara-text-muted)]" title={`Last saved: ${lastSaved}`}>
              Saved {new Date(lastSaved).toLocaleTimeString()}
            </span>
          )}
          {isDirty && !readOnly && (
            <span className="text-xs text-[var(--vestara-status-warning)]" aria-live="polite">
              ● Unsaved
            </span>
          )}
          {error && (
            <span className="text-xs text-[var(--vestara-status-error)]" role="alert">
              {error}
            </span>
          )}
          {!readOnly && !isEditing && !isLarge && (
            <Button variant="ghost" size="sm" onClick={handleEdit} aria-label="Edit file">
              Edit
            </Button>
          )}
          {isEditing && !readOnly && (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel} aria-label="Cancel editing">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                aria-label="Save file"
                aria-busy={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
          {readOnly && (
            <Pill className="text-xs">
              Read-only
            </Pill>
          )}
        </div>

        {/* View Mode - Syntax Highlighted */}
        {!isEditing && (
          <div className="code-editor-view p-4 overflow-auto max-h-[60vh]">
            <pre ref={highlightedRef} className="m-0">
              <code
                className={`language-${getHighlightLanguage(classification.languageHint) || 'plaintext'}`}
                data-language={language}
              >
                {content}
              </code>
            </pre>
          </div>
        )}

        {/* Edit Mode - Textarea */}
        {isEditing && (
          <div className="code-editor-edit p-0">
            {isHefty && (
              <div
                className="border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-status-warning-bg)] px-4 py-1.5 text-xs text-[var(--vestara-status-warning)]"
                role="note"
              >
                Large file ({sizeKB} KB) — editing may be slow. Save early, save often.
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onKeyUp={reportCursor}
              onClick={reportCursor}
              onSelect={reportCursor}
              className="code-editor-textarea w-full min-h-[40vh] max-h-[60vh] p-4 font-mono text-[var(--vestara-code-font-size)] bg-[var(--vestara-surface-panel)] border-none outline-none resize-none text-[var(--vestara-text-primary)]"
              placeholder="File is empty"
              spellCheck={false}
              aria-label={`Editing ${filePath}`}
              readOnly={readOnly || isLarge}
            />
            {isLarge && (
              <div className="p-4 text-center text-[var(--vestara-status-warning)] bg-[var(--vestara-status-warning-bg)] border-t border-[var(--vestara-border-subtle)]">
                File exceeds maximum edit size ({maxEditSize / 1024 / 1024} MB). Editing disabled.
              </div>
            )}
          </div>
        )}

        {content === '' && !isEditing && (
          <EmptyState
            title="Empty file"
            description="Switch to edit mode to add content."
            className="h-[300px]"
          />
        )}
      </CardContent>
    </Card>
  );
}

/** View-only code display component (no editing) */
export function CodeViewer({
  filePath,
  content,
  classification,
}: Pick<CodeEditorProps, 'filePath' | 'content' | 'classification'>) {
  const highlightedRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (highlightedRef.current) {
      const lang = getHighlightLanguage(classification.languageHint);
      const codeEl = highlightedRef.current.querySelector('code');
      if (codeEl && lang && hljs.getLanguage(lang)) {
        hljs.highlightElement(codeEl);
      }
    }
  }, [content, classification.languageHint]);

  return (
    <Card className="code-viewer min-w-0">
      <CardContent className="p-3 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-interactive)]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--vestara-text-muted)] truncate max-w-[200px]" title={filePath}>
            {filePath}
          </span>
          <span className="mpg-tag-pill text-[var(--vestara-text-secondary)]">{classification.languageHint || 'plaintext'}</span>
          <span className="flex-1" />
          <span className="text-xs text-[var(--vestara-text-muted)] tabular-nums">
            {(new Blob([content]).size / 1024).toFixed(1)} KB
          </span>
        </div>
      </CardContent>
      <CardContent className="p-4 overflow-auto max-h-[60vh]">
        <pre ref={highlightedRef} className="m-0">
          <code className={`language-${getHighlightLanguage(classification.languageHint) || 'plaintext'}`}>{content}</code>
        </pre>
      </CardContent>
    </Card>
  );
}