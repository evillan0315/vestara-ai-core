/**
 * FILES-EDITOR-001 F-E-2: Multi-tab header for the Files preview pane.
 *
 * Tablist with dirty-dot indicators, per-tab close, close-all, and arrow-key
 * navigation. Presentation only — tab state lives in useEditorTabs.
 *
 * Architecture Traceability:
 *   IDE-RECOVERY-001 §F (ai-planner MultiTabHeader, Vestara tokens + a11y).
 */

import { useCallback, useRef } from 'react';
import type { EditorTab } from '../hooks/useEditorTabs';

interface MultiTabHeaderProps {
  readonly tabs: readonly EditorTab[];
  readonly activePath: string | null;
  readonly isDirty: (path: string) => boolean;
  onSelect: (path: string) => void;
  /** Return false to veto the close (e.g. unsaved-changes confirm). */
  onCloseRequest: (path: string) => void;
  onCloseAllRequest: () => void;
}

export function MultiTabHeader({ tabs, activePath, isDirty, onSelect, onCloseRequest, onCloseAllRequest }: MultiTabHeaderProps) {
  const tabRefs = useRef<Readonly<Record<string, HTMLButtonElement | null>>>({});

  const focusTab = useCallback(
    (path: string) => {
      tabRefs.current[path]?.focus();
      onSelect(path);
    },
    [onSelect],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, path: string) => {
      const idx = tabs.findIndex((t) => t.path === path);
      if (idx < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        focusTab(next.path);
      } else if (e.key === 'Home') {
        e.preventDefault();
        focusTab(tabs[0].path);
      } else if (e.key === 'End') {
        e.preventDefault();
        focusTab(tabs[tabs.length - 1].path);
      }
    },
    [tabs, focusTab],
  );

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--vestara-border-subtle)] bg-[var(--files-editor-toolbar-bg)] px-2 py-1">
      <div role="tablist" aria-label="Open files" className="flex min-w-0 flex-1 items-center gap-1">
        {tabs.map((tab) => {
          const dirty = isDirty(tab.path);
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              role="presentation"
              className={`flex shrink-0 items-center gap-1.5 rounded-[var(--vestara-radius)] border px-2 py-1 text-xs ${
                active
                  ? 'border-[var(--vestara-border-focus)] bg-[var(--files-selected-bg)] text-[var(--vestara-text-primary)]'
                  : 'border-transparent text-[var(--vestara-text-muted)] hover:border-[var(--vestara-border-subtle)] hover:text-[var(--vestara-text-secondary)]'
              }`}
            >
              <button
                ref={(el) => {
                  tabRefs.current = { ...tabRefs.current, [tab.path]: el };
                }}
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.path}
                onClick={() => onSelect(tab.path)}
                onKeyDown={(e) => onKeyDown(e, tab.path)}
                className="flex min-w-0 items-center gap-1.5 outline-none"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    dirty ? 'bg-[var(--vestara-status-warning)]' : 'bg-transparent'
                  }`}
                  title={dirty ? 'Unsaved changes' : undefined}
                />
                <span className="max-w-40 truncate font-mono">{tab.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onCloseRequest(tab.path)}
                aria-label={`Close ${tab.name}${dirty ? ' (has unsaved changes)' : ''}`}
                title={`Close ${tab.name}`}
                className="shrink-0 rounded-sm px-1 text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      {tabs.length > 1 && (
        <button
          type="button"
          onClick={onCloseAllRequest}
          aria-label="Close all tabs"
          title="Close all tabs"
          className="shrink-0 rounded-[var(--vestara-radius)] px-2 py-1 text-xs text-[var(--vestara-text-muted)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
        >
          Close all
        </button>
      )}
    </div>
  );
}
