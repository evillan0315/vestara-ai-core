/**
 * VES-UI-001 T3: VestaraWindow
 *
 * Window chrome promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/components/VestaraWindow.tsx`).
 * Draggable 36px header + 28px status bar + 8-way resize +
 * minimize/maximize/close + focus/z-order reporting.
 *
 * Interaction model:
 * - Pointer drag from the header (primary button only, ignored on
 *   maximized windows and on traffic-light buttons).
 * - Pointer resize from 8 handles (n/s/e/w/ne/nw/se/sw).
 * - Keyboard: Arrow keys on the header move the window (Shift = fine
 *   1px step); Arrow keys on a focused resize handle resize along that
 *   handle's axis. Double-click (or the traffic control) toggles maximize.
 * - Focus/z-order is reported via `onFocus(id)` on pointer contact; the
 *   parent owns the z-stack (`bringFront`), this component only renders
 *   `data.z` and the focused ring.
 * - Motion: border/shadow transitions are applied only when the user has
 *   no `prefers-reduced-motion` preference (see `usePrefersReducedMotion`
 *   + the scoped `.ds-window` rule in `desktop-shell.tokens.css`).
 * - Placement is deterministic: `cascadeWindowPlacement` derives fixed
 *   cascade coordinates from the window index — never `Math.random`.
 *
 * Visual roles bind to the scoped `--ds-*` layer
 * (`desktop-shell.tokens.css`), never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T3 VestaraWindow)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §4
 */

import { useEffect, useRef, useState } from 'react';
import type { WinData } from './types';
import './desktop-shell.tokens.css';

/** Minimum window geometry (mirrors the prototype floor). */
export const WINDOW_MIN_SIZE = { w: 320, h: 220 } as const;

/** Default spawn geometry for deterministically placed windows. */
export const WINDOW_DEFAULT_SIZE = { w: 560, h: 380 } as const;

/** Cascade stride (px) between deterministically placed windows. */
export const WINDOW_CASCADE_STEP = 40;

/** Cascade slots before the deterministic cascade wraps. */
export const WINDOW_CASCADE_SLOTS = 8;

/** Keyboard move/resize step (px); Shift selects the fine step. */
export const WINDOW_KEYBOARD_STEP = 10;
export const WINDOW_KEYBOARD_STEP_FINE = 1;

export interface WindowPlacement {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Deterministic cascade placement for window `index` — fixed coordinates,
 * no `Math.random`, so renders are stable across runs (plan G7).
 */
export function cascadeWindowPlacement(
  index: number,
  size: { readonly w: number; readonly h: number } = WINDOW_DEFAULT_SIZE,
): WindowPlacement {
  const slot = ((index % WINDOW_CASCADE_SLOTS) + WINDOW_CASCADE_SLOTS) % WINDOW_CASCADE_SLOTS;
  return {
    x: 120 + slot * WINDOW_CASCADE_STEP,
    y: 60 + slot * WINDOW_CASCADE_STEP,
    w: size.w,
    h: size.h,
  };
}

/**
 * Clamp a top-left corner into the visible desktop area (below the 32px
 * top bar, with a 100px horizontal / 60px vertical grab margin, mirroring
 * the prototype bounds). Falls back to the raw position when no window
 * is available (SSR).
 */
export function clampWindowPosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const maxX = Math.max(0, window.innerWidth - 100);
  const maxY = Math.max(32, window.innerHeight - 60);
  return {
    x: Math.max(0, Math.min(maxX, x)),
    y: Math.max(32, Math.min(maxY, y)),
  };
}

/** Tracks the `(prefers-reduced-motion: reduce)` media query. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  return reduced;
}

export interface VestaraWindowProps {
  readonly data: WinData;
  readonly isFocused: boolean;
  readonly onFocus: (id: string) => void;
  readonly onClose: (id: string) => void;
  readonly onMinimize: (id: string) => void;
  readonly onUpdate: (id: string, patch: Partial<WinData>) => void;
  /** Optional maximize delegate; falls back to `onUpdate` with maximized/prev patch. */
  readonly onToggleMaximize?: (id: string) => void;
  readonly children: React.ReactNode;
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Mutable patch shape — `Partial<WinData>` preserves `readonly`, so build via this. */
type WindowPatch = { -readonly [K in keyof WinData]?: WinData[K] };

interface ResizeHandleDef {
  readonly dir: ResizeDir;
  readonly label: string;
  readonly className: string;
}

