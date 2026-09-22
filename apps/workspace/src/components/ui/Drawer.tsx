/**
 * Drawer — reusable, resizable slide-over panel.
 *
 * Anchored to the left, right, bottom, or top edge. The size can be set through
 * four presets (normal | medium | large | full) in the header, or by dragging
 * the resize handle. Custom (dragged) sizes persist to localStorage when a
 * `storageKey` is provided.
 *
 * When `portal` is true the drawer renders into document.body via
 * createPortal, placing it in the root stacking context so it always
 * paints above page-level sticky headers and other layout chrome.
 */

import AspectRatioOutlinedIcon from '@mui/icons-material/AspectRatioOutlined';
import CropLandscapeOutlinedIcon from '@mui/icons-material/CropLandscapeOutlined';
import CropSquareOutlinedIcon from '@mui/icons-material/CropSquareOutlined';
import FullscreenOutlinedIcon from '@mui/icons-material/FullscreenOutlined';
import { Z_INDEX } from '@vestara/ui-tokens';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

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
   * root stacking context — above sticky headers, page-level z-indexes, and
   * any overflow containers. Defaults to false for backward compatibility.
   */
  portal?: boolean;
  /**
   * Hide the dimming overlay (non-modal drawer): clicks pass through to the
   * page around the panel, and clicking outside no longer closes it —
   * close via the header button or Escape. Defaults to false.
   */
  hideBackdrop?: boolean;
}

/** 0 means "full" (100% of the viewport dimension). */
const PRESETS: Record<DrawerPosition, Record<DrawerSize, number>> = {
  left: { normal: 360, medium: 480, large: 640, full: 0 },
  right: { normal: 360, medium: 480, large: 640, full: 0 },
  bottom: { normal: 256, medium: 336, large: 448, full: 0 },
  top: { normal: 256, medium: 336, large: 448, full: 0 },
};

const MIN_DIMENSION: Record<DrawerPosition, number> = {
  left: 280,
  right: 280,
  bottom: 160,
  top: 160,
};

const SIZE_OPTIONS: Array<{ id: DrawerSize; label: string; Icon: typeof CropSquareOutlinedIcon }> = [
  { id: 'normal', label: 'Normal', Icon: CropSquareOutlinedIcon },
  { id: 'medium', label: 'Medium', Icon: CropLandscapeOutlinedIcon },
  { id: 'large', label: 'Large', Icon: AspectRatioOutlinedIcon },
  { id: 'full', label: 'Full', Icon: FullscreenOutlinedIcon },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
}: DrawerProps) {
  const [preset, setPreset] = useState<DrawerSize>(defaultSize);
  const [customPx, setCustomPx] = useState<number | null>(null);
  const [livePx, setLivePx] = useState<number | null>(null);
  const lastDragRef = useRef<number | null>(null);

  const vertical = position === 'bottom' || position === 'top';
  const viewport = vertical ? window.innerHeight : window.innerWidth;

  const presetPx = PRESETS[position][preset];
  const effectivePx = livePx ?? customPx ?? (presetPx === 0 ? viewport : presetPx);

  // The highlighted size button always reflects the effective dimension.
  const activeSize = useMemo<DrawerSize>(() => {
    let best: DrawerSize = 'normal';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const option of SIZE_OPTIONS) {
      const px = PRESETS[position][option.id] === 0 ? viewport : PRESETS[position][option.id];
      const distance = Math.abs(px - effectivePx);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = option.id;
      }
    }
    return best;
  }, [position, effectivePx, viewport]);

  // Restore a persisted custom size.
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

  // Persist dragged sizes (not preset selections).
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
      // Bottom-anchored panels grow upward; top-anchored panels grow downward.
      const delta = vertical
        ? position === 'top'
          ? moveEvent.clientY - startY
          : startY - moveEvent.clientY
        : position === 'right'
          ? startX - moveEvent.clientX
          : moveEvent.clientX - startX;
      last = clamp(startDimension + delta, MIN_DIMENSION[position], viewport);
      setLivePx(last);
    };
    const onUp = () => {
      lastDragRef.current = last;
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

  if (!open) return null;

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
      className={`fixed inset-0 ${hideBackdrop ? 'pointer-events-none' : ''}`}
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
            <div
              role="group"
              aria-label="Drawer size"
              className="flex items-center gap-0.5 rounded-lg border border-(--vestara-accent-border) p-0.5"
            >
              {SIZE_OPTIONS.map(({ id, label, Icon }) => (
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
                  className={`grid size-7 cursor-pointer place-items-center rounded-md transition-colors ${
                    activeSize === id
                      ? 'bg-(--vestara-accent-text)/15 text-(--vestara-accent-text)'
                      : 'text-(--vestara-text-muted) hover:text-(--vestara-text-2)'
                  }`}
                >
                  <Icon sx={{ fontSize: 16 }} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-(--vestara-text-2) transition-colors hover:text-(--vestara-text) cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-(--vestara-accent-border) bg-[color-mix(in_srgb,var(--vestara-accent)_6%,transparent)] p-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return portal ? createPortal(drawerContent, document.body) : drawerContent;
}

export default Drawer;
