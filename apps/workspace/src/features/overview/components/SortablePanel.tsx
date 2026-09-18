/**
 * VES-OVERVIEW-001: Sortable panel wrapper.
 *
 * HTML5 drag-and-drop across the two Overview columns plus keyboard
 * move buttons (accessible rearrange without a pointer). Visual values
 * use only Vestara tokens.
 */

import { useRef, type ReactNode } from 'react';

interface SortablePanelProps {
  panelId: string;
  column: 'left' | 'right';
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (column: 'left' | 'right', index: number, dir: -1 | 1) => void;
  onDropOnColumn: (toColumn: 'left' | 'right', toIndex: number, panelId: string) => void;
  children: ReactNode;
}

export function SortablePanel({ panelId, column, index, isFirst, isLast, onMove, onDropOnColumn, children }: SortablePanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/vestara-panel', panelId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const dragged = e.dataTransfer.getData('text/vestara-panel');
        if (dragged) onDropOnColumn(column, index, dragged);
      }}
      className="group/panel relative"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 right-2 z-[1] flex gap-1 opacity-0 transition-opacity group-hover/panel:opacity-100 focus-within:opacity-100"
      >
        <span className="cursor-grab rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-text-muted)]" title="Drag to rearrange">
          ⠿
        </span>
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onMove(column, index, -1)}
          aria-label="Move panel up"
          title="Move up"
          className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)] disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onMove(column, index, 1)}
          aria-label="Move panel down"
          title="Move down"
          className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)] disabled:opacity-40"
        >
          ↓
        </button>
      </div>
      {children}
    </div>
  );
}
