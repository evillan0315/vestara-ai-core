/**
 * VESTARA-INTELLIGENCE GA-1 Slice 2: FloatingPanel
 *
 * Assistant-branded floating panel. Delegates all window mechanics
 * (drag, resize, geometry persistence, keyboard, escape, z-index)
 * to @vestara/ui FloatingWindow. This component owns only:
 *   - Branded header (logo, status, accent hairline)
 *   - Assistant-specific actions (new conversation, expand)
 *   - Content area (ConversationPanel)
 *
 * Focus contract:
 *   - Open: focus moves to compose input (via focusOnMount ref)
 *   - Escape/Minimize: focus returns to launcher button
 *   - No focus trap. Underlying Workspace remains interactive.
 *
 * Architecture Traceability:
 *   VES-UI-011: Floating Window System (shared primitive)
 *   GA-1: Global Assistant (assistant-specific composition)
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

import { FloatingWindow, FloatingWindowHeader, FloatingWindowContent } from '@vestara/ui';

// ─── Types ────────────────────────────────────────────────────

export interface FloatingPanelProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  /** GA-UI-006: explicit new-conversation action. Optional; button hidden when absent. */
  onNewConversation?: () => void;
  /** GA-UI-007: full-window expanded geometry. Optional; maximize button hidden when absent. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** M10: current conversation title displayed in the header. */
  conversationTitle?: string | null;
  /** Ref to focus when panel opens/restores. If null, no auto-focus. */
  focusOnMountRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────

export function FloatingPanel({
  open,
  workspaceId,
  onClose,
  onNewConversation,
  expanded = false,
  onToggleExpanded,
  conversationTitle,
  focusOnMountRef,
  children,
}: FloatingPanelProps) {
  if (expanded) return null;

  return (
    <FloatingWindow
      id={`assistant-${workspaceId}`}
      open={open}
      onClose={onClose}
      defaultWidth={400}
      defaultHeight={500}
      minWidth={320}
      minHeight={200}
      focusOnOpenRef={focusOnMountRef}
      escapeCloses
      className="border-(--vestara-accent-border) bg-(--vestara-surface)/95 ring-(--vestara-accent-border-hover)"
    >
      {/* Premium top accent hairline with gold gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-(--vestara-accent-border) to-transparent"
      />

      {/* Assistant-branded header */}
      <FloatingWindowHeader className="border-(--vestara-accent-border) bg-(--vestara-surface)/90">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-(--vestara-surface) shadow-[0_0_10px_var(--vestara-accent-bg)] ring-1 ring-(--vestara-accent-border)">
            <svg
              className="h-3.5 w-3.5 text-(--vestara-accent)"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-xs font-semibold tracking-tight text-zinc-100">
              Vestara Assistant
            </span>
            {conversationTitle ? (
              <span className="mt-0.5 truncate text-[10px] text-zinc-500 max-w-[180px]" title={conversationTitle}>
                {conversationTitle}
              </span>
            ) : (
              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                  aria-hidden="true"
                />
                Online · Ready to help
              </span>
            )}
          </div>
        </div>

        {/* M10: Assistant-specific actions (new, expand, minimize, close) */}
        <div className="flex items-center gap-0.5">
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              aria-label="New conversation"
              title="New conversation"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-accent) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--vestara-accent-border-active)"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          )}
          {onToggleExpanded && (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-label="Expand assistant"
              title="Expand"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-accent) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--vestara-accent-border-active)"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Minimize assistant"
            title="Minimize"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-accent) cursor-pointer focus-visible:outline-2 focus-visible:outline-(--vestara-accent-border-active)"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 12H6"
              />
            </svg>
          </button>
        </div>
      </FloatingWindowHeader>

      {/* Content area */}
      <FloatingWindowContent className="overflow-hidden">
        {children}
      </FloatingWindowContent>
    </FloatingWindow>
  );
}

export default FloatingPanel;
