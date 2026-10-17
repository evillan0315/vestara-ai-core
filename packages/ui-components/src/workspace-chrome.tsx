/**
 * @vestara/ui-components — Workspace chrome (drawers, modal, cards).
 *
 * Promoted from apps/workspace reusable surfaces so every host shares one
 * accessible contract instead of re-implementing it per page:
 * - `Drawer` ← apps/workspace/src/components/ui/Drawer.tsx (MUI size icons
 *   replaced with the vendored Size* set; window access SSR-guarded)
 * - `DrawerMenu` ← apps/workspace/src/components/ui/DrawerMenu.tsx
 *   (`bg-zinc-900` normalised to the panel token)
 * - `Modal` ← apps/workspace/src/components/ui/VestaraModal.tsx
 * - `OperationalPanel` ← WorkspaceOperationalPanel + DashboardPanel +
 *   SectionCard merged, minus the host-only grammars (st-*, mpg-*, router):
 *   the layered accent-wash surface is re-expressed with token-bound
 *   Tailwind so no host stylesheet is required
 * - `StatCard` / `ProgressBar` ← de-duplicated from operations.tsx +
 *   ProjectsUtils.tsx (hex defaults normalised to status/text tokens)
 *
 * Every visual value resolves through `var(--vestara-*)`. No raw hex,
 * no host CSS imports, no router imports.
 */

import { Z_INDEX } from '@vestara/ui-tokens';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SizeFull, SizeLarge, SizeMedium, SizeNormal, X } from './icons.js';
import { cn } from './utils.js';

// ─── Drawer ─────────────────────────────────────────────────────

export type DrawerSize = 'normal' | 'medium' | 'large' | 'full';
export type DrawerPosition = 'left' | 'right' | 'bottom' | 'top';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Panel title rendered in the header. */
  title?: string;
  position?: DrawerPosition;
  defaultSize?: DrawerSize;
  /** Persist a dragged custom size to localStorage under this key. */
  storageKey?: string;
  /** Extra header content rendered next to the title. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  /**
   * Render the drawer into document.body via createPortal so it sits in the
   * root stacking context — above sticky headers and overflow containers.
   */
  portal?: boolean;
  /**
   * Hide the dimming overlay (non-modal drawer): clicks pass through to the
   * page around the panel, and clicking outside no longer closes it.
   */
  hideBackdrop?: boolean;
  /** Keep the surface mounted while hidden so session state survives close. */
  keepMounted?: boolean;
}

/** 0 means "full" (100% of the viewport dimension). */
const DRAWER_PRESETS: Record<DrawerPosition, Record<DrawerSize, number>> = {
  left: { normal: 360, medium: 480, large: 640, full: 0 },
  right: { normal: 360, medium: 480, large: 640, full: 0 },
  bottom: { normal: 256, medium: 336, large: 448, full: 0 },
  top: { normal: 256, medium: 336, large: 448, full: 0 },
};

const DRAWER_MIN_DIMENSION: Record<DrawerPosition, number> = {
  left: 280,
  right: 280,
  bottom: 160,
  top: 160,
};

const DRAWER_SIZE_OPTIONS: Array<{ id: DrawerSize; label: string; Icon: typeof SizeNormal }> = [
  { id: 'normal', label: 'Normal', Icon: SizeNormal },
  { id: 'medium', label: 'Medium', Icon: SizeMedium },
  { id: 'large', label: 'Large', Icon: SizeLarge },
  { id: 'full', label: 'Full', Icon: SizeFull },
];

