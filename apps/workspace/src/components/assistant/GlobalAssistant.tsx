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
 * Architecture:
 *   FloatingWindowManager (VES-UI-011) coordinates z-index across windows.
 *   FloatingPanel delegates window mechanics to @vestara/ui FloatingWindow.
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingWindowManager } from '@vestara/ui';
import { Z_INDEX } from '@vestara/ui-tokens';
import { useAssistantConversation } from '../../hooks/useAssistantConversation';
import { useSurfaceContext } from '../../contexts/SurfaceContext';
import {
  OPEN_ASSISTANT_EVENT,
  parseOpenAssistantDetail,
} from '../../lib/assistant-navigation';
import { openCodeApi, type OpenCodeSessionView } from '../../lib/opencode';
import { preloadMarkdownRenderer } from '../chat/MarkdownRenderer';
import { resolveDisplayTitle } from './conversationTitles';
import { FloatingPanel } from './FloatingPanel';
import { FullWindowSurface } from './FullWindowSurface';
import { ConversationPanel } from './ConversationPanel';
import { LauncherDock, type LauncherDockItem } from './LauncherDock';

// ─── Dock timing ──────────────────────────────────────────────

/** Hover intent delay before the dock reveals. */
const DOCK_OPEN_DELAY_MS = 250;
/** Grace period after the pointer leaves before the dock closes. */
const DOCK_CLOSE_GRACE_MS = 150;

// ─── Launcher ─────────────────────────────────────────────────

/** Launcher orb size (h-12 w-12) used for viewport clamping. */
const LAUNCHER_SIZE_PX = 48;
/** Default docked offset (bottom-6 right-6). */
const LAUNCHER_DOCK_MARGIN_PX = 24;
/** Pointer travel before a press becomes a drag (click still toggles). */
const LAUNCHER_DRAG_THRESHOLD_PX = 4;
/** Persisted launcher position. */
const LAUNCHER_POSITION_KEY = 'vestara-assistant-launcher-pos';

interface LauncherPosition {
  x: number;
  y: number;
}

function clampLauncherPosition(position: LauncherPosition): LauncherPosition {
  const maxX = Math.max(8, window.innerWidth - LAUNCHER_SIZE_PX - 8);
  const maxY = Math.max(8, window.innerHeight - LAUNCHER_SIZE_PX - 8);
  return {
    x: Math.min(Math.max(position.x, 8), maxX),
    y: Math.min(Math.max(position.y, 8), maxY),
  };
}

function defaultLauncherPosition(): LauncherPosition {
  return {
    x: window.innerWidth - LAUNCHER_DOCK_MARGIN_PX - LAUNCHER_SIZE_PX,
    y: window.innerHeight - LAUNCHER_DOCK_MARGIN_PX - LAUNCHER_SIZE_PX,
  };
}

