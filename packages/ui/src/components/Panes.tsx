/**
 * VES-UI-D10: Panes Component
 *
 * Reusable pane layouts: SplitPane, ResizablePane, MasterDetail, ThreePane.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-D: Layout Shell (phases 9-11)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-010
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitPaneProps {
  /** Split direction */
  direction?: SplitDirection;

  /** Initial split position (percentage or pixels) */
  defaultSize?: number | string;

  /** Minimum size of first pane */
  minSize?: number | string;

  /** Maximum size of first pane */
  maxSize?: number | string;

  /** Whether split is resizable */
  resizable?: boolean;

  /** Custom class name */
  className?: string;

  /** First pane content */
  children: [ReactNode, ReactNode];
}

export interface MasterDetailLayoutProps {
  /** Master pane content */
  master: ReactNode;

  /** Detail pane content */
  detail: ReactNode;

  /** Master pane width */
  masterWidth?: string;

  /** Custom class name */
  className?: string;
}

export type ThreePaneStackBelow = 'sm' | 'md' | 'lg' | false;

export interface ThreePaneLayoutProps {
  /** Left pane content */
  left?: ReactNode;

  /** Center pane content */
  center: ReactNode;

  /** Right pane content */
  right?: ReactNode;

  /**
   * Left pane width in px (number or '280px' string). Controlled when
   * `onLeftWidthChange` is provided, otherwise the uncontrolled initial width.
   */
  leftWidth?: string | number;

  /**
   * Right pane width in px (number or '320px' string). Controlled when
   * `onRightWidthChange` is provided, otherwise the uncontrolled initial width.
   */
  rightWidth?: string | number;

  /** Uncontrolled initial widths (px). Ignored when controlled. */
  defaultLeftWidth?: number;
  defaultRightWidth?: number;

  /** Width clamps (px) applied to drag, keyboard, and persisted values. */
  minLeftWidth?: number;
  maxLeftWidth?: number;
  minRightWidth?: number;
  maxRightWidth?: number;

  /** Width change handlers. Providing one makes that pane controlled. */
  onLeftWidthChange?: (px: number) => void;
  onRightWidthChange?: (px: number) => void;

  /** Collapsed state. Controlled when the matching change handler is provided. */
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  defaultLeftCollapsed?: boolean;
  defaultRightCollapsed?: boolean;
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;

  /** Whether a side pane can hide (double-click separator or its header toggle; expand strip to restore). */
  collapsibleLeft?: boolean;
  collapsibleRight?: boolean;

  /** Accessible pane labels (also used for resize/expand announcements). */
  leftAriaLabel?: string;
  centerAriaLabel?: string;
  rightAriaLabel?: string;

  /**
   * localStorage key persisting uncontrolled widths + collapsed state.
   * Ignored for controlled values. Reads are lazy, writes are best-effort.
   */
  storageKey?: string;

  /** Drag handles on/off. `false` renders the classic static three panes. */
  resizable?: boolean;

  /**
   * Gutters between panes (separators and expand strips sit inside the
   * gutter). Default true — `gap-spacing-section`, the same rhythm as hero,
   * alert, and toolbar stacking, so card panes read as floating cards with
   * canvas showing through. Set false for flush rails.
   */
  paneGap?: boolean;

  /**
   * Bare panes render without the default panel chrome (no rail background
   * or edge borders) so slot content can bring its own card treatment
   * (e.g. `ar-panel` rail/context cards). Separators and expand strips
   * are unaffected.
   */
  barePanes?: boolean;

  /**
   * Below this breakpoint panes stack vertically (separators hidden, all
   * panes visible at natural width). `false` keeps the row at all sizes.
   */
  stackBelow?: ThreePaneStackBelow;

  /** Custom class name for the row */
  className?: string;

  /** Additional pane classes (e.g. page CSS hook classes) */
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;
}