function clampDrawer(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function viewportDimension(vertical: boolean): number {
  if (typeof window === 'undefined') return 1024;
  return vertical ? window.innerHeight : window.innerWidth;
}

export function Drawer({
  open,
  onClose,
  title,
  position = 'right',
  defaultSize = 'medium',
  storageKey,
  header,
  footer,
  children,
  panelClassName = '',
  bodyClassName = '',
  portal = false,
  hideBackdrop = false,
  keepMounted = false,
}: DrawerProps) {
  const [preset, setPreset] = useState<DrawerSize>(defaultSize);
  const [customPx, setCustomPx] = useState<number | null>(null);
  const [livePx, setLivePx] = useState<number | null>(null);

  const vertical = position === 'bottom' || position === 'top';
  const viewport = viewportDimension(vertical);

  const presetPx = DRAWER_PRESETS[position][preset];
  const effectivePx = livePx ?? customPx ?? (presetPx === 0 ? viewport : presetPx);

  const activeSize = useMemo<DrawerSize>(() => {
    let best: DrawerSize = 'normal';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const option of DRAWER_SIZE_OPTIONS) {
      const px = DRAWER_PRESETS[position][option.id] === 0 ? viewport : DRAWER_PRESETS[position][option.id];
      const distance = Math.abs(px - effectivePx);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = option.id;
      }
    }
    return best;
  }, [position, effectivePx, viewport]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(`vestara:drawer:${storageKey}`);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) setCustomPx(parsed);
      }
    } catch {
      // storage unavailable — fall back to the default size
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || customPx === null) return;
    try {
      window.localStorage.setItem(`vestara:drawer:${storageKey}`, String(customPx));
    } catch {
      // storage unavailable — size simply won't persist
    }
  }, [storageKey, customPx]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const beginResize = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startDimension = effectivePx;
    const startX = event.clientX;
    const startY = event.clientY;
    let last = startDimension;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = vertical
        ? position === 'top'
          ? moveEvent.clientY - startY
          : startY - moveEvent.clientY
        : position === 'right'
          ? startX - moveEvent.clientX
          : moveEvent.clientX - startX;
      last = clampDrawer(startDimension + delta, DRAWER_MIN_DIMENSION[position], viewport);
      setLivePx(last);
    };
    const onUp = () => {
      setLivePx(null);
      setCustomPx(last);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  if (!open && !keepMounted) return null;

  const dimensionStyle = vertical ? { height: `${effectivePx}px` } : { width: `${effectivePx}px` };
  const positionClasses =
    position === 'left'
      ? 'left-0 top-0 h-full border-r border-(--vestara-accent-border)'
      : position === 'right'
        ? 'right-0 top-0 h-full border-l border-(--vestara-accent-border)'
        : position === 'top'
          ? 'left-0 top-0 w-full border-b border-(--vestara-accent-border)'
          : 'bottom-0 left-0 w-full border-t border-(--vestara-accent-border)';
  const handleClasses = vertical
    ? position === 'top'
      ? 'absolute -bottom-1 left-0 z-10 h-2 w-full cursor-row-resize'
      : 'absolute -top-1 left-0 z-10 h-2 w-full cursor-row-resize'
    : position === 'right'
      ? 'absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize'
      : 'absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize';

  const drawerContent = (
    <div
      className={`fixed inset-0 ${hideBackdrop ? 'pointer-events-none' : ''} ${open ? '' : 'invisible'}`}
      style={{ zIndex: Number(Z_INDEX.modal) }}
    >
      {!hideBackdrop && (
        <div className="absolute inset-0 bg-(--vestara-surface-overlay)" onClick={onClose} aria-hidden="true" />
      )}
      <div
        role="dialog"
        aria-modal={!hideBackdrop}
        aria-label={title ?? 'Drawer'}
        className={`absolute flex flex-col overflow-hidden bg-(--vestara-surface) shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6),0_0_0_1px_var(--vestara-accent-bg),0_0_24px_-8px_var(--vestara-accent-bg),inset_0_1px_0_color-mix(in_srgb,var(--vestara-accent-light)_8%,transparent)] ${hideBackdrop ? 'pointer-events-auto' : ''} ${positionClasses} ${panelClassName}`}
        style={dimensionStyle}
      >
        <div className={handleClasses} onPointerDown={beginResize} title="Resize drawer" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-(--vestara-accent-border) bg-[color-mix(in_srgb,var(--vestara-accent)_6%,transparent)] px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            {title && <h2 className="truncate text-sm font-semibold text-(--vestara-text)">{title}</h2>}
            {header}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <fieldset className="flex items-center gap-0.5 rounded-lg border border-(--vestara-accent-border) p-0.5">
              <legend className="sr-only">Drawer size</legend>
              {DRAWER_SIZE_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={activeSize === id}
                  aria-label={`Drawer size: ${label}`}
                  title={label}
                  onClick={() => {
                    setPreset(id);
                    setCustomPx(null);
                    setLivePx(null);
                  }}
                  className={cn(
                    'grid size-7 cursor-pointer place-items-center rounded-md transition-colors',
                    activeSize === id
                      ? 'bg-(--vestara-accent-text)/15 text-(--vestara-accent-text)'
                      : 'text-(--vestara-text-muted) hover:text-(--vestara-text-2)',
                  )}
                >
                  <Icon size={16} aria-hidden="true" />
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-(--vestara-text-2) transition-colors hover:text-(--vestara-text)"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-(--vestara-accent-border) bg-[color-mix(in_srgb,var(--vestara-accent)_6%,transparent)] p-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (portal && typeof document !== 'undefined') return createPortal(drawerContent, document.body);
  return drawerContent;
}

// ─── DrawerMenu ─────────────────────────────────────────────────

export interface DrawerMenuAction {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export interface DrawerMenuProps {
  actions: DrawerMenuAction[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Compact vertical ⋮ menu for drawer headers, with keyboard navigation. */
export function DrawerMenu({ actions, onSelect, disabled = false, className = '' }: DrawerMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleActions = actions.filter((action) => !action.divider);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!open) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
        }
        return;
      }
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % visibleActions.length);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((index) => (index - 1 + visibleActions.length) % visibleActions.length);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (activeIndex >= 0 && visibleActions[activeIndex]) {
            onSelect(visibleActions[activeIndex].id);
            setOpen(false);
            setActiveIndex(-1);
          }
          break;
        case 'Escape':
          event.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          break;
        default:
          break;
      }
    },
    [open, activeIndex, visibleActions, onSelect],
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Drawer options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-(--vestara-text-muted) transition-colors hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Drawer options"
          className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-(--vestara-accent-border) bg-(--vestara-surface-panel) py-1 shadow-lg"
        >
          {actions.map((action) => {
            if (action.divider) {
              return <div key={`divider-${action.id}`} className="my-1 border-t border-(--vestara-accent-border)" />;
            }
            const visibleIndex = visibleActions.indexOf(action);
            const checkable = action.checked !== undefined;
            return (
              <button
                key={action.id}
                type="button"
                role={checkable ? 'menuitemcheckbox' : 'menuitem'}
                {...(checkable ? { 'aria-checked': action.checked } : {})}
                disabled={action.disabled}
                onClick={() => {
                  onSelect(action.id);
                  setOpen(false);
                  setActiveIndex(-1);
                }}
                onMouseEnter={() => setActiveIndex(visibleIndex)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  visibleIndex === activeIndex
                    ? 'bg-(--vestara-accent-bg) text-(--vestara-text)'
                    : 'text-(--vestara-text-2) hover:bg-(--vestara-accent-bg)',
                  action.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="w-3 text-center">
                  {action.checked && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                  )}
                </span>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────

export interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  /** Sizing/behavior classes appended to the panel (default `max-w-md`). */
  className?: string;
  /** Render the primary accent bar along the top edge. Default true. */
  accentBar?: boolean;
  /** Accessible name for the dialog. */
  ariaLabel?: string;
}

/**
 * Global modal shell: focus-trapped dialog with Escape/backdrop close and
 * focus restoration. The panel is a translucent accent gradient over the
 * theme surface, framed by the accent bar and border.
 */
export function Modal({ onClose, children, className = 'max-w-md', accentBar = true, ariaLabel }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel)?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay backdrop — the dialog child carries role/aria; the backdrop only dismisses on direct clicks.
    <div
      className="fixed inset-0 flex items-center justify-center bg-(--vestara-surface-overlay) p-4 backdrop-blur-sm"
      style={{ zIndex: Number(Z_INDEX.modal) }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border border-(--vestara-accent-border) shadow-[0_32px_96px_-16px_rgba(0,0,0,0.6),0_0_0_1px_var(--vestara-accent-bg),0_0_32px_-8px_var(--vestara-accent-bg),inset_0_1px_0_color-mix(in_srgb,var(--vestara-accent-light)_10%,transparent)]',
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          background:
            'linear-gradient(165deg, color-mix(in srgb, var(--vestara-accent) 8%, transparent), transparent 55%), var(--vestara-surface)',
        }}
      >
        {accentBar && (
          <div className="h-1 bg-[linear-gradient(90deg,var(--vestara-accent),var(--vestara-accent-dark))]" />
        )}
        {children}
      </div>
    </div>
  );
}

