/**
 * Reusable Code Editor Component
 *
 * Editable code/text surface with dirty-state awareness, explicit save,
 * keyboard accessibility, and large-file safety.
 * Saves via the authoritative /api/files/write endpoint (filesystem-runtime).
 *
 * Uses @monaco-editor/react for rich editing (syntax highlighting, IntelliSense, etc.)
 * while preserving the original toolbar, dirty tracking, and save semantics.
 *
 * Architecture Traceability:
 *   FILES-ASSETS-001: Assets, Media Preview & Reusable Code Viewer/Editor
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import { Button, Card, CardContent } from '@vestara/ui';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { getHighlightLanguage, type FileClassification } from '../file-classification';

type Monaco = Parameters<OnMount>[1];

interface CodeEditorProps {
  /** File path (workspace-relative) */
  filePath: string;
  /** Initial content */
  content: string;
  /** File classification for language detection */
  classification: FileClassification;
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
  /** Explicit editor theme; defaults to 'light'. */
  theme?: 'light' | 'dark';
}

const MAX_EDIT_SIZE_DEFAULT = 2 * 1024 * 1024; // 2 MB
/** Warning tier: files above this size edit slowly (F-E-3, below the hard cap). */
const LARGE_FILE_WARN_SIZE = 512 * 1024; // 512 KB

// Mapping application themes to Monaco Editor themes
const MONACO_THEME_MAP: Record<'light' | 'dark', string> = {
  light: 'vs-light',
  dark: 'vs-dark',
};

export function CodeEditor({
  filePath,
  content: initialContent,
  classification,
  onSave,
  onDirtyChange,
  onDraftChange,
  onCursorChange,
  maxEditSize = MAX_EDIT_SIZE_DEFAULT,
  theme = 'dark',
}: CodeEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const originalContentRef = useRef(initialContent);

  const monacoTheme = MONACO_THEME_MAP[theme] || 'vs-light';

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

  const handleSave = useCallback(async () => {
    if (isSaving) return;

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
      setLastSaved(new Date().toISOString());
      onSave?.(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [content, filePath, isSaving, maxEditSize, onSave]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleCancel = useCallback(() => {
    const restored = originalContentRef.current;
    setContent(restored);
    setIsDirty(false);
    setError(null);
    // Also reflect the revert inside Monaco
    if (editorRef.current) {
      editorRef.current.setValue(restored);
    }
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    setContent(value ?? '');
  }, []);

  // Monaco mount: register Ctrl/Cmd+S and cursor listener
  const handleEditorDidMount: OnMount = useCallback(
    (editorInstance, monaco: Monaco) => {
      editorRef.current = editorInstance;

      // Ctrl/Cmd+S -> save (prevents browser save dialog)
      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void handleSaveRef.current();
      });

      // Cursor position changes
      if (onCursorChange) {
        editorInstance.onDidChangeCursorPosition((e) => {
          onCursorChange(e.position.lineNumber, e.position.column);
        });
        const position = editorInstance.getPosition();
        if (position) {
          onCursorChange(position.lineNumber, position.column);
        }
      }
    },
    [onCursorChange],
  );

  const size = new Blob([content]).size;
  const sizeKB = (size / 1024).toFixed(1);
  const isLarge = size > maxEditSize;
  const isHefty = !isLarge && size > LARGE_FILE_WARN_SIZE;

  const language = getHighlightLanguage(classification.languageHint) || 'plaintext';

  return (
    <div className="code-editor h-full flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full  min-h-0 flex-1 flex-col p-0">
        {/* Toolbar */}
        <div
          className="code-editor-toolbar flex items-center gap-2 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-accent)]"
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
          {isDirty && (
            <span className="text-xs text-[var(--vestara-status-warning)]" aria-live="polite">
              ● Unsaved
            </span>
          )}
          {error && (
            <span className="text-xs text-[var(--vestara-status-error)]" role="alert">
              {error}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={!isDirty} aria-label="Revert changes">
            Revert
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty || isLarge}
            aria-label="Save file"
            aria-busy={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="code-editor-edit h-full flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          {isHefty && (
            <div
              className="border-b h-full border-[var(--vestara-border-subtle)] bg-[var(--vestara-status-warning-bg)] px-4 py-1.5 text-xs text-[var(--vestara-status-warning)]"
              role="note"
            >
              Large file ({sizeKB} KB) — editing may be slow. Save early, save often.
            </div>
          )}
          <div className="min-h-0 w-full flex-1 h-full overflow-hidden">
            <Editor
              height="100%"
              width="100%"
              language={language}
              theme={monacoTheme}
              value={content}
              onChange={handleChange}
              onMount={handleEditorDidMount}
              options={{
                readOnly: isLarge,
                wordWrap: 'on',
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                renderWhitespace: 'selection',
                scrollbar: {
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10,
                },
              }}
            />
          </div>
          {isLarge && (
            <div className="p-4 text-center text-[var(--vestara-status-warning)] bg-[var(--vestara-status-warning-bg)] border-t border-[var(--vestara-border-subtle)]">
              File exceeds maximum edit size ({maxEditSize / 1024 / 1024} MB). Editing disabled.
            </div>
          )}
        </div>
      </div>
    </div>
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
    <Card className="code-viewer flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
      <CardContent className="code-viewer-body min-h-0 flex-1 overflow-auto p-4">
        <pre ref={highlightedRef} className="m-0">
          <code className={`language-${getHighlightLanguage(classification.languageHint) || 'plaintext'}`}>{content}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
