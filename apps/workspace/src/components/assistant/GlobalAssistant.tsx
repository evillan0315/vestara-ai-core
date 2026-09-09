/**
 * VESTARA-INTELLIGENCE GA-1: GlobalAssistant
 *
 * Persistent floating assistant shell mounted in ShellLayout.
 * Presentation/composition only — no conversation, context-intelligence,
 * provider/model, execution, governance, or Activity Room authority.
 *
 * Consumes:
 *   - useAssistantConversation (GA-2) — conversation state
 *   - useSurfaceContext (GA-3) — display-only surface metadata
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistantConversation } from '../../hooks/useAssistantConversation';
import { useSurfaceContext } from '../../contexts/SurfaceContext';
import { openCodeApi, type OpenCodeSessionView } from '../../lib/opencode';
import { resolveDisplayTitle } from './conversationTitles';
import { FloatingPanel } from './FloatingPanel';
import { ConversationPanel } from './ConversationPanel';
import { LauncherDock, type LauncherDockItem } from './LauncherDock';

// ─── Dock timing ──────────────────────────────────────────────

/** Hover intent delay before the dock reveals. */
const DOCK_OPEN_DELAY_MS = 250;
/** Grace period after the pointer leaves before the dock closes. */
const DOCK_CLOSE_GRACE_MS = 150;

// ─── Launcher ─────────────────────────────────────────────────

