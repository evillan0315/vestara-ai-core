import type { ReactNode } from 'react';

export default function Section({
  title,
  icon,
  accent = '#f59e0b',
  children,
  collapsible,
  collapsed,
  onToggle,
  action,
  dragSection,
  style,
}: {
  title: string;
  icon?: string;
  accent?: string;
  children: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  dragSection?: {
    id: string;
    isDragOver: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`${dragSection?.isDragOver ? 'ring-2 ring-dashed ring-accent rounded-lg' : ''}`}
      onDragOver={dragSection?.onDragOver}
      onDragLeave={dragSection?.onDragLeave}
      onDrop={dragSection?.onDrop}
    >
      <div className="flex items-center gap-1.5 mb-3 group" onClick={() => collapsible && onToggle?.()}>
        {dragSection && (
          <span
            draggable
            onDragStart={dragSection.onDragStart}
            onDragEnd={dragSection.onDragEnd}
            className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-300 shrink-0 transition-colors select-none opacity-40 hover:opacity-100 leading-none py-1 px-0.5 -ml-1 rounded hover:bg-zinc-800/50"
            title="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs">⠿</span>
          </span>
        )}
        <span className="w-1 h-3.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
        <h2 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-widest">
          {icon ? `${icon} ` : ''}
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
        {collapsible && (
          <span
            className={`text-[9px] text-zinc-700 ml-auto transition-transform cursor-pointer ${collapsed ? '' : 'rotate-180'}`}
          >
            ▾
          </span>
        )}
      </div>
      {(!collapsible || !collapsed) && children}
    </div>
  );
}
