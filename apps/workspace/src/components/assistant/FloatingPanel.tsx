/**
 * VESTARA-INTELLIGENCE GA-1 Slice 2: FloatingPanel
 *
 * Non-modal floating panel with drag, resize, minimize/restore.
 * Presentation state only — no conversation/domain authority.
 *
 * Focus contract:
 *   - Open: focus moves to compose input (via focusOnMount ref)
 *   - Minimize/Escape: focus returns to launcher button
 *   - Restore: focus moves to compose input
 *   - No focus trap. Underlying Workspace remains interactive.
 *
 * Geometry persistence:
 *   - Scoped by workspace ID: vestara:assistant:${workspaceId}:position/size
 *   - Validated before application. Invalid values fall back to defaults.
 *
 * @see VESTARA-INTELLIGENCE-GA1-PREFLIGHT.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Constants ────────────────────────────────────────────────

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const MAX_WIDTH_RATIO = 0.6;
const MAX_HEIGHT_RATIO = 0.8;
const DEFAULT_POSITION = { x: -1, y: -1 }; // -1 = bottom-right (resolved in clamp)

// ─── Geometry Validation ──────────────────────────────────────

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validatePosition(
  pos: unknown,
  panelW: number,
  panelH: number,
): { x: number; y: number } {
  if (
    !pos ||
    typeof pos !== 'object' ||
    !isValidNumber((pos as { x: unknown }).x) ||
    !isValidNumber((pos as { y: unknown }).y)
  ) {
    return resolveDefaultPosition(panelW, panelH);
  }
  const { x, y } = pos as { x: number; y: number };
  // Must intersect viewport (at least 50px visible)
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visibleX = x + panelW > 50 && x < vw - 50;
  const visibleY = y + panelH > 50 && y < vh - 50;
  if (!visibleX || !visibleY) return resolveDefaultPosition(panelW, panelH);
  return { x, y };
}

function validateSize(size: unknown): { width: number; height: number } {
  if (
    !size ||
    typeof size !== 'object' ||
    !isValidNumber((size as { width: unknown }).width) ||
    !isValidNumber((size as { height: unknown }).height)
  ) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  const { width, height } = size as { width: number; height: number };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamped = {
    width: Math.max(MIN_WIDTH, Math.min(width, vw * MAX_WIDTH_RATIO)),
    height: Math.max(MIN_HEIGHT, Math.min(height, vh * MAX_HEIGHT_RATIO)),
  };
  return clamped;
}

function resolveDefaultPosition(panelW: number, panelH: number): { x: number; y: number } {
  return {
    x: Math.max(0, window.innerWidth - panelW - 24),
    y: Math.max(0, window.innerHeight - panelH - 24),
  };
}

function clampToViewport(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(0, Math.min(x, vw - w)),
    y: Math.max(0, Math.min(y, vh - h)),
  };
}

// ─── Storage ──────────────────────────────────────────────────

function storageKey(workspaceId: string, kind: 'position' | 'size') {
  return `vestara:assistant:${workspaceId}:${kind}`;
}

function loadGeometry(workspaceId: string) {
  try {
    const posRaw = localStorage.getItem(storageKey(workspaceId, 'position'));
    const sizeRaw = localStorage.getItem(storageKey(workspaceId, 'size'));
    const pos = posRaw ? JSON.parse(posRaw) : null;
    const size = sizeRaw ? JSON.parse(sizeRaw) : null;
    return { pos, size };
  } catch {
    return { pos: null, size: null };
  }
}

function savePosition(workspaceId: string, pos: { x: number; y: number }) {
  try {
    localStorage.setItem(storageKey(workspaceId, 'position'), JSON.stringify(pos));
  } catch {}
}

function saveSize(workspaceId: string, size: { width: number; height: number }) {
  try {
    localStorage.setItem(storageKey(workspaceId, 'size'), JSON.stringify(size));
  } catch {}
}

// ─── Types ────────────────────────────────────────────────────

export interface FloatingPanelProps {
  open: boolean;
  minimized: boolean;
  workspaceId: string;
  onMinimize: () => void;
  onClose: () => void;
  /** GA-UI-006: explicit new-conversation action. Optional; button hidden when absent. */
  onNewConversation?: () => void;
  /** GA-UI-007: full-window expanded geometry. Optional; maximize button hidden when absent. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  launcherRef: React.RefObject<HTMLButtonElement | null>;
  /** Ref to focus when panel opens/restores. If null, no auto-focus. */
  focusOnMountRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────

