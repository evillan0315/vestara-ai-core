import { Maximize2, Minus, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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

  const onResizeDown = (e: React.MouseEvent, dir: string) => {
    e.stopPropagation();
    onFocus(data.id);
    setResize({ dir, sx: e.clientX, sy: e.clientY, sw: data.w, sh: data.h, sx0: data.x, sy0: data.y });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag) {
        const nx = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - drag.dx));
        const ny = Math.max(32, Math.min(window.innerHeight - 60, e.clientY - drag.dy));
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

  const style: React.CSSProperties = data.maximized
    ? { left: 0, top: 32, width: '100%', height: 'calc(100% - 80px)', zIndex: data.z }
    : { left: data.x, top: data.y, width: data.w, height: data.h, zIndex: data.z };

  return (
    <div
      ref={ref}
      onMouseDown={() => onFocus(data.id)}
      className={`absolute rounded-[12px] overflow-hidden flex flex-col select-none ${isFocused ? 'border-[#2de8c3]/40 shadow-[0_0_0_1px_rgba(45,232,195,0.2),0_20px_60px_rgba(0,0,0,0.6)]' : 'border-[#1a3a3d] shadow-[0_20px_60px_rgba(0,0,0,0.5)]'} border bg-[#0d191b]`}
      style={style}
    >
      {/* Header 36px small clean */}
      <div
        onMouseDown={onHeaderDown}
        onDoubleClick={() => {
          if (data.maximized) {
            onUpdate(data.id, { maximized: false, ...data.prev });
          } else {
            onUpdate(data.id, { maximized: true, prev: { x: data.x, y: data.y, w: data.w, h: data.h } });
          }
        }}
        className="h-[36px] shrink-0 bg-[#111e20] border-b border-[#1a3a3d] flex items-center px-2.5 gap-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => onClose(data.id)}
            className="w-3 h-3 rounded-full bg-[#ff5a5a] hover:brightness-110 flex items-center justify-center"
          >
            <X size={7} className="text-black/60 opacity-0 hover:opacity-100" />
          </button>
          <button
            onClick={() => onMinimize(data.id)}
            className="w-3 h-3 rounded-full bg-[#facc15] flex items-center justify-center"
          >
            <Minus size={7} className="text-black/60 opacity-0 hover:opacity-100" />
          </button>
          <button
            onClick={() => {
              if (data.maximized) onUpdate(data.id, { maximized: false, ...data.prev });
              else onUpdate(data.id, { maximized: true, prev: { x: data.x, y: data.y, w: data.w, h: data.h } });
            }}
            className="w-3 h-3 rounded-full bg-[#4ade80] flex items-center justify-center"
          >
            <Maximize2 size={7} className="text-black/60 opacity-0 hover:opacity-100" />
          </button>
        </div>
        <div className="ml-2 flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-[#c8ddd9] truncate">{data.title}</span>
          {data.subtitle && (
            <span className="text-[10px] text-[#5a7a78] truncate hidden sm:inline">{data.subtitle}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#0d191b] border border-[#1a3a3d] text-[#5a7a78]">
            {data.type}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0d191b]/95 backdrop-blur-sm">{children}</div>

      <div className="h-[28px] shrink-0 bg-[#111e20] border-t border-[#1a3a3d] flex items-center px-2.5 text-[10px] text-[#5a7a78] font-mono">
        <span>
          {data.w}×{data.h}
        </span>
        <span className="mx-2 w-px h-3 bg-[#1a3a3d]" />
        <span>z:{data.z}</span>
        <span className="ml-auto">Vestara Shell • 112 FINAL</span>
      </div>

      {/* resize handles */}
      {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((dir) => (
        <div
          key={dir}
          onMouseDown={(e) => onResizeDown(e, dir)}
          className={`absolute ${dir.includes('n') ? 'top-0' : dir.includes('s') ? 'bottom-0' : 'top-1/2'} ${dir.includes('w') ? 'left-0' : dir.includes('e') ? 'right-0' : 'left-1/2'} ${dir.length === 1 ? (dir === 'n' || dir === 's' ? 'w-full h-1 cursor-ns-resize' : 'h-full w-1 cursor-ew-resize') : 'w-3 h-3 cursor-nwse-resize'} z-20`}
        />
      ))}
    </div>
  );
}
