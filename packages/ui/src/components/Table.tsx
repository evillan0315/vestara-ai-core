/**
 * VES-UI-C6: Table Component
 *
 * Domain-independent table component with sorting, selection, and empty states.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-C: Data Display (phases 6-8)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ReactNode, useCallback, useMemo, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc' | null;

export interface TableColumn<T> {
  /** Unique column identifier */
  id: string;

  /** Column header label */
  label: string;

  /** Column key in the data object */
  key: keyof T;

  /** Whether column is sortable */
  sortable?: boolean;

  /** Custom cell renderer */
  render?: (value: T[keyof T], row: T) => ReactNode;

  /** Column width (CSS value) */
  width?: string;

  /** Text alignment */
  align?: 'left' | 'center' | 'right';

  /** Whether column is hidden */
  hidden?: boolean;
}

export interface TableProps<T> {
  /** Table columns */
  columns: TableColumn<T>[];

  /** Table data */
  data: readonly T[];

  /** Unique key extractor for rows */
  keyExtractor: (row: T) => string;

  /** Whether to show row selection checkboxes */
  selectable?: boolean;

  /** Selected row keys */
  selectedKeys?: Set<string>;

  /** Selection change handler */
  onSelectionChange?: (keys: Set<string>) => void;

  /** Row click handler */
  onRowClick?: (row: T) => void;

  /** Empty state content */
  emptyContent?: ReactNode;

  /** Loading state */
  loading?: boolean;

  /** Custom class name */
  className?: string;

  /** Whether to show row hover effect */
  hoverable?: boolean;

  /** Whether to show row stripes */
  striped?: boolean;

  /** Whether to show border */
  bordered?: boolean;
}

// ─── Sort Icon ─────────────────────────────────────────────────

function SortIcon({ direction }: { direction: SortDirection }) {
  return (
    <span className="inline-flex flex-col ml-1 text-[var(--vestara-text-muted)]">
      <svg
        className={`w-3 h-3 ${direction === 'asc' ? 'text-[var(--vestara-accent-primary)]' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      <svg
        className={`w-3 h-3 -mt-1 ${direction === 'desc' ? 'text-[var(--vestara-accent-primary)]' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </span>
  );
}

// ─── Checkbox Component ────────────────────────────────────────

function Checkbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate ?? false;
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel)] text-[var(--vestara-accent-primary)] focus:ring-[var(--vestara-border-focus)] cursor-pointer"
    />
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => {
        const rowId = `row-${i}`;
        return (
          <tr key={rowId} className="border-b border-[var(--vestara-border-subtle)]">
            {Array.from({ length: cols }, (_, j) => {
              const cellId = `cell-${j}`;
              return (
                <td key={cellId} className="px-4 py-3">
                  <div className="h-4 bg-[var(--vestara-surface-interactive)] rounded animate-pulse" />
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

// ─── Main Table Component ──────────────────────────────────────

export function Table<T>({
  columns,
  data,
  keyExtractor,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  onRowClick,
  emptyContent,
  loading = false,
  className = '',
  hoverable = true,
  striped = false,
  bordered = false,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Visible columns
  const visibleColumns = useMemo(() => columns.filter((col) => !col.hidden), [columns]);

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortDirection]);

  // Sort handler
  const handleSort = useCallback(
    (columnId: string) => {
      if (sortKey === columnId) {
        if (sortDirection === 'asc') setSortDirection('desc');
        else if (sortDirection === 'desc') {
          setSortKey(null);
          setSortDirection(null);
        }
      } else {
        setSortKey(columnId);
        setSortDirection('asc');
      }
    },
    [sortKey, sortDirection],
  );

  // Selection handlers
  const allKeys = useMemo(() => data.map(keyExtractor), [data, keyExtractor]);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k));
  const someSelected = allKeys.some((k) => selectedKeys.has(k)) && !allSelected;

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!onSelectionChange) return;
      if (checked) {
        onSelectionChange(new Set(allKeys));
      } else {
        onSelectionChange(new Set());
      }
    },
    [allKeys, onSelectionChange],
  );

  const handleSelectRow = useCallback(
    (key: string, checked: boolean) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedKeys);
      if (checked) next.add(key);
      else next.delete(key);
      onSelectionChange(next);
    },
    [selectedKeys, onSelectionChange],
  );

  return (
    <div
      className={`overflow-x-auto rounded-xl border ${bordered ? 'border-[var(--vestara-border-default)]' : 'border-[var(--vestara-border-subtle)]'} ${className}`}
    >
      <table className="w-full text-sm">
        {/* Header */}
        <thead>
          <tr className="border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)]">
            {selectable && (
              <th className="w-10 px-3 py-2.5">
                <Checkbox checked={allSelected} indeterminate={someSelected} onChange={handleSelectAll} />
              </th>
            )}
            {visibleColumns.map((col) => (
              <th
                key={col.id}
                className={`px-4 py-2.5 text-left text-xs font-medium text-[var(--vestara-text-muted)] uppercase tracking-wider ${col.sortable ? 'cursor-pointer select-none hover:text-[var(--vestara-text-primary)]' : ''} ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
                style={{ width: col.width }}
                onClick={col.sortable ? () => handleSort(col.id) : undefined}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && <SortIcon direction={sortKey === col.id ? sortDirection : null} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {loading ? (
            <TableSkeleton rows={5} cols={visibleColumns.length + (selectable ? 1 : 0)} />
          ) : sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                className="px-4 py-12 text-center text-[var(--vestara-text-muted)]"
              >
                {emptyContent ?? 'No data available'}
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIndex) => {
              const key = keyExtractor(row);
              const isSelected = selectedKeys.has(key);

              return (
                <tr
                  key={key}
                  className={`
                    border-b border-[var(--vestara-border-subtle)] last:border-b-0
                    ${hoverable ? 'hover:bg-[var(--vestara-surface-interactive)]' : ''}
                    ${striped && rowIndex % 2 === 1 ? 'bg-[var(--vestara-surface-panel)]/50' : ''}
                    ${isSelected ? 'bg-[var(--vestara-accent-primary)]/10' : ''}
                    ${onRowClick ? 'cursor-pointer' : ''}
                    transition-colors duration-100
                  `}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="w-10 px-3 py-2.5">
                      <Checkbox checked={isSelected} onChange={(checked) => handleSelectRow(key, checked)} />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td
                      key={col.id}
                      className={`px-4 py-2.5 text-[var(--vestara-text-primary)] ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
                    >
                      {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
