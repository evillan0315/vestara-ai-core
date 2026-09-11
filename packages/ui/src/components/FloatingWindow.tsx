/**
 * VES-UI-011: Floating Window System
 *
 * Reusable floating window primitive. Desktop: draggable/resizable window.
 * Mobile: full-screen sheet. No domain behavior — the shell manages the window.
 *
 * Architecture Traceability:
 *   VES-UI-011: Floating Window System
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-011
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ─── Constants ─────────────────────────────────────────────────

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;
const MAX_WIDTH_RATIO = 0.6;
const MAX_HEIGHT_RATIO = 0.8;
const SNAP_THRESHOLD = 20;
const KEYBOARD_STEP = 10;
const KEYBOARD_LARGE_STEP = 50;

// ─── Geometry Helpers ──────────────────────────────────────────

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampToViewport(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(0, Math.min(x, vw - w)),
    y: Math.max(0, Math.min(y, vh - h)),
  };
}

function resolveDefaultPosition(panelW: number, panelH: number): { x: number; y: number } {
  return {
    x: Math.max(0, window.innerWidth - panelW - 24),
    y: Math.max(0, window.innerHeight - panelH - 24),
  };
}

function validatePosition(pos: unknown, panelW: number, panelH: number): { x: number; y: number } {
  if (
    !pos ||
    typeof pos !== 'object' ||
    !isValidNumber((pos as { x: unknown }).x) ||
    !isValidNumber((pos as { y: unknown }).y)
  ) {
    return resolveDefaultPosition(panelW, panelH);
  }
  const { x, y } = pos as { x: number; y: number };
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
  return {
    width: Math.max(MIN_WIDTH, Math.min(width, vw * MAX_WIDTH_RATIO)),
    height: Math.max(MIN_HEIGHT, Math.min(height, vh * MAX_HEIGHT_RATIO)),
  };
}

// ─── Storage ───────────────────────────────────────────────────

function storageKey(id: string, kind: 'position' | 'size') {
  return `vestara:fw:${id}:${kind}`;
}

function loadGeometry(id: string) {
  try {
    const posRaw = localStorage.getItem(storageKey(id, 'position'));
    const sizeRaw = localStorage.getItem(storageKey(id, 'size'));
    return {
      pos: posRaw ? JSON.parse(posRaw) : null,
      size: sizeRaw ? JSON.parse(sizeRaw) : null,
    };
  } catch {
    return { pos: null, size: null };
  }
}

function savePosition(id: string, pos: { x: number; y: number }) {
  try {
    localStorage.setItem(storageKey(id, 'position'), JSON.stringify(pos));
  } catch {
    // storage full or unavailable
  }
}

function saveSize(id: string, size: { width: number; height: number }) {
  try {
    localStorage.setItem(storageKey(id, 'size'), JSON.stringify(size));
  } catch {
    // storage full or unavailable
  }
}

// ─── Breakpoint Detection ──────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile;
}

// ─── Reduced Motion ────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ─── Types ─────────────────────────────────────────────────────

export type WindowState = 'normal' | 'minimized' | 'maximized';

export interface FloatingWindowManagerContextValue {
  /** Bring this window to the front */
  bringToFront: (id: string) => void;
  /** Current z-index for a window */
  getZIndex: (id: string) => number;
  /** Base z-index for floating windows */
  baseZIndex: number;
}

/** Internal context passed from FloatingWindow to its sub-components. */
export interface FloatingWindowInternalContextValue {
  /** Begin a drag operation from a child element (e.g., the header) */
  beginDrag: (e: React.PointerEvent) => void;
  /** Whether dragging is currently possible */
  draggable: boolean;
  /** Whether the window is maximized */
  maximized: boolean;
}

export interface FloatingWindowProps {
  /** Unique identifier for this window (used for persistence and z-index) */
  id: string;

  /** Whether the window is open */
  open: boolean;

  /** Close callback */
  onClose: () => void;

  /** Initial width (default: 400) */
  defaultWidth?: number;

  /** Initial height (default: 500) */
  defaultHeight?: number;

  /** Minimum width (default: 280) */
  minWidth?: number;

  /** Minimum height (default: 180) */
  minHeight?: number;

  /** Whether dragging is enabled (default: true) */
  draggable?: boolean;

  /** Whether resizing is enabled (default: true) */
  resizable?: boolean;

  /** Whether to persist geometry to localStorage (default: true) */
  persist?: boolean;

  /** Auto-focus this ref when the window opens */
  focusOnOpenRef?: RefObject<HTMLElement | null>;

  /** Whether Escape closes the window (default: true) */
  escapeCloses?: boolean;

  /** Custom class name for the window container */
  className?: string;

  /** Window content (should contain FloatingWindowHeader + FloatingWindowContent) */
  children: ReactNode;
}

