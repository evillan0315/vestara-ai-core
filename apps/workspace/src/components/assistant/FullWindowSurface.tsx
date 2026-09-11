/**
 * VESTARA-INTELLIGENCE GA-UI-007: Full-Window Surface
 *
 * Transforms the floating bubble into a full-window workspace with:
 * - Expanded mode: full-window surface with persistent sidebar rail
 * - Sidebar shows conversation history as a permanent rail (rendered by ConversationPanel)
 * - Wider composer with full-width variant
 * - "Files modified" summary card (new primitive)
 * - "Open in editor" affordance on AssistantCodeEdit
 * - Same ConversationPanel internals, different geometry
 *
 * Architecture Traceability:
 *   GA-UI-007: Full-Window Surface (4 milestones)
 *   @see GA-UI-007-global-assistant-window-plan.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useCallback, useMemo } from 'react';
import { useSurfaceContext } from '../../contexts/SurfaceContext';
import type { UseAssistantConversationReturn } from '../../hooks/useAssistantConversation';
import { ConversationPanel } from './ConversationPanel';

// ─── Types ─────────────────────────────────────────────────────

export interface FullWindowSurfaceProps {
  /** Whether the full-window mode is active */
  expanded: boolean;

  /** Callback to toggle expanded mode */
  onToggleExpanded: () => void;

  /** Callback to minimize the panel */
  onMinimize: () => void;

  /** Callback to close the panel */
  onClose: () => void;

  /** Callback to create a new conversation */
  onNewConversation: () => void;

  /** Shared assistant state — must be the same instance used by GlobalAssistant */
  assistant: UseAssistantConversationReturn;
}

// ─── Files Summary Card Component ──────────────────────────────

function FilesSummaryCard({ files }: { files: string[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mx-4 mb-3 p-3 rounded-xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-xs font-medium text-zinc-300">
          Files Modified ({files.length})
        </span>
      </div>
      <div className="space-y-1">
        {files.slice(0, 5).map((file) => (
          <div key={file} className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="truncate">{file}</span>
            <button
              type="button"
              className="ml-auto text-amber-400 hover:underline cursor-pointer"
              title="Open in editor"
            >
              Open
            </button>
          </div>
        ))}
        {files.length > 5 && (
          <div className="text-[11px] text-zinc-600">
            +{files.length - 5} more files
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Full-Window Surface Component ────────────────────────

export function FullWindowSurface({
  expanded,
  onToggleExpanded,
  onMinimize,
  onClose,
  onNewConversation,
  assistant,
}: FullWindowSurfaceProps) {
  const surface = useSurfaceContext();

  // Handle new conversation
  const handleNewConversation = useCallback(() => {
    onNewConversation();
  }, [onNewConversation]);

  // Derive modified files from authoritative structured edit projections
  const modifiedFiles = useMemo(() => {
    return (assistant.structuredEdits ?? [])
      .filter(
        (entry): entry is typeof entry & { detail: { kind: 'edit'; file: string } } =>
          entry.detail.kind === 'edit' && entry.detail.state === 'completed',
      )
      .map((entry) => entry.detail.file);
  }, [assistant.structuredEdits]);

  if (!expanded) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex"
      style={{
        background: 'radial-gradient(ellipse at top, rgba(245,158,11,0.03), transparent 60%), #09090b',
      }}
    >
      {/* Main content area — ConversationPanel handles its own sidebar in expanded mode */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-[0_0_10px_rgba(245,158,11,0.4)]">
              <svg className="h-3 w-3 text-zinc-950" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-zinc-100">
              Vestara Assistant
            </span>
            <span className="text-[10px] text-zinc-500">
              · {assistant.selectedConversation?.title ?? 'New Conversation'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNewConversation}
              aria-label="New conversation"
              className="p-1.5 rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
              title="New conversation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize"
              className="p-1.5 rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
              title="Minimize"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Files summary */}
        <FilesSummaryCard files={modifiedFiles} />

        {/* Conversation panel (handles its own sidebar in expanded mode) */}
        <div className="flex-1 overflow-hidden">
          <ConversationPanel
            assistant={assistant}
            focusOnMountRef={{ current: null }}
            expanded={true}
          />
        </div>
      </div>
    </div>
  );
}
