import { Maximize2, Minus, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { RESIZE_HANDLES } from '../lib/desktop.fixtures';
import type { WinData } from '../lib/types';

type Props = {
  data: WinData;
  isFocused: boolean;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onUpdate: (id: string, patch: Partial<WinData>) => void;
  children: React.ReactNode;
};

export function VestaraWindow({ data, isFocused, onFocus, onClose, onMinimize, onUpdate, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [resize, setResize] = useState<{
    dir: string;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    sx0: number;
    sy0: number;
  } | null>(null);

  const onHeaderDown = (e: React.MouseEvent) => {
    onFocus(data.id);
    setDrag({ dx: e.clientX - data.x, dy: e.clientY - data.y });
  };

  const onHeaderKeyDown = (e: React.KeyboardEvent) => {
    const step = 10;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;
    e.preventDefault();
    onFocus(data.id);
    onUpdate(data.id, {
      x: Math.max(0, Math.min(window.innerWidth - 100, data.x + dx)),
      // Container-relative coords: the window layer starts below the TopBar,
      // so y=0 is flush with the TopBar's bottom edge (the layer clips above it).
      y: Math.max(0, Math.min(window.innerHeight - 60, data.y + dy)),
    });
  };

  const onResizeDown = (e: React.MouseEvent, dir: string) => {
    e.stopPropagation();
    onFocus(data.id);
    setResize({ dir, sx: e.clientX, sy: e.clientY, sw: data.w, sh: data.h, sx0: data.x, sy0: data.y });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag) {
        const nx = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - drag.dx));
        // Container-relative coords: the window layer starts below the TopBar,
        // so y=0 is flush with the TopBar's bottom edge (the layer clips above it).
        const ny = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.dy));
        onUpdate(data.id, { x: nx, y: ny });
      }
      if (resize) {
        let nw = resize.sw;
        let nh = resize.sh;
        let nx = resize.sx0;
        let ny = resize.sy0;
        const dx = e.clientX - resize.sx;
        const dy = e.clientY - resize.sy;
        if (resize.dir.includes('e')) nw = Math.max(320, resize.sw + dx);
        if (resize.dir.includes('s')) nh = Math.max(220, resize.sh + dy);
        if (resize.dir.includes('w')) {
          nw = Math.max(320, resize.sw - dx);
          nx = resize.sx0 + dx;
        }
        if (resize.dir.includes('n')) {
          nh = Math.max(220, resize.sh - dy);
          ny = resize.sy0 + dy;
        }
        onUpdate(data.id, { x: nx, y: ny, w: nw, h: nh });
      }
    };
    const onUp = () => {
      setDrag(null);
      setResize(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, resize, data.id, onUpdate]);

  if (data.minimized) return null;

  // Maximized fills the window layer: flush with the TopBar (top: 0) and
  // keeping the 48px floating-dock clearance at the bottom.
  const style: React.CSSProperties = data.maximized
    ? { left: 0, top: 0, width: '100%', height: 'calc(100% - 48px)', zIndex: data.z }
    : { left: data.x, top: data.y, width: data.w, height: data.h, zIndex: data.z };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={data.title}
      onMouseDown={() => onFocus(data.id)}
      className={`absolute rounded-[var(--vestara-radius-xl)] overflow-hidden flex flex-col select-none ${isFocused ? 'border-[var(--vestara-accent-shell)]/40 shadow-[var(--vestara-elevation-shell-focus)]' : 'border-[var(--vestara-border-shell)] shadow-[var(--vestara-elevation-shell-float)]'} border bg-[var(--vestara-surface-shell-panel)]`}
      style={style}
    >
      {/* Header 36px small clean */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: window-chrome drag handle — mouse drag plus arrow-key move on the same focusable element (role=button would nest the traffic-light buttons) */}
      <div
        onMouseDown={onHeaderDown}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable drag handle with arrow-key support (see header ignore above)
        tabIndex={0}
        title={`Move ${data.title} with arrow keys`}
        onKeyDown={onHeaderKeyDown}
        onDoubleClick={() => {
          if (data.maximized) {
            onUpdate(data.id, { maximized: false, ...data.prev });
          } else {
            onUpdate(data.id, { maximized: true, prev: { x: data.x, y: data.y, w: data.w, h: data.h } });
          }
        }}
        className="h-[36px] shrink-0 bg-[var(--vestara-surface-shell-raised)] border-b border-[var(--vestara-border-shell)] flex items-center px-2.5 gap-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Close ${data.title}`}
            onClick={() => onClose(data.id)}
            className="w-3 h-3 rounded-full bg-[var(--vestara-status-shell-danger)] hover:brightness-110 flex items-center justify-center"
          >
            <X size={7} className="text-[var(--vestara-color-shell-ink)]/60 opacity-0 hover:opacity-100" />
          </button>
          <button
            type="button"
            aria-label={`Minimize ${data.title}`}
            onClick={() => onMinimize(data.id)}
            className="w-3 h-3 rounded-full bg-[var(--vestara-status-shell-warning)] flex items-center justify-center"
          >
            <Minus size={7} className="text-[var(--vestara-color-shell-ink)]/60 opacity-0 hover:opacity-100" />
          </button>
          <button
            type="button"
            aria-label={data.maximized ? `Restore ${data.title}` : `Maximize ${data.title}`}
            onClick={() => {
              if (data.maximized) onUpdate(data.id, { maximized: false, ...data.prev });
              else onUpdate(data.id, { maximized: true, prev: { x: data.x, y: data.y, w: data.w, h: data.h } });
            }}
            className="w-3 h-3 rounded-full bg-[var(--vestara-status-shell-success)] flex items-center justify-center"
          >
            <Maximize2 size={7} className="text-[var(--vestara-color-shell-ink)]/60 opacity-0 hover:opacity-100" />
          </button>
        </div>
        <div className="ml-2 flex items-center gap-2 min-w-0">
          <span className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)] truncate">
            {data.title}
          </span>
          {data.subtitle && (
            <span className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] truncate hidden sm:inline">
              {data.subtitle}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[length:var(--vestara-font-size-micro)] px-1.5 py-0.5 rounded-full bg-[var(--vestara-surface-shell-panel)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-muted)]">
            {data.type}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--vestara-surface-shell-panel)]/95 backdrop-blur-sm">{children}</div>

      <div className="h-[28px] shrink-0 bg-[var(--vestara-surface-shell-raised)] border-t border-[var(--vestara-border-shell)] flex items-center px-2.5 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)] font-mono">
        <span>
          {data.w}×{data.h}
        </span>
        <span className="mx-2 w-px h-3 bg-[var(--vestara-border-shell)]" />
        <span>z:{data.z}</span>
        <span className="ml-auto">Vestara Shell • 112 FINAL</span>
      </div>

      {/* resize handles — pointer-only affordances; keyboard resize parity via header arrow-key move */}
      {RESIZE_HANDLES.map((dir) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: invisible pointer hit-areas, not keyboard stops
        <div
          key={dir}
          onMouseDown={(e) => onResizeDown(e, dir)}
          className={`absolute ${dir.includes('n') ? 'top-0' : dir.includes('s') ? 'bottom-0' : 'top-1/2'} ${dir.includes('w') ? 'left-0' : dir.includes('e') ? 'right-0' : 'left-1/2'} ${dir.length === 1 ? (dir === 'n' || dir === 's' ? 'w-full h-1 cursor-ns-resize' : 'h-full w-1 cursor-ew-resize') : 'w-3 h-3 cursor-nwse-resize'} z-20`}
        />
      ))}
    </div>
  );
}