export interface FloatingWindowHeaderProps {
  /** Header content. If provided, renders as custom header with drag-handle styling. */
  children?: ReactNode;

  /** Title text (used in default header when children is omitted) */
  title?: string;

  /** Whether the window is maximized */
  maximized?: boolean;

  /** Minimize callback */
  onMinimize?: () => void;

  /** Maximize/restore callback */
  onMaximize?: () => void;

  /** Close callback */
  onClose?: () => void;

  /** Custom class name */
  className?: string;

  /** Whether to show window actions (default: true) */
  showActions?: boolean;
}

export interface FloatingWindowContentProps {
  /** Content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

// ─── Contexts ──────────────────────────────────────────────────

/** Manager context: z-index stacking for multiple windows. */
const FloatingWindowManagerContext = createContext<FloatingWindowManagerContextValue | null>(null);

/** Internal context: drag handle for the header. */
const FloatingWindowInternalContext = createContext<FloatingWindowInternalContextValue | null>(null);

/**
 * VES-UI-011: Access the floating window manager context.
 * Use within FloatingWindowManager to coordinate z-index across windows.
 */
export function useFloatingWindowManager(): FloatingWindowManagerContextValue {
  const ctx = useContext(FloatingWindowManagerContext);
  if (!ctx) throw new Error('useFloatingWindowManager must be used within FloatingWindowManager');
  return ctx;
}

// ─── FloatingWindowManager ─────────────────────────────────────

export interface FloatingWindowManagerProps {
  /** Managed children */
  children: ReactNode;