export interface PageProps {
  /** Page content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface PageHeaderProps {
  /** Header content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface PageTitleProps {
  /** Title text */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface PageActionsProps {
  /** Action buttons */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

// ─── SplitPane Component ───────────────────────────────────────

export function SplitPane({
  direction = 'horizontal',
  defaultSize = '50%',
  minSize = 100,
  maxSize = '80%',
  resizable = true,
  className = '',
  children,
}: SplitPaneProps) {
  const [size, setSize] = useState<number | string>(defaultSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    if (!resizable) return;
    isDragging.current = true;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      let newSize: number;

      if (direction === 'horizontal') {
        newSize = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        newSize = ((e.clientY - rect.top) / rect.height) * 100;
      }

      // Clamp to min/max
      const minPercent = typeof minSize === 'number' ? minSize : 20;
      const maxPercent = typeof maxSize === 'number' ? maxSize : 80;
      newSize = Math.max(minPercent, Math.min(maxPercent, newSize));

      setSize(`${newSize}%`);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, resizable, minSize, maxSize]);

  const [first, second] = children;

  return (
    <div ref={containerRef} className={`flex ${direction === 'horizontal' ? 'flex-row' : 'flex-col'} ${className}`}>
      {/* First pane */}
      <div
        className={`shrink-0 overflow-auto ${direction === 'horizontal' ? 'h-full' : 'w-full'}`}
        style={{ [direction === 'horizontal' ? 'width' : 'height']: size }}
      >
        {first}
      </div>

      {/* Divider */}
      {resizable && (
        <button
          type="button"
          className={`
            shrink-0 bg-[var(--vestara-border-subtle)] hover:bg-[var(--vestara-accent-primary)]/30
            transition-colors duration-100
            ${direction === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
          `}
          aria-label={`Resize ${direction === 'horizontal' ? 'horizontal' : 'vertical'}`}
          onMouseDown={handleMouseDown}
          tabIndex={0}
        />
      )}

      {/* Second pane */}
      <div className="flex-1 min-w-0 overflow-auto">{second}</div>
    </div>
  );
}

// ─── MasterDetailLayout Component ──────────────────────────────

export function MasterDetailLayout({ master, detail, masterWidth = '320px', className = '' }: MasterDetailLayoutProps) {
  return (
    <SplitPane direction="horizontal" defaultSize={masterWidth} minSize={200} maxSize="50%" className={className}>
      {[master, detail]}
    </SplitPane>
  );
}

// ─── ThreePaneLayout Component ─────────────────────────────────
// Resizable left/center/right workspace shell: pixel drag handles with
// keyboard support, collapsible side panes with expand strips, optional
// localStorage persistence, and stacked fallback below a breakpoint.
// Panes own their internal scroll (flex column, min-h-0, overflow hidden);
// slot content is responsible for its own scroll regions.

const STACK_QUERIES: Record<Exclude<ThreePaneStackBelow, false>, string> = {
  sm: '(max-width: 639.98px)',
  md: '(max-width: 767.98px)',
  lg: '(max-width: 1023.98px)',
};

function useStacked(stackBelow: ThreePaneStackBelow): boolean {
  const query = stackBelow === false ? '' : STACK_QUERIES[stackBelow];
  const [stacked, setStacked] = useState<boolean>(
    () => query !== '' && typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (query === '' || typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    setStacked(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setStacked(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return query === '' ? false : stacked;
}

function toPanePx(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampPane(px: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, px));
}

interface PersistedPaneState {
  lw?: number;
  rw?: number;
  lc?: boolean;
  rc?: boolean;
}

function readPersistedPaneState(storageKey: string | undefined): PersistedPaneState {
  if (!storageKey || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const data = JSON.parse(raw) as PersistedPaneState;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

type PaneSide = 'left' | 'right';

export function ThreePaneLayout({
  left,
  center,
  right,
  leftWidth,
  rightWidth,
  defaultLeftWidth = 280,
  defaultRightWidth = 320,
  minLeftWidth = 200,
  maxLeftWidth = 560,
  minRightWidth = 200,
  maxRightWidth = 560,
  onLeftWidthChange,
  onRightWidthChange,
  leftCollapsed,
  rightCollapsed,
  defaultLeftCollapsed = false,
  defaultRightCollapsed = false,
  onLeftCollapsedChange,
  onRightCollapsedChange,
  collapsibleLeft = true,
  collapsibleRight = true,
  leftAriaLabel = 'Left panel',
  centerAriaLabel,
  rightAriaLabel = 'Right panel',
  storageKey,
  resizable = true,
  barePanes = false,
  paneGap = true,
  stackBelow = 'lg',
  className = '',
  leftClassName = '',
  centerClassName = '',
  rightClassName = '',
}: ThreePaneLayoutProps) {
  const stacked = useStacked(stackBelow);
  const leftControlled = onLeftWidthChange !== undefined;
  const rightControlled = onRightWidthChange !== undefined;
  const leftCollapseControlled = onLeftCollapsedChange !== undefined;
  const rightCollapseControlled = onRightCollapsedChange !== undefined;

  const [internalLW, setInternalLW] = useState<number>(() => {
    const persisted = readPersistedPaneState(leftControlled ? undefined : storageKey);
    return clampPane(
      persisted.lw ?? toPanePx(leftWidth ?? defaultLeftWidth, 280),
      minLeftWidth,
      maxLeftWidth,
    );
  });
  const [internalRW, setInternalRW] = useState<number>(() => {
    const persisted = readPersistedPaneState(rightControlled ? undefined : storageKey);
    return clampPane(
      persisted.rw ?? toPanePx(rightWidth ?? defaultRightWidth, 320),
      minRightWidth,
      maxRightWidth,
    );
  });
  const [internalLC, setInternalLC] = useState<boolean>(() => {
    const persisted = readPersistedPaneState(leftCollapseControlled ? undefined : storageKey);
    return persisted.lc ?? leftCollapsed ?? defaultLeftCollapsed;
  });
  const [internalRC, setInternalRC] = useState<boolean>(() => {
    const persisted = readPersistedPaneState(rightCollapseControlled ? undefined : storageKey);
    return persisted.rc ?? rightCollapsed ?? defaultRightCollapsed;
  });

  const lw = leftControlled ? clampPane(toPanePx(leftWidth, 280), minLeftWidth, maxLeftWidth) : internalLW;
  const rw = rightControlled
    ? clampPane(toPanePx(rightWidth, 320), minRightWidth, maxRightWidth)
    : internalRW;
  const lc = leftCollapseControlled ? (leftCollapsed ?? false) : internalLC;
  const rc = rightCollapseControlled ? (rightCollapsed ?? false) : internalRC;

  const persist = useCallback(
    (patch: PersistedPaneState) => {
      if (!storageKey || typeof window === 'undefined') return;
      try {
        const prev = readPersistedPaneState(storageKey);
        window.localStorage.setItem(storageKey, JSON.stringify({ ...prev, ...patch }));
      } catch {
        /* best-effort persistence only */
      }
    },
    [storageKey],
  );

  const setLW = useCallback(
    (px: number) => {
      const next = clampPane(px, minLeftWidth, maxLeftWidth);
      if (!leftControlled) {
        setInternalLW(next);
        persist({ lw: next });
      }
      onLeftWidthChange?.(next);
    },
    [leftControlled, minLeftWidth, maxLeftWidth, onLeftWidthChange, persist],
  );
  const setRW = useCallback(
    (px: number) => {
      const next = clampPane(px, minRightWidth, maxRightWidth);
      if (!rightControlled) {
        setInternalRW(next);
        persist({ rw: next });
      }
      onRightWidthChange?.(next);
    },
    [rightControlled, minRightWidth, maxRightWidth, onRightWidthChange, persist],
  );
  const setLC = useCallback(
    (collapsed: boolean) => {
      if (!leftCollapseControlled) {
        setInternalLC(collapsed);
        persist({ lc: collapsed });
      }
      onLeftCollapsedChange?.(collapsed);
    },
    [leftCollapseControlled, onLeftCollapsedChange, persist],
  );
  const setRC = useCallback(
    (collapsed: boolean) => {
      if (!rightCollapseControlled) {
        setInternalRC(collapsed);
        persist({ rc: collapsed });
      }
      onRightCollapsedChange?.(collapsed);
    },
    [rightCollapseControlled, onRightCollapsedChange, persist],
  );

  // Latest widths for drag math (closures outlive re-renders mid-drag).
  const widthsRef = useRef({ lw, rw });
  widthsRef.current = { lw, rw };

  const startDrag = useCallback(
    (side: PaneSide, clientX: number) => {
      const base = side === 'left' ? widthsRef.current.lw : widthsRef.current.rw;
      const onMove = (event: MouseEvent) => {
        const dx = event.clientX - clientX;
        if (side === 'left') setLW(base + dx);
        else setRW(base - dx);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [setLW, setRW],
  );

  const adjustSide = useCallback(
    (side: PaneSide, delta: number) => {
      if (side === 'left') setLW(widthsRef.current.lw + delta);
      else setRW(widthsRef.current.rw + delta);
    },
    [setLW, setRW],
  );

  const onSeparatorKeyDown = (side: PaneSide) => (event: React.KeyboardEvent) => {
    // Arrows move the boundary: Left shrinks the left-anchored side.
    const step = event.shiftKey ? 64 : 16;
    const grow = side === 'left' ? 1 : -1;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      adjustSide(side, grow * step);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      adjustSide(side, -grow * step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (side === 'left') setLW(minLeftWidth);
      else setRW(minRightWidth);
    } else if (event.key === 'End') {
      event.preventDefault();
      if (side === 'left') setLW(maxLeftWidth);
      else setRW(maxRightWidth);
    }
  };

  const renderSeparator = (side: PaneSide) => {
    const label = side === 'left' ? leftAriaLabel : rightAriaLabel;
    const value = Math.round(side === 'left' ? lw : rw);
    const min = side === 'left' ? minLeftWidth : minRightWidth;
    const max = side === 'left' ? maxLeftWidth : maxRightWidth;
    const collapsible = side === 'left' ? collapsibleLeft : collapsibleRight;
    return (
      <div
        key={`${side}-separator`}
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label} resize handle${collapsible ? ' (double-click to hide)' : ''}`}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onMouseDown={(event) => startDrag(side, event.clientX)}
        onKeyDown={onSeparatorKeyDown(side)}
        onDoubleClick={() => {
          if (!collapsible) return;
          if (side === 'left') setLC(true);
          else setRC(true);
        }}
        title={`${label} — drag or use arrow keys to resize${collapsible ? '; double-click to hide' : ''}`}
        className="group flex w-[9px] shrink-0 cursor-col-resize items-stretch justify-center focus:outline-none"
      >
        <div
          aria-hidden="true"
          className="w-[1px] bg-[var(--vestara-border-subtle)] transition-all group-hover:w-[3px] group-hover:bg-[var(--vestara-accent)] group-focus-visible:w-[3px] group-focus-visible:bg-[var(--vestara-border-focus)]"
        />
      </div>
    );
  };

  const renderExpandStrip = (side: PaneSide) => {
    const label = side === 'left' ? leftAriaLabel : rightAriaLabel;
    const edge = side === 'left' ? 'border-r' : 'border-l';
    const glyph = side === 'left' ? '›' : '‹';
    return (
      <button
        key={`${side}-expand`}
        type="button"
        onClick={() => (side === 'left' ? setLC(false) : setRC(false))}
        aria-label={`Expand ${label}`}
        title={`Expand ${label}`}
        className={`grid w-9 shrink-0 place-items-center border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)] ${edge}`}
      >
        <span aria-hidden="true">{glyph}</span>
      </button>
    );
  };

  const showLeft = left !== undefined && left !== null && (!lc || stacked);
  const showRight = right !== undefined && right !== null && (!rc || stacked);
  const leftExpandable = left !== undefined && left !== null && lc && !stacked && collapsibleLeft;
  const rightExpandable = right !== undefined && right !== null && rc && !stacked && collapsibleRight;

  // Bare panes carry no chrome of their own (transparent, rounded to match
  // card content); otherwise rails get the panel background + edge borders.
  const leftChrome = barePanes
    ? 'rounded-[var(--vestara-radius-lg)] bg-transparent'
    : 'border-r border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]';
  const rightChrome = barePanes
    ? 'rounded-[var(--vestara-radius-lg)] bg-transparent'
    : 'border-l border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]';
  const centerChrome = barePanes ? 'bg-transparent' : 'bg-[var(--vestara-surface-canvas)]';

  return (
    <div
      className={`flex h-full min-h-0 w-full min-w-0 flex-1 ${stacked ? 'flex-col' : 'flex-row'} ${paneGap ? 'gap-[var(--vestara-spacing-section)]' : ''} ${className}`}
    >
      {showLeft && (
        <div
          aria-label={leftAriaLabel}
          style={stacked ? undefined : { width: `${lw}px` }}
          className={`flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden ${stacked ? 'border-b' : ''} ${leftChrome} ${leftClassName}`}
        >
          {left}
        </div>
      )}
      {leftExpandable && renderExpandStrip('left')}
      {left !== undefined && left !== null && !lc && !stacked && resizable && renderSeparator('left')}
      <div
        aria-label={centerAriaLabel}
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${centerChrome} ${centerClassName}`}
      >
        {center}
      </div>
      {right !== undefined && right !== null && !rc && !stacked && resizable && renderSeparator('right')}
      {rightExpandable && renderExpandStrip('right')}
      {showRight && (
        <div
          aria-label={rightAriaLabel}
          style={stacked ? undefined : { width: `${rw}px` }}
          className={`flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden ${stacked ? 'border-t' : ''} ${rightChrome} ${rightClassName}`}
        >
          {right}
        </div>
      )}
    </div>
  );
}

// ─── Page Component ────────────────────────────────────────────

export function Page({ children, className = '' }: PageProps) {
  return <div className={`flex flex-col h-full ${className}`}>{children}</div>;
}

// ─── PageHeader Component ──────────────────────────────────────

export function PageHeader({ children, className = '' }: PageHeaderProps) {
  return (
    <div
      className={`shrink-0 px-6 py-4 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] ${className}`}
    >
      {children}
    </div>
  );
}

// ─── PageTitle Component ───────────────────────────────────────

export function PageTitle({ children, className = '' }: PageTitleProps) {
  return <h1 className={`text-xl font-semibold text-[var(--vestara-text-primary)] ${className}`}>{children}</h1>;
}

// ─── PageActions Component ─────────────────────────────────────

export function PageActions({ children, className = '' }: PageActionsProps) {
  return <div className={`flex items-center gap-2 ${className}`}>{children}</div>;
}