function AssistantLauncher({
  onClick,
  panelOpen,
  launcherRef,
  onMouseEnter,
  onMouseLeave,
  onFocus,
}: {
  onClick: () => void;
  panelOpen: boolean;
  launcherRef: React.RefObject<HTMLButtonElement | null>;
  /** GA-UI-008: hover bridge for the recent-conversations dock. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** GA-UI-008 acceptance: keyboard focus bridge for the dock. */
  onFocus?: () => void;
}) {
  return (
    <button
      ref={launcherRef}
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      aria-label={panelOpen ? 'Close assistant' : 'Open assistant'}
      aria-expanded={panelOpen}
      title={panelOpen ? 'Close Vestara Assistant' : 'Ask Vestara (Ctrl+J)'}
      className="group fixed bottom-6 right-6 z-[90] flex h-12 w-12 items-center justify-center rounded-full bg-(--vestara-surface) text-(--vestara-accent) shadow-[0_10px_36px_-8px_var(--vestara-accent-bg),0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-(--vestara-accent-border) transition-all duration-200 hover:shadow-[0_12px_44px_-8px_var(--vestara-accent-border-hover),0_0_16px_var(--vestara-accent-bg)] hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
    >
      {/* Soft halo glow */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1.5 rounded-full bg-(--vestara-accent-bg) blur-lg transition-opacity duration-300 group-hover:shadow-[0_0_24px_var(--vestara-accent-bg)]"
      />
      {/* Icon swaps with panel state */}
      <span className="relative flex items-center justify-center">
        {panelOpen ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </span>
      {/* Online presence dot */}
      {!panelOpen && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-950"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </span>
      )}
      {/* Hover tooltip */}
      {!panelOpen && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-14 right-0 hidden whitespace-nowrap rounded-xl border border-zinc-700/60 bg-zinc-900/95 px-3 py-1.5 text-[11px] font-medium text-zinc-200 shadow-xl backdrop-blur group-hover:block"
        >
          Ask Vestara
          <span className="ml-1.5 rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">Ctrl J</span>
        </span>
      )}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────

export function GlobalAssistant() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const focusOnMountRef = useRef<HTMLElement | null>(null);
  const dockOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GA-2: conversation state (eager — list fetches on mount)
  const assistant = useAssistantConversation();

  // GA-3: surface context (display-only)
  const surface = useSurfaceContext();

  // GA-SESSION-003: compatible runtime sessions for resume surface.
  // Fetched when the panel opens; projected through to LauncherDock and
  // ConversationPanel. No pending React-ref authority — server validates.
  const [runtimeSessions, setRuntimeSessions] = useState<OpenCodeSessionView[]>([]);

  // GA-UI-008: dock timers — cleared on unmount to avoid stray setState.
  useEffect(() => {
    return () => {
      if (dockOpenTimerRef.current) clearTimeout(dockOpenTimerRef.current);
      if (dockCloseTimerRef.current) clearTimeout(dockCloseTimerRef.current);
    };
  }, []);

  // GA-SESSION-003: fetch compatible runtime sessions when the panel opens.
  // Re-fetches on each open to keep the resume surface current.
  useEffect(() => {
    if (!panelOpen) return;
    let cancelled = false;
    openCodeApi.compatibleSessions().then((sessions) => {
      if (!cancelled) setRuntimeSessions(sessions);
    }).catch(() => {
      if (!cancelled) setRuntimeSessions([]);
    });
    return () => { cancelled = true; };
  }, [panelOpen]);

  // GA-SESSION-003: handler for runtime session resume.
  const handleResumeSession = useCallback(async (sessionId: string) => {
    const convId = await assistant.resumeOpenCodeSession(sessionId);
    if (convId) {
      setPanelOpen(true);
      setPanelMinimized(false);
      setPanelExpanded(false);
    }
  }, [assistant.resumeOpenCodeSession]);

  const openDockSoon = useCallback(() => {
    if (dockCloseTimerRef.current) clearTimeout(dockCloseTimerRef.current);
    if (dockOpenTimerRef.current) return;
    dockOpenTimerRef.current = setTimeout(() => {
      dockOpenTimerRef.current = null;
      setDockOpen(true);
    }, DOCK_OPEN_DELAY_MS);
  }, []);

  const closeDockSoon = useCallback(() => {
    if (dockOpenTimerRef.current) clearTimeout(dockOpenTimerRef.current);
    dockOpenTimerRef.current = null;
    if (dockCloseTimerRef.current) clearTimeout(dockCloseTimerRef.current);
    dockCloseTimerRef.current = setTimeout(() => {
      dockCloseTimerRef.current = null;
      setDockOpen(false);
    }, DOCK_CLOSE_GRACE_MS);
  }, []);

  const closeDockNow = useCallback(() => {
    if (dockOpenTimerRef.current) clearTimeout(dockOpenTimerRef.current);
    if (dockCloseTimerRef.current) clearTimeout(dockCloseTimerRef.current);
    dockOpenTimerRef.current = null;
    dockCloseTimerRef.current = null;
    setDockOpen(false);
  }, []);

  // GA-UI-008 acceptance: programmatic focus-return after closing/minimizing
  // the panel must not auto-reveal the dock. The suppress flag is consumed by
  // the next focus event, or self-clears via the trailing timeout when the
  // launcher was already focused and no focus event fires.
  const suppressDockRevealOnFocusRef = useRef(false);

  const returnFocusToLauncher = useCallback(() => {
    suppressDockRevealOnFocusRef.current = true;
    setTimeout(() => {
      launcherRef.current?.focus();
      setTimeout(() => {
        suppressDockRevealOnFocusRef.current = false;
      }, 0);
    }, 0);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => {
      if (prev) {
        // Closing: focus returns to launcher
        returnFocusToLauncher();
      }
      return !prev;
    });
    setPanelMinimized(false);
    setPanelExpanded(false);
    // Opening or closing the panel cancels any pending dock reveal — a stale
    // timer must never reopen the dock behind the panel or after it closes.
    closeDockNow();
  }, [closeDockNow, returnFocusToLauncher]);

  const minimizePanel = useCallback(() => {
    setPanelMinimized(true);
    returnFocusToLauncher();
  }, [returnFocusToLauncher]);

  // GA-UI-008 acceptance: the dock is not pointer-only — focusing the
  // launcher reveals it (same intent delay as hover). Focus events caused by
  // programmatic focus-return are suppressed above.
  const revealDockFromFocus = useCallback(() => {
    if (suppressDockRevealOnFocusRef.current) {
      suppressDockRevealOnFocusRef.current = false;
      return;
    }
    openDockSoon();
  }, [openDockSoon]);

  // Premium UX: Ctrl/⌘+J toggles the assistant from anywhere. Ignored while
  // typing in inputs so composer shortcuts keep working. Escape closes the
  // dock first (only while it is visible — never intercepts panel Escape).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        const target = e.target as HTMLElement | null;
        const typing =
          target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
        if (typing) return;
        e.preventDefault();
        togglePanel();
        return;
      }
      if (e.key === 'Escape' && dockOpen && !panelOpen) {
        e.preventDefault();
        closeDockNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel, dockOpen, panelOpen, closeDockNow]);

  // GA-UI-007: toggle full-window expanded geometry (keeps the conversation
  // state; navigation ≠ new conversation).
  const toggleExpanded = useCallback(() => {
    setPanelExpanded((prev) => !prev);
  }, []);

  // GA-UI-006: explicit new conversation. Creates AND selects a fresh
  // Conversation Runtime conversation; the previous conversation is never
  // mutated, and its OpenCode runtime session is never reused (one
  // conversation → one session, server-side). Empty surface + composer
  // focus are handled by ConversationPanel on selection change.
  const newConversation = useCallback(() => {
    void assistant.createConversation();
  }, [assistant.createConversation]);

  // GA-UI-008: dock selection opens the assistant on the chosen conversation.
  // GET-only canonical selection (same contract as in-panel history) — no
  // POST, no new turn. Selecting the active conversation just opens the panel.
  const handleDockSelect = useCallback(
    (id: string) => {
      closeDockNow();
      setPanelOpen(true);
      setPanelMinimized(false);
      setPanelExpanded(false);
      if (id !== assistant.selectedId) {
        assistant.selectConversation(id);
      }
    },
    [assistant.selectedId, assistant.selectConversation, closeDockNow],
  );

  const dockItems: LauncherDockItem[] = (assistant.conversations ?? []).map((c) => ({
    id: c.id,
    title: resolveDisplayTitle(
      c.title,
      // GA-UI-008 acceptance: match the in-panel history title resolution —
      // the active conversation resolves through its first human message.
      c.id === assistant.selectedId
        ? (assistant.messages.find((m) => m.role === 'user')?.content ?? null)
        : null,
    ),
    updatedAt: c.updatedAt,
  }));

  return (
    <>
      <AssistantLauncher
        launcherRef={launcherRef}
        onClick={togglePanel}
        panelOpen={panelOpen && !panelMinimized}
        onMouseEnter={openDockSoon}
        onMouseLeave={closeDockSoon}
        onFocus={revealDockFromFocus}
      />

      <LauncherDock
        open={dockOpen && !panelOpen}
        items={dockItems}
        selectedId={assistant.selectedId}
        onSelect={handleDockSelect}
        onMouseEnter={openDockSoon}
        onMouseLeave={closeDockSoon}
        runtimeSessions={runtimeSessions}
        onResumeSession={handleResumeSession}
      />

      <FloatingPanel
        open={panelOpen}
        minimized={panelMinimized}
        workspaceId={surface.workspace.id}
        onMinimize={minimizePanel}
        onClose={togglePanel}
        onNewConversation={newConversation}
        expanded={panelExpanded}
        onToggleExpanded={toggleExpanded}
        launcherRef={launcherRef}
        focusOnMountRef={focusOnMountRef}
      >
        <ConversationPanel
          assistant={assistant}
          focusOnMountRef={focusOnMountRef}
          expanded={panelExpanded}
          runtimeSessions={runtimeSessions}
          onResumeSession={handleResumeSession}
        />
      </FloatingPanel>
    </>
  );
}

export default GlobalAssistant;