  /** Base z-index for floating windows (default: 1300 — matches Z_INDEX.overlay) */
  baseZIndex?: number;
}

/**
 * VES-UI-011: Manages z-index stacking for multiple floating windows.
 * Each window gets a sequential z-index. Clicking a window brings it to front.
 */
export function FloatingWindowManager({ children, baseZIndex = 1300 }: FloatingWindowManagerProps) {
  const [stack, setStack] = useState<string[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const bringToFront = useCallback((id: string) => {
    setStack((prev) => {
      const filtered = prev.filter((s) => s !== id);
      return [...filtered, id];
    });
  }, []);

  const getZIndex = useCallback(
    (id: string) => {
      const index = stackRef.current.indexOf(id);
      if (index === -1) return baseZIndex;
      return baseZIndex + index;
    },
    [baseZIndex],
  );

  const value = useMemo(() => ({ bringToFront, getZIndex, baseZIndex }), [bringToFront, getZIndex, baseZIndex]);

  return <FloatingWindowManagerContext.Provider value={value}>{children}</FloatingWindowManagerContext.Provider>;
}

// ─── FloatingWindow Component ──────────────────────────────────

export function FloatingWindow({
  id,
  open,
  onClose,
  defaultWidth = DEFAULT_WIDTH,
  defaultHeight = DEFAULT_HEIGHT,
  minWidth = MIN_WIDTH,
  minHeight = MIN_HEIGHT,
  draggable = true,
  resizable = true,
  persist = true,
  focusOnOpenRef,
  escapeCloses = true,
  className = '',
  children,
}: FloatingWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<WindowState>('normal');
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: defaultWidth,
    height: defaultHeight,
  });
  const [geometryLoaded, setGeometryLoaded] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
    startPosY: number;
    edge: string;
  } | null>(null);

  const savedGeometryRef = useRef<{
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);

  const isMobile = useIsMobile();
  const reducedMotion = usePrefersReducedMotion();

  const managerCtx = useContext(FloatingWindowManagerContext);
  const bringToFront = managerCtx?.bringToFront;
  const getZIndex = managerCtx?.getZIndex;

  // ── Load persisted geometry ──
  useEffect(() => {
    if (!persist || !id) return;
    const { pos, size: storedSize } = loadGeometry(id);
    const validatedSize = validateSize(storedSize);
    const validatedPos = validatePosition(pos, validatedSize.width, validatedSize.height);
    setSize(validatedSize);
    setPosition(validatedPos);
    setGeometryLoaded(true);
  }, [id, persist]);

  // ── Save geometry on change ──
  useEffect(() => {
    if (!geometryLoaded || !persist || !id) return;
    savePosition(id, position);
  }, [position, geometryLoaded, id, persist]);

  useEffect(() => {
    if (!geometryLoaded || !persist || !id) return;
    saveSize(id, size);
  }, [size, geometryLoaded, id, persist]);

  // ── Focus contract: auto-focus on open ──
  useEffect(() => {
    if (open && state !== 'minimized' && focusOnOpenRef?.current) {
      focusOnOpenRef.current.focus();
    }
  }, [open, state, focusOnOpenRef]);

  // ── Bring to front on open ──
  useEffect(() => {
    if (open && bringToFront) {
      bringToFront(id);
    }
  }, [open, id, bringToFront]);

  // ── Escape to close ──
  useEffect(() => {
    if (!open || !escapeCloses) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, escapeCloses, onClose]);

  // ── Viewport resize: re-clamp position ──
  useEffect(() => {
    if (state === 'maximized') return;
    const handler = () => {
      setPosition((prev) => clampToViewport(prev.x, prev.y, size.width, size.height));
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [size.width, size.height, state]);

  // ── Keyboard movement (when window is focused) ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (state !== 'normal') return;
      const step = e.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setPosition((prev) => ({ ...prev, y: Math.max(0, prev.y - step) }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPosition((prev) => ({
            ...prev,
            y: Math.min(window.innerHeight - size.height, prev.y + step),
          }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPosition((prev) => ({ ...prev, x: Math.max(0, prev.x - step) }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPosition((prev) => ({
            ...prev,
            x: Math.min(window.innerWidth - size.width, prev.x + step),
          }));
          break;
      }
    },
    [state, size.width, size.height],
  );

  // ── Bring to front on click ──
  const handlePointerDown = useCallback(() => {
    if (bringToFront) bringToFront(id);
  }, [bringToFront, id]);

  // ── Drag (exposed to header via context) ──
  const beginDrag = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !draggable || state === 'maximized') return;
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

        // Snap to edges
        let snappedX = newPos.x;
        let snappedY = newPos.y;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (newPos.x <= SNAP_THRESHOLD) snappedX = 0;
        if (newPos.y <= SNAP_THRESHOLD) snappedY = 0;
        if (newPos.x + size.width >= vw - SNAP_THRESHOLD) snappedX = vw - size.width;
        if (newPos.y + size.height >= vh - SNAP_THRESHOLD) snappedY = vh - size.height;

        setPosition({ x: snappedX, y: snappedY });
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
    [draggable, state, position.x, position.y, size.width, size.height],
  );

  // ── Resize ──
  const beginResize = useCallback(
    (e: React.PointerEvent, edge: string) => {
      if (e.button !== 0 || !resizable || state === 'maximized') return;
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
      document.body.style.cursor = edge.includes('right')
        ? 'col-resize'
        : edge.includes('bottom')
          ? 'row-resize'
          : 'nwse-resize';

      const onMove = (moveEvent: PointerEvent) => {
        if (!resizeRef.current) return;
        const { startX, startY, startW, startH, startPosX, startPosY, edge: ed } = resizeRef.current;
        let newW = startW;
        let newH = startH;
        let newX = startPosX;
        let newY = startPosY;

        if (ed.includes('right')) {
          newW = Math.max(minWidth, Math.min(startW + (moveEvent.clientX - startX), maxW));
        }
        if (ed.includes('bottom')) {
          newH = Math.max(minHeight, Math.min(startH + (moveEvent.clientY - startY), maxH));
        }
        if (ed.includes('left')) {
          const delta = startX - moveEvent.clientX;
          newW = Math.max(minWidth, Math.min(startW + delta, maxW));
          newX = startPosX - (newW - startW);
        }
        if (ed.includes('top')) {
          const delta = startY - moveEvent.clientY;
          newH = Math.max(minHeight, Math.min(startH + delta, maxH));
          newY = startPosY - (newH - startH);
        }

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
    [resizable, state, size.width, size.height, position.x, position.y, minWidth, minHeight],
  );

  // ── Minimize / Maximize / Restore ──
  const _minimize = useCallback(() => {
    savedGeometryRef.current = { position, size };
    setState('minimized');
  }, [position, size]);

  const _maximize = useCallback(() => {
    savedGeometryRef.current = { position, size };
    setState('maximized');
  }, [position, size]);

  const _restore = useCallback(() => {
    if (savedGeometryRef.current) {
      setPosition(savedGeometryRef.current.position);
      setSize(savedGeometryRef.current.size);
      savedGeometryRef.current = null;
    }
    setState('normal');
  }, []);

  // ── Cleanup on unmount during drag/resize ──
  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  // Internal context for sub-components (header drag handle)
  const internalCtx = useMemo(
    () => ({ beginDrag, draggable, maximized: state === 'maximized' }),
    [beginDrag, draggable, state],
  );

  if (!open) return null;

  // Mobile: full-screen sheet
  if (isMobile) {
    return (
      <FloatingWindowInternalContext.Provider value={internalCtx}>
        <div
          ref={windowRef}
          role="dialog"
          aria-label="Floating window"
          data-state="maximized"
          className={`fixed inset-0 z-[1400] flex flex-col bg-[var(--vestara-surface-canvas)] ${
            reducedMotion ? '' : 'animate-[fade-in_200ms_ease-out]'
          } ${className}`}
        >
          {children}
        </div>
      </FloatingWindowInternalContext.Provider>
    );
  }

  const zIndex = getZIndex ? getZIndex(id) : 1400;

  // Maximized: full viewport
  if (state === 'maximized') {
    return (
      <FloatingWindowInternalContext.Provider value={internalCtx}>
        <div
          ref={windowRef}
          role="dialog"
          aria-label="Floating window"
          data-state="maximized"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          className={`fixed inset-0 flex flex-col overflow-hidden bg-[var(--vestara-surface-canvas)] ring-1 ring-[var(--vestara-border-subtle)] ${
            reducedMotion ? '' : 'animate-[fade-in_200ms_ease-out]'
          } ${className}`}
          style={{ zIndex }}
        >
          {children}
        </div>
      </FloatingWindowInternalContext.Provider>
    );
  }

  // Minimized: hidden
  if (state === 'minimized') {
    return null;
  }

  // Normal: floating window
  const resolvedPosition = geometryLoaded ? position : resolveDefaultPosition(size.width, size.height);

  return (
    <FloatingWindowInternalContext.Provider value={internalCtx}>
      <div
        ref={windowRef}
        role="dialog"
        aria-label="Floating window"
        data-state="normal"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        className={`flex flex-col overflow-hidden rounded-xl border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]/95 backdrop-blur-xl ring-1 ring-[var(--vestara-border-subtle)] ${
          reducedMotion ? '' : 'animate-[fade-in_200ms_ease-out]'
        } ${className}`}
        style={{
          position: 'fixed',
          left: resolvedPosition.x,
          top: resolvedPosition.y,
          width: size.width,
          height: size.height,
          minWidth,
          minHeight,
          zIndex,
          boxShadow: 'var(--vestara-elevation-xl)',
        }}
      >
        {children}

        {/* Resize handles */}
        {resizable && (
          <>
            <div
              className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize"
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
            <div
              className="absolute top-2 bottom-2 left-0 w-1 cursor-col-resize"
              onPointerDown={(e) => beginResize(e, 'left')}
              aria-hidden="true"
            />
            <div
              className="absolute top-0 left-2 right-2 h-1 cursor-row-resize"
              onPointerDown={(e) => beginResize(e, 'top')}
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </FloatingWindowInternalContext.Provider>
  );
}

// ─── FloatingWindowHeader Component ────────────────────────────

export function FloatingWindowHeader({
  children,
  title,
  maximized = false,
  onMinimize,
  onMaximize,
  onClose,
  className = '',
  showActions = true,
}: FloatingWindowHeaderProps) {
  const internalCtx = useContext(FloatingWindowInternalContext);
  const beginDrag = internalCtx?.beginDrag;
  const isDraggable = internalCtx?.draggable ?? true;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Don't drag if clicking a button
      if ((e.target as HTMLElement).closest('button')) return;
      if (isDraggable && beginDrag) {
        beginDrag(e);
      }
    },
    [beginDrag, isDraggable],
  );

  // Custom header
  if (children) {
    return (
      <div
        className={`flex shrink-0 items-center border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]/90 backdrop-blur px-3 py-2.5 rounded-t-xl select-none ${isDraggable ? 'cursor-move' : ''} ${className}`}
        onPointerDown={handlePointerDown}
      >
        {children}
      </div>
    );
  }

  // Default header with title and window actions
  return (
    <div
      className={`flex shrink-0 items-center justify-between border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]/90 backdrop-blur px-3 py-2.5 rounded-t-xl select-none ${isDraggable ? 'cursor-move' : ''} ${className}`}
      onPointerDown={handlePointerDown}
    >
      <span className="truncate text-xs font-semibold tracking-tight text-[var(--vestara-text-primary)]">{title}</span>
      {showActions && (
        <div className="flex items-center gap-0.5">
          {onMinimize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMinimize();
              }}
              aria-label="Minimize window"
              title="Minimize"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--vestara-text-muted)] transition-colors hover:bg-[var(--vestara-surface-interactive)] hover:text-[var(--vestara-text-primary)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--vestara-border-focus)]"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
          )}
          {onMaximize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMaximize();
              }}
              aria-label={maximized ? 'Restore window' : 'Maximize window'}
              title={maximized ? 'Restore' : 'Maximize'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--vestara-text-muted)] transition-colors hover:bg-[var(--vestara-surface-interactive)] hover:text-[var(--vestara-text-primary)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--vestara-border-focus)]"
            >
              {maximized ? (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4" />
                </svg>
              )}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close window"
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--vestara-text-muted)] transition-colors hover:bg-[var(--vestara-status-error)]/15 hover:text-[var(--vestara-status-error)] cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--vestara-border-focus)]"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FloatingWindowContent Component ───────────────────────────

export function FloatingWindowContent({ children, className = '' }: FloatingWindowContentProps) {
  return <div className={`min-h-0 flex-1 overflow-auto ${className}`}>{children}</div>;
}