// ─── OperationalPanel (card) ────────────────────────────────────

export type OperationalPanelTone = 'accent' | 'info';

export interface OperationalPanelProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  tone?: OperationalPanelTone;
  /** Stretch to fill the parent height (column layout). */
  fill?: boolean;
  /** Fix the body height with internal scroll (panel owns max-height). */
  scrollable?: boolean;
}

/**
 * Shared operational card: icon + title + optional description + header
 * actions over a layered accent-wash surface. Replaces the host-only
 * SectionCard/DashboardPanel/WorkspaceOperationalPanel trio (which bind
 * st-*, mpg-*, and router grammars) with a dependency-free equivalent —
 * every wash derives from `var(--vestara-*)` so both modes follow.
 */
export function OperationalPanel({
  icon,
  title,
  description,
  children,
  className = '',
  actions,
  tone = 'accent',
  fill = false,
  scrollable = false,
}: OperationalPanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'relative isolate min-w-0 overflow-hidden rounded-[var(--vestara-radius-lg)] border border-(--vestara-accent-border)',
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-[1] before:h-px before:bg-[linear-gradient(to_right,transparent,color-mix(in_srgb,var(--vestara-accent)_38%,transparent),transparent)] before:content-[""]',
        fill && 'flex h-full min-w-0 flex-col',
        className,
      )}
      style={{
        background:
          'radial-gradient(120% 75% at 50% 0%, color-mix(in srgb, var(--vestara-accent) 10%, transparent) 0%, transparent 58%), var(--vestara-surface-panel)',
        boxShadow:
          '0 20px 48px rgba(0, 0, 0, 0.45), 0 0 28px color-mix(in srgb, var(--vestara-accent) 7%, transparent), inset 0 1px 0 var(--vestara-surface-sheen)',
      }}
    >
      <header className="flex min-w-0 items-start gap-2 border-b border-(--vestara-accent-border) px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-element)]">
        {icon && (
          <span
            aria-hidden="true"
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-[var(--vestara-radius)] border [&_svg]:size-5',
              tone === 'info'
                ? 'border-[color-mix(in_srgb,var(--vestara-status-info)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-status-info)_12%,transparent)] text-[var(--vestara-status-info)]'
                : 'border-[color-mix(in_srgb,var(--vestara-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-accent)_12%,transparent)] text-[var(--vestara-accent-text)]',
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="text-[length:var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]"
          >
            {title}
          </h2>
          {description && (
            <p
              title={description}
              className="mt-[var(--vestara-spacing-1)] block max-w-2xl truncate text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-muted)]"
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className={cn('p-[var(--vestara-spacing-section)]', scrollable && 'min-h-0 flex-1 overflow-y-auto')}>
        {children}
      </div>
    </section>
  );
}

// ─── StatCard + ProgressBar ─────────────────────────────────────

export interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  /** Accent edge/value color — a token reference. Defaults to the disabled tone. */
  accent?: string;
  compact?: boolean;
}

/** Label/value/sub metric card with an accent edge. De-duplicates the two workspace copies. */
export function StatCard({ label, value, sub, accent = 'var(--vestara-text-disabled)', compact }: StatCardProps) {
  return (
    <div
      className={cn(
        'border-(--vestara-accent-border) bg-(--vestara-accent-bg) rounded-lg border border-l-2 text-center',
        compact ? 'p-1.5' : 'p-2',
      )}
      style={{ borderLeftColor: accent }}
    >
      <div
        className={cn('font-bold', compact ? 'text-xs' : 'text-lg')}
        style={{ color: Number(value) > 0 ? accent : 'var(--vestara-text-disabled)' }}
      >
        {value}
      </div>
      <div className="text-[length:var(--vestara-font-size-xs)] text-(--vestara-text-muted)">{label}</div>
      {sub && <div className="mt-0.5 text-[length:var(--vestara-font-size-xs)] text-(--vestara-text-muted)">{sub}</div>}
    </div>
  );
}

export type ProgressBarSize = 'sm' | 'md' | 'lg';

export interface ProgressBarProps {
  /** Percent complete (clamped to 100). */
  pct: number;
  size?: ProgressBarSize;
}

/** Thin progress bar; fill follows the status scale by completion band. */
export function ProgressBar({ pct, size = 'sm' }: ProgressBarProps) {
  const height = size === 'lg' ? 'h-2' : size === 'md' ? 'h-1.5' : 'h-1';
  const color =
    pct >= 70
      ? 'var(--vestara-status-success)'
      : pct >= 30
        ? 'var(--vestara-status-warning)'
        : 'var(--vestara-status-error)';
  return (
    <div className={cn('w-full rounded-full bg-(--vestara-accent-bg)', height)}>
      <div
        className={cn(height, 'rounded-full transition-all')}
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