function loadLauncherPosition(): LauncherPosition | null {
  try {
    const raw = localStorage.getItem(LAUNCHER_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LauncherPosition>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return clampLauncherPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return null;
  }
}

function persistLauncherPosition(position: LauncherPosition): void {
  try {
    localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Private mode / denied storage: the launcher simply re-docks next load.
  }
}

function AssistantLauncher({
  onClick,
  panelOpen,
  launcherRef,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: {
  onClick: () => void;
  panelOpen: boolean;
  launcherRef: React.RefObject<HTMLButtonElement | null>;
  /** GA-UI-008: hover bridge for the recent-conversations dock. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** GA-UI-008 acceptance: keyboard focus bridge for the dock. */
  onFocus?: () => void;
  /** True while a drag repositions the launcher. */
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={launcherRef}
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      aria-label={panelOpen ? 'Close assistant' : 'Open assistant'}
      aria-expanded={panelOpen}
      title={`${panelOpen ? 'Close Vestara Assistant' : 'Ask Vestara (Ctrl+J)'} · Drag to move, arrow keys nudge`}
      className={`group flex h-12 w-12 touch-none select-none items-center justify-center rounded-full bg-(--vestara-surface) text-(--vestara-accent) shadow-[0_10px_36px_-8px_var(--vestara-accent-bg),0_2px_8px_rgba(0,0,0,0.6)] ring-1 ring-(--vestara-accent-border) transition-all duration-200 hover:shadow-[0_12px_44px_-8px_var(--vestara-accent-border-hover),0_0_16px_var(--vestara-accent-bg)] hover:scale-105 hover:brightness-110 active:scale-95 ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      style={{ zIndex: Number(Z_INDEX.sticky) }}
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
          className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-(--vestara-surface)"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-(--vestara-status-success) ring-2 ring-(--vestara-surface) shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </span>
      )}
      {/* Hover tooltip */}
      {!panelOpen && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-14 right-0 hidden whitespace-nowrap rounded-xl border border-(--vestara-accent-border) bg-(--vestara-surface) px-3 py-1.5 text-[11px] font-medium text-(--vestara-text) shadow-xl backdrop-blur group-hover:block"
        >
          Ask Vestara
          <span className="ml-1.5 rounded-md bg-(--vestara-surface-interactive) px-1.5 py-0.5 font-mono text-[10px] text-(--vestara-text-muted)">Ctrl J</span>
        </span>
      )}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────

export function GlobalAssistant() {
  const [panelOpen, setPanelOpen] = useState(false);
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
  const [runtimeSessions, setRuntimeSessions] = useState<OpenCodeSessionView[]>([]);

  // GA-UI-008: dock timers — cleared on unmount to avoid stray setState.
  useEffect(() => {
    return () => {
      if (dockOpenTimerRef.current) clearTimeout(dockOpenTimerRef.current);
      if (dockCloseTimerRef.current) clearTimeout(dockCloseTimerRef.current);
    };
  }, []);

  // GA-SESSION-003: fetch compatible runtime sessions when the panel opens.
  useEffect(() => {
    if (!panelOpen) return;
    // VES-PERF-002 (P1): warm the lazy markdown chunk on assistant intent so
    // the first message renders formatted rather than flashing the fallback.
    preloadMarkdownRenderer();
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

  // Movable launcher: persisted viewport position, pointer drag with
  // click-vs-drag disambiguation, arrow-key nudge for keyboard users.
  const [launcherPos, setLauncherPos] = useState<LauncherPosition | null>(() => loadLauncherPosition());
  const [launcherDragging, setLauncherDragging] = useState(false);
  const launcherDragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    movedX: number;
    movedY: number;
    dragged: boolean;
  } | null>(null);
  const suppressLauncherClickRef = useRef(false);

  // Keep a custom position on screen across viewport resizes.
  useEffect(() => {
    const onResize = () => {
      setLauncherPos((current) => (current ? clampLauncherPosition(current) : current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleLauncherPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const base = launcherPos ?? defaultLauncherPosition();
      launcherDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: base.x,
        baseY: base.y,
        movedX: 0,
        movedY: 0,
        dragged: false,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture unsupported: drag still tracks via move/up on the button.
      }
    },
    [launcherPos],
  );

  const handleLauncherPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = launcherDragRef.current;
      if (!drag) return;
      const movedX = event.clientX - drag.startX;
      const movedY = event.clientY - drag.startY;
      if (!drag.dragged && Math.hypot(movedX, movedY) < LAUNCHER_DRAG_THRESHOLD_PX) return;
      if (!drag.dragged) {
        drag.dragged = true;
        setLauncherDragging(true);
        closeDockNow();
      }
      drag.movedX = movedX;
      drag.movedY = movedY;
      setLauncherPos(clampLauncherPosition({ x: drag.baseX + movedX, y: drag.baseY + movedY }));
    },
    [closeDockNow],
  );

  const finishLauncherDrag = useCallback(
    (persist: boolean) => {
      const drag = launcherDragRef.current;
      launcherDragRef.current = null;
      setLauncherDragging(false);
      if (!drag || !drag.dragged) return false;
      const final = clampLauncherPosition({ x: drag.baseX + drag.movedX, y: drag.baseY + drag.movedY });
      setLauncherPos(final);
      if (persist) persistLauncherPosition(final);
      return true;
    },
    [],
  );

  const handleLauncherPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (finishLauncherDrag(true)) {
        // A drag just ended: swallow the click that follows pointer-up.
        suppressLauncherClickRef.current = true;
      }
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore release failures; the drag ref is already cleared.
      }
    },
    [finishLauncherDrag],
  );

  const handleLauncherPointerCancel = useCallback(() => {
    finishLauncherDrag(false);
  }, [finishLauncherDrag]);

  const handleLauncherKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 24 : 8;
    setLauncherPos((current) => {
      const base = current ?? defaultLauncherPosition();
      let next: LauncherPosition | null = null;
      switch (event.key) {
        case 'ArrowUp':
          next = { x: base.x, y: base.y - step };
          break;
        case 'ArrowDown':
          next = { x: base.x, y: base.y + step };
          break;
        case 'ArrowLeft':
          next = { x: base.x - step, y: base.y };
          break;
        case 'ArrowRight':
          next = { x: base.x + step, y: base.y };
          break;
        default:
          return current;
      }
      event.preventDefault();
      const clamped = clampLauncherPosition(next);
      persistLauncherPosition(clamped);
      return clamped;
    });
  }, []);

  // GA-UI-008: programmatic focus-return after closing the panel must not
  // auto-reveal the dock.
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
        returnFocusToLauncher();
      }
      return !prev;
    });
    setPanelExpanded(false);
    closeDockNow();
  }, [closeDockNow, returnFocusToLauncher]);

  // Launcher click only: a drag that just ended swallows the trailing click.
  const handleLauncherClick = useCallback(() => {
    if (suppressLauncherClickRef.current) {
      suppressLauncherClickRef.current = false;
      return;
    }
    togglePanel();
  }, [togglePanel]);

  const revealDockFromFocus = useCallback(() => {
    if (suppressDockRevealOnFocusRef.current) {
      suppressDockRevealOnFocusRef.current = false;
      return;
    }
    openDockSoon();
  }, [openDockSoon]);

  // Latest selection appliers (ref-indirect so the window listener below
  // never captures a stale closure; effect subscribes exactly once).
  const selectConversationRef = useRef(assistant.selectConversation);
  selectConversationRef.current = assistant.selectConversation;
  const selectedIdRef = useRef(assistant.selectedId);
  selectedIdRef.current = assistant.selectedId;

  // Sidebar "Global Assistant" entry dispatches this (mirrors the
  // command palette's `open-command-palette` precedent). Activity Room
  // source-aware Reply reuses the same event with
  // `detail.conversationId` (AR-UI-REPLY-001): the EXISTING conversation
  // is selected/restored — never created. Panel open engages the
  // FloatingPanel focus contract (composer focused); selection change
  // additionally focuses the composer via ConversationPanel.
  useEffect(() => {
    const handler = (event: Event) => {
      const parsed = event instanceof CustomEvent ? parseOpenAssistantDetail(event.detail) : parseOpenAssistantDetail(null);
      setPanelOpen(true);
      setPanelExpanded(parsed.expanded);
      if (parsed.conversationId && parsed.conversationId !== selectedIdRef.current) {
        selectConversationRef.current(parsed.conversationId);
      }
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, handler);
  }, []);

  // Ctrl/⌘+J toggles the assistant. Escape closes the dock when visible.
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

  // GA-UI-007: toggle full-window expanded geometry.
  const toggleExpanded = useCallback(() => {
    setPanelExpanded((prev) => !prev);
  }, []);

  // GA-UI-006: explicit new conversation.
  const newConversation = useCallback(() => {
    void assistant.createConversation();
  }, [assistant.createConversation]);

  // GA-UI-008: dock selection opens the assistant on the chosen conversation.
  const handleDockSelect = useCallback(
    (id: string) => {
      closeDockNow();
      setPanelOpen(true);
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
      c.id === assistant.selectedId
        ? (assistant.messages.find((m) => m.role === 'user')?.content ?? null)
        : null,
    ),
    updatedAt: c.updatedAt,
  }));

  return (
    <FloatingWindowManager baseZIndex={Number(Z_INDEX.overlay)}>
      {/* GA-UI-007: Full-window surface (when expanded) */}
      {panelExpanded && (
        <FullWindowSurface
          expanded={panelExpanded}
          onToggleExpanded={toggleExpanded}
          onMinimize={togglePanel}
          onClose={togglePanel}
          onNewConversation={newConversation}
          assistant={assistant}
        />
      )}

      <div
        className={`fixed ${launcherPos ? '' : 'bottom-6 right-6'}`}
        style={
          launcherPos
            ? { left: launcherPos.x, top: launcherPos.y, zIndex: Number(Z_INDEX.sticky) }
            : { zIndex: Number(Z_INDEX.sticky) }
        }
      >
        <AssistantLauncher
          launcherRef={launcherRef}
          onClick={handleLauncherClick}
          panelOpen={panelOpen && !panelExpanded}
          onMouseEnter={openDockSoon}
          onMouseLeave={closeDockSoon}
          onFocus={revealDockFromFocus}
          dragging={launcherDragging}
          onPointerDown={handleLauncherPointerDown}
          onPointerMove={handleLauncherPointerMove}
          onPointerUp={handleLauncherPointerUp}
          onPointerCancel={handleLauncherPointerCancel}
          onKeyDown={handleLauncherKeyDown}
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
          anchor={launcherPos ?? defaultLauncherPosition()}
        />
      </div>

      {/* Floating panel (when not expanded) */}
      {!panelExpanded && (
        <FloatingPanel
          open={panelOpen}
          workspaceId={surface.workspace.id}
          onClose={togglePanel}
          onNewConversation={newConversation}
          expanded={panelExpanded}
          onToggleExpanded={toggleExpanded}
          conversationTitle={assistant.selectedConversation?.title ?? null}
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
      )}
    </FloatingWindowManager>
  );
}

export default GlobalAssistant;