export function FloatingPanel({
  open,
  minimized,
  workspaceId,
  onMinimize,
  onClose,
  onNewConversation,
  expanded = false,
  onToggleExpanded,
  launcherRef,
  focusOnMountRef,
  children,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({ x: DEFAULT_POSITION.x, y: DEFAULT_POSITION.y }));
  const [size, setSize] = useState(() => ({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }));
  const [geometryLoaded, setGeometryLoaded] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
    startPosY: number;
    edge: string;
  } | null>(null);

  // ── Load workspace-scoped geometry ──
  useEffect(() => {
    if (!workspaceId || workspaceId === 'unknown') return;
    const { pos, size: storedSize } = loadGeometry(workspaceId);
    const validatedSize = validateSize(storedSize);
    const validatedPos = validatePosition(pos, validatedSize.width, validatedSize.height);
    // If position was default (-1, -1), resolve to bottom-right
    const finalPos =
      validatedPos.x === -1 && validatedPos.y === -1
        ? resolveDefaultPosition(validatedSize.width, validatedSize.height)
        : validatedPos;
    setSize(validatedSize);
    setPosition(finalPos);
    setGeometryLoaded(true);
  }, [workspaceId]);

  // ── Save geometry on change (after loaded) ──
  useEffect(() => {
    if (!geometryLoaded || !workspaceId || workspaceId === 'unknown') return;
    savePosition(workspaceId, position);
  }, [position, geometryLoaded, workspaceId]);

  useEffect(() => {
    if (!geometryLoaded || !workspaceId || workspaceId === 'unknown') return;
    saveSize(workspaceId, size);
  }, [size, geometryLoaded, workspaceId]);

  // ── Focus contract ──
  useEffect(() => {
    if (open && !minimized && focusOnMountRef?.current) {
      focusOnMountRef.current.focus();
    }
  }, [open, minimized, focusOnMountRef]);

  // ── Escape to minimize ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onMinimize();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onMinimize]);

  // ── Viewport resize: re-clamp position ──
  useEffect(() => {
    const handler = () => {
      setPosition((prev) => clampToViewport(prev.x, prev.y, size.width, size.height));
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [size.width, size.height]);

  // ── Drag ──
  const beginDrag = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: position.x,
        startPosY: position.y,
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'move';

      const onMove = (moveEvent: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = moveEvent.clientX - dragRef.current.startX;
        const dy = moveEvent.clientY - dragRef.current.startY;
        const newPos = clampToViewport(
          dragRef.current.startPosX + dx,
          dragRef.current.startPosY + dy,
          size.width,
          size.height,
        );
        setPosition(newPos);
      };

      const onUp = () => {
        dragRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [position.x, position.y, size.width, size.height],
  );

  // ── Resize ──
  const beginResize = useCallback(
    (e: React.PointerEvent, edge: string) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.width,
        startH: size.height,
        startPosX: position.x,
        startPosY: position.y,
        edge,
      };

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxW = vw * MAX_WIDTH_RATIO;
      const maxH = vh * MAX_HEIGHT_RATIO;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = edge.includes('right') ? 'col-resize' : edge.includes('bottom') ? 'row-resize' : 'nwse-resize';

      const onMove = (moveEvent: PointerEvent) => {
        if (!resizeRef.current) return;
        const { startX, startY, startW, startH, startPosX, startPosY, edge: e } = resizeRef.current;
        let newW = startW;
        let newH = startH;
        let newX = startPosX;
        let newY = startPosY;

        if (e.includes('right')) {
          newW = Math.max(MIN_WIDTH, Math.min(startW + (moveEvent.clientX - startX), maxW));
        }
        if (e.includes('bottom')) {
          newH = Math.max(MIN_HEIGHT, Math.min(startH + (moveEvent.clientY - startY), maxH));
        }
        if (e.includes('left')) {
          const delta = startX - moveEvent.clientX;
          newW = Math.max(MIN_WIDTH, Math.min(startW + delta, maxW));
          newX = startPosX - (newW - startW);
        }
        if (e.includes('top')) {
          const delta = startY - moveEvent.clientY;
          newH = Math.max(MIN_HEIGHT, Math.min(startH + delta, maxH));
          newY = startPosY - (newH - startH);
        }

        // Clamp position after resize
        const clamped = clampToViewport(newX, newY, newW, newH);
        setSize({ width: newW, height: newH });
        setPosition(clamped);
      };

      const onUp = () => {
        resizeRef.current = null;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [position.x, position.y, size.width, size.height],
  );

  // ── Cleanup on unmount during drag/resize ──
  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  if (!open || minimized) return null;

  // Resolve default position if needed
  const resolvedPosition =
    position.x === -1 && position.y === -1
      ? resolveDefaultPosition(size.width, size.height)
      : position;

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Global Assistant"
      className={
        expanded
          ? 'fixed inset-0 z-[90] flex flex-col overflow-hidden bg-zinc-950'
          : 'fixed z-[90] flex flex-col overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-950 shadow-2xl'
      }
      style={
        expanded
          ? undefined
          : {
              left: resolvedPosition.x,
              top: resolvedPosition.y,
              width: size.width,
              height: size.height,
              minWidth: MIN_WIDTH,
              minHeight: MIN_HEIGHT,
            }
      }
    >
      {/* Title bar (drag handle in floating mode; static in expanded mode) */}
      <div
        className={`flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 ${
          expanded ? '' : 'cursor-move select-none'
        }`}
        onPointerDown={expanded ? undefined : beginDrag}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 shrink-0 rounded-full bg-amber-400/60" />
          <span className="text-xs font-medium text-zinc-300 truncate">Vestara Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              aria-label="New conversation"
              title="New conversation"
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          {onToggleExpanded && (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-label={expanded ? 'Restore assistant' : 'Expand assistant'}
              title={expanded ? 'Restore' : 'Expand'}
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              {expanded ? (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize assistant"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

      {/* Resize handles (floating mode only) */}
      {!expanded && (
        <>
          <div
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
            onPointerDown={(e) => beginResize(e, 'bottom-right')}
            aria-hidden="true"
          />
          <div
            className="absolute bottom-0 left-2 right-2 h-1 cursor-row-resize"
            onPointerDown={(e) => beginResize(e, 'bottom')}
            aria-hidden="true"
          />
          <div
            className="absolute top-2 bottom-2 right-0 w-1 cursor-col-resize"
            onPointerDown={(e) => beginResize(e, 'right')}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}

export default FloatingPanel;
