/**
 * VESTARA-INTELLIGENCE GA-UI-007: Full-Window Surface
 *
 * Transforms the floating bubble into a full-window workspace with:
 * - Expanded mode: full-window surface with persistent sidebar rail
 * - Sidebar shows conversation history as a permanent rail
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
import { ConversationHistory, type ActiveTurnState } from './ConversationHistory';
import { resolveDisplayTitle } from './conversationTitles';

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

// ─── Sidebar Header Component ──────────────────────────────────

function SidebarHeader({
  workspaceName,
  onNewConversation,
  onCollapse,
}: {
  workspaceName: string;
  onNewConversation: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-(--vestara-border)">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-(--vestara-text-1)">
          Vestara Assistant
        </span>
        <span className="text-[10px] text-(--vestara-text-muted) bg-(--vestara-surface-secondary) px-1.5 py-0.5 rounded">
          {workspaceName}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="New conversation"
          className="p-1.5 rounded hover:bg-(--vestara-surface-hover) text-(--vestara-text-muted) cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
          title="New conversation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse to floating panel"
          className="p-1.5 rounded hover:bg-(--vestara-surface-hover) text-(--vestara-text-muted) cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
          title="Collapse to floating panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Files Summary Card Component ──────────────────────────────

function FilesSummaryCard({ files }: { files: string[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mx-4 mb-3 p-3 bg-(--vestara-surface-secondary) rounded-lg border border-(--vestara-border)">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-(--vestara-accent-text)" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-xs font-medium text-(--vestara-text-1)">
          Files Modified ({files.length})
        </span>
      </div>
      <div className="space-y-1">
        {files.slice(0, 5).map((file) => (
          <div key={file} className="flex items-center gap-2 text-[11px] text-(--vestara-text-muted)">
            <span className="w-1.5 h-1.5 rounded-full bg-(--vestara-accent-text)" />
            <span className="truncate">{file}</span>
            <button
              type="button"
              className="ml-auto text-(--vestara-accent-text) hover:underline cursor-pointer"
              title="Open in editor"
            >
              Open
            </button>
          </div>
        ))}
        {files.length > 5 && (
          <div className="text-[11px] text-(--vestara-text-muted)">
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

  // Build HistoryItemData[] from conversation summaries
  const historyItems = useMemo(() => {
    return (assistant.conversations ?? []).map((c) => ({
      id: c.id,
      displayTitle: resolveDisplayTitle(
        c.title,
        c.id === assistant.selectedId
          ? (assistant.messages.find((m) => m.role === 'user')?.content ?? null)
          : null,
      ),
      updatedAt: c.updatedAt,
    }));
  }, [assistant.conversations, assistant.selectedId, assistant.messages]);

  const isStreaming = assistant.streamState === 'sending' || assistant.streamState === 'streaming';
  const activeTurnState: ActiveTurnState = isStreaming
    ? 'generating'
    : assistant.streamState === 'failed'
      ? 'failed'
      : 'idle';

  if (!expanded) return null;

  return (
    <div className="fixed inset-0 z-[95] flex bg-(--vestara-bg)">
      {/* Sidebar rail */}
      <div className="w-72 flex flex-col border-r border-(--vestara-border) bg-(--vestara-surface)">
        <SidebarHeader
          workspaceName={surface.workspace.name}
          onNewConversation={handleNewConversation}
          onCollapse={onToggleExpanded}
        />

        {/* Conversation history as persistent rail */}
        <div className="flex-1 overflow-hidden">
          <ConversationHistory
            variant="rail"
            items={historyItems}
            selectedId={assistant.selectedId}
            activeState={activeTurnState}
            onSelect={assistant.selectConversation}
            onNewConversation={handleNewConversation}
            onClose={() => {}}
            anchorRef={{ current: null }}
          />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-(--vestara-border) bg-(--vestara-surface)">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-(--vestara-text-1)">
              {assistant.selectedConversation?.title ?? 'New Conversation'}
            </span>
            <span className="text-[10px] text-(--vestara-text-muted)">
              · {surface.surface.title ?? 'Workspace'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onMinimize}
              className="p-1.5 rounded hover:bg-(--vestara-surface-hover) text-(--vestara-text-muted) cursor-pointer"
              title="Minimize"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-(--vestara-surface-hover) text-(--vestara-text-muted) cursor-pointer"
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

        {/* Conversation panel (full-width) */}
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
