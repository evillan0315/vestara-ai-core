import type { ReactNode } from 'react';

export type DashboardColumnId = string;

export interface DraggableDashboardColumn<T extends string> {
  id: DashboardColumnId;
  items: readonly T[];
}

export interface DraggableDashboardProps<T extends string> {
  columns: readonly DraggableDashboardColumn<T>[];
  renderItem: (id: T) => ReactNode;
  onMove: (column: DashboardColumnId, index: number, direction: -1 | 1) => void;
  onMoveAcross: (from: DashboardColumnId, fromIndex: number, to: DashboardColumnId, toIndex: number) => void;
  getItemLabel?: (id: T) => string;
  className?: string;
}

interface DraggableDashboardItemProps<T extends string> {
  id: T;
  column: DashboardColumnId;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: DraggableDashboardProps<T>['onMove'];
  onMoveAcross: DraggableDashboardProps<T>['onMoveAcross'];
  getItemLabel: (id: T) => string;
  children: ReactNode;
}

function DraggableDashboardItem<T extends string>({
  id,
  column,
  index,
  isFirst,
  isLast,
  onMove,
  onMoveAcross,
  getItemLabel,
  children,
}: DraggableDashboardItemProps<T>) {
  const label = getItemLabel(id);

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/vestara-dashboard-panel', id);
        event.dataTransfer.setData('text/vestara-dashboard-column', column);
        event.dataTransfer.setData('text/vestara-dashboard-index', String(index));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const dragged = event.dataTransfer.getData('text/vestara-dashboard-panel');
        if (dragged && dragged !== id) {
          const sourceColumn = event.dataTransfer.getData('text/vestara-dashboard-column');
          const sourceIndex = Number(event.dataTransfer.getData('text/vestara-dashboard-index'));
          if (sourceColumn && Number.isInteger(sourceIndex)) {
            if (sourceColumn === column) {
              onMove(column, sourceIndex, index > sourceIndex ? 1 : -1);
            } else {
              onMoveAcross(sourceColumn, sourceIndex, column, index);
            }
          }
        }
      }}
      className="group/dashboard-panel relative"
      role="group"
      aria-label={`${label} dashboard panel`}
    >
      <div className="absolute -top-2 right-2 z-[1] flex gap-1 opacity-0 transition-opacity group-hover/dashboard-panel:opacity-100 focus-within:opacity-100">
        <span
          className="cursor-grab rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-text-muted)]"
          title="Drag to rearrange"
        >
          ⠿
        </span>
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onMove(column, index, -1)}
          aria-label={`Move ${label} up`}
          title="Move up"
          className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 text-[10px] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)] disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onMove(column, index, 1)}
          aria-label={`Move ${label} down`}
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

/**
 * Reusable two-or-more-column dashboard layout with native drag and keyboard
 * controls. Consumers own persistence and item content; this component owns
 * interaction semantics and drag/drop coordination.
 */
export function DraggableDashboard<T extends string>({
  columns,
  renderItem,
  onMove,
  onMoveAcross,
  getItemLabel = (id) => id,
  className = '',
}: DraggableDashboardProps<T>) {
  return (
    <div className={`grid grid-cols-1 gap-[var(--vestara-spacing-section)] md:grid-cols-2 ${className}`}>
      {columns.map((column) => (
        <div
          key={column.id}
          className="min-w-0 space-y-[var(--vestara-spacing-section)]"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dragged = event.dataTransfer.getData('text/vestara-dashboard-panel');
            const sourceColumn = event.dataTransfer.getData('text/vestara-dashboard-column');
            const sourceIndex = Number(event.dataTransfer.getData('text/vestara-dashboard-index'));
            if (dragged && sourceColumn && Number.isInteger(sourceIndex) && sourceColumn !== column.id) {
              onMoveAcross(sourceColumn, sourceIndex, column.id, column.items.length);
            }
          }}
        >
          {column.items.map((id, index) => (
            <DraggableDashboardItem
              key={id}
              id={id}
              column={column.id}
              index={index}
              isFirst={index === 0}
              isLast={index === column.items.length - 1}
              onMove={onMove}
              onMoveAcross={onMoveAcross}
              getItemLabel={getItemLabel}
            >
              {renderItem(id)}
            </DraggableDashboardItem>
          ))}
        </div>
      ))}
    </div>
  );
}