const RESIZE_HANDLES: readonly ResizeHandleDef[] = [
  { dir: 'n', label: 'north', className: 'top-0 left-0 h-1 w-full cursor-ns-resize' },
  { dir: 's', label: 'south', className: 'bottom-0 left-0 h-1 w-full cursor-ns-resize' },
  { dir: 'e', label: 'east', className: 'top-0 right-0 h-full w-1 cursor-ew-resize' },
  { dir: 'w', label: 'west', className: 'top-0 left-0 h-full w-1 cursor-ew-resize' },
  { dir: 'ne', label: 'northeast', className: 'top-0 right-0 h-3 w-3 cursor-nesw-resize' },
  { dir: 'sw', label: 'southwest', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
  { dir: 'nw', label: 'northwest', className: 'top-0 left-0 h-3 w-3 cursor-nwse-resize' },
  { dir: 'se', label: 'southeast', className: 'right-0 bottom-0 h-3 w-3 cursor-nwse-resize' },
];

interface DragState {
  readonly dx: number;
  readonly dy: number;
}

interface ResizeState {
  readonly dir: ResizeDir;
  readonly startX: number;
  readonly startY: number;
  readonly startW: number;
  readonly startH: number;
  readonly startLeft: number;
  readonly startTop: number;
}

export function toggleMaximizePatch(data: WinData): Partial<WinData> {
  if (data.maximized) return { maximized: false, ...(data.prev ?? {}) };
  return { maximized: true, prev: { x: data.x, y: data.y, w: data.w, h: data.h } };
}

export function VestaraWindow({
  data,
  isFocused,
  onFocus,
  onClose,
  onMinimize,
  onUpdate,
  onToggleMaximize,
  children,
}: VestaraWindowProps) {
  const reducedMotion = usePrefersReducedMotion();
  const dragState = useRef<DragState | null>(null);
  const resizeState = useRef<ResizeState | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragState.current;
      if (drag) {
        const next = clampWindowPosition(event.clientX - drag.dx, event.clientY - drag.dy);
        onUpdateRef.current(data.id, { x: next.x, y: next.y });
        return;
      }
      const resize = resizeState.current;
      if (!resize) return;
      const dx = event.clientX - resize.startX;
      const dy = event.clientY - resize.startY;
      let w = resize.startW;
      let h = resize.startH;
      let x = resize.startLeft;
      let y = resize.startTop;
      if (resize.dir.includes('e')) w = Math.max(WINDOW_MIN_SIZE.w, resize.startW + dx);
      if (resize.dir.includes('s')) h = Math.max(WINDOW_MIN_SIZE.h, resize.startH + dy);
      if (resize.dir.includes('w')) {
        w = Math.max(WINDOW_MIN_SIZE.w, resize.startW - dx);
        x = resize.startLeft + (resize.startW - w);
      }
      if (resize.dir.includes('n')) {
        h = Math.max(WINDOW_MIN_SIZE.h, resize.startH - dy);
        y = resize.startTop + (resize.startH - h);
      }
      const patch: WindowPatch = { w, h };
      if (resize.dir.includes('w')) patch.x = Math.max(0, x);
      if (resize.dir.includes('n')) patch.y = Math.max(32, y);
      onUpdateRef.current(data.id, patch);
    };
    const onUp = () => {
      dragState.current = null;
      resizeState.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [data.id]);

  if (data.minimized) return null;

  const toggleMaximize = () => {
    if (onToggleMaximize) onToggleMaximize(data.id);
    else onUpdate(data.id, toggleMaximizePatch(data));
  };

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (data.maximized) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    dragState.current = { dx: event.clientX - data.x, dy: event.clientY - data.y };
  };

  const onHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    if (data.maximized) return;
    const step = event.shiftKey ? WINDOW_KEYBOARD_STEP_FINE : WINDOW_KEYBOARD_STEP;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else return;
    event.preventDefault();
    const next = clampWindowPosition(data.x + dx, data.y + dy);
    onUpdate(data.id, { x: next.x, y: next.y });
  };

  const onResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>, dir: ResizeDir) => {
    event.stopPropagation();
    if (data.maximized) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    resizeState.current = {
      dir,
      startX: event.clientX,
      startY: event.clientY,
      startW: data.w,
      startH: data.h,
      startLeft: data.x,
      startTop: data.y,
    };
  };

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, dir: ResizeDir) => {
    if (data.maximized) return;
    const step = event.shiftKey ? WINDOW_KEYBOARD_STEP_FINE : WINDOW_KEYBOARD_STEP;
    let w = data.w;
    let h = data.h;
    let x = data.x;
    let y = data.y;
    let handled = false;
    if (dir.includes('e') && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      w = Math.max(WINDOW_MIN_SIZE.w, data.w + (event.key === 'ArrowRight' ? step : -step));
      handled = true;
    }
    if (dir.includes('w') && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      const nextW = Math.max(WINDOW_MIN_SIZE.w, data.w + (event.key === 'ArrowLeft' ? step : -step));
      x = data.x + (data.w - nextW);
      w = nextW;
      handled = true;
    }
    if (dir.includes('s') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      h = Math.max(WINDOW_MIN_SIZE.h, data.h + (event.key === 'ArrowDown' ? step : -step));
      handled = true;
    }
    if (dir.includes('n') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const nextH = Math.max(WINDOW_MIN_SIZE.h, data.h + (event.key === 'ArrowUp' ? step : -step));
      y = data.y + (data.h - nextH);
      h = nextH;
      handled = true;
    }
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
    const patch: WindowPatch = { w, h };
    if (dir.includes('w')) patch.x = Math.max(0, x);
    if (dir.includes('n')) patch.y = Math.max(32, y);
    onUpdate(data.id, patch);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={data.title}
      data-testid={`vestara-window-${data.id}`}
      onPointerDownCapture={() => onFocus(data.id)}
      style={
        data.maximized
          ? { zIndex: data.z }
          : { left: data.x, top: data.y, width: data.w, height: data.h, zIndex: data.z }
      }
      className={`ds-window absolute flex touch-none flex-col overflow-hidden rounded-[var(--vestara-radius-lg)] border select-none ${
        data.maximized ? 'inset-0' : ''
      } ${
        isFocused ? 'border-[var(--ds-focus-ring)]' : 'border-[var(--ds-border)]'
      } bg-[var(--ds-surface-bg)] shadow-[var(--ds-window-shadow)] ${
        reducedMotion ? '' : 'transition-[border-color,box-shadow] duration-200'
      }`}
    >
      <div
        data-testid={`vestara-window-header-${data.id}`}
        tabIndex={0}
        aria-label={`${data.title} window header. Arrow keys move the window. Double-click to maximize.`}
        title="Drag to move · Arrow keys move · Double-click to maximize"
        onPointerDown={onHeaderPointerDown}
        onKeyDown={onHeaderKeyDown}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          toggleMaximize();
        }}
        className={`flex h-[var(--ds-chrome-height)] shrink-0 touch-none items-center gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-2)] ${
          data.maximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex items-center gap-[var(--vestara-spacing-1)]">
          <button
            type="button"
            aria-label={`Close ${data.title}`}
            title="Close"
            onClick={() => onClose(data.id)}
            className="h-3 w-3 rounded-full border border-[var(--ds-border)] bg-[var(--ds-error)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--ds-accent)]"
          />
          <button
            type="button"
            aria-label={`Minimize ${data.title}`}
            title="Minimize"
            onClick={() => onMinimize(data.id)}
            className="h-3 w-3 rounded-full border border-[var(--ds-border)] bg-[var(--ds-warning)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--ds-accent)]"
          />
          <button
            type="button"
            aria-label={data.maximized ? `Restore ${data.title}` : `Maximize ${data.title}`}
            title={data.maximized ? 'Restore' : 'Maximize'}
            onClick={toggleMaximize}
            className="h-3 w-3 rounded-full border border-[var(--ds-border)] bg-[var(--ds-success)] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--ds-accent)]"
          />
        </div>
        <div className="ml-[var(--vestara-spacing-1)] flex min-w-0 items-center gap-[var(--vestara-spacing-2)]">
          <span className="truncate text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--ds-text)]">
            {data.title}
          </span>
          {data.subtitle ? (
            <span className="hidden truncate text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)] sm:inline">
              {data.subtitle}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center">
          <span className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
            {data.type}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--ds-surface-bg)] text-[var(--ds-text)]">
        {children}
      </div>

      <div
        data-testid={`vestara-window-status-${data.id}`}
        className="flex h-[var(--ds-statusbar-height)] shrink-0 items-center gap-[var(--vestara-spacing-2)] border-t border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-2)] font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]"
      >
        <span>
          {data.w}×{data.h}
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-[var(--ds-border)]" />
        <span>z:{data.z}</span>
        <span className="ml-auto">Vestara Shell</span>
      </div>

      {data.maximized
        ? null
        : RESIZE_HANDLES.map(({ dir, label, className }) => (
            <button
              key={dir}
              type="button"
              aria-label={`Resize ${data.title} ${label}`}
              title={`Resize ${label}`}
              data-testid={`vestara-window-resize-${data.id}-${dir}`}
              onPointerDown={(event) => onResizePointerDown(event, dir)}
              onKeyDown={(event) => onResizeKeyDown(event, dir)}
              className={`absolute z-20 touch-none border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-[var(--ds-accent)] ${className}`}
            />
          ))}
    </div>
  );
}
