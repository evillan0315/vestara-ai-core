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

import { useState, useCallback, useRef, type ReactNode } from 'react';

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

export interface ThreePaneLayoutProps {
  /** Left pane content */
  left: ReactNode;

  /** Center pane content */
  center: ReactNode;

  /** Right pane content */
  right: ReactNode;

  /** Left pane width */
  leftWidth?: string;

  /** Right pane width */
  rightWidth?: string;

  /** Custom class name */
  className?: string;
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
    <div
      ref={containerRef}
      className={`flex ${direction === 'horizontal' ? 'flex-row' : 'flex-col'} ${className}`}
    >
      {/* First pane */}
      <div
        className={`shrink-0 overflow-auto ${direction === 'horizontal' ? 'h-full' : 'w-full'}`}
        style={{ [direction === 'horizontal' ? 'width' : 'height']: size }}
      >
        {first}
      </div>

      {/* Divider */}
      {resizable && (
        <div
          className={`
            shrink-0 bg-[var(--vestara-border-subtle)] hover:bg-[var(--vestara-accent-primary)]/30
            transition-colors duration-100
            ${direction === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
          `}
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Second pane */}
      <div className="flex-1 min-w-0 overflow-auto">
        {second}
      </div>
    </div>
  );
}

// ─── MasterDetailLayout Component ──────────────────────────────

export function MasterDetailLayout({
  master,
  detail,
  masterWidth = '320px',
  className = '',
}: MasterDetailLayoutProps) {
  return (
    <SplitPane
      direction="horizontal"
      defaultSize={masterWidth}
      minSize={200}
      maxSize="50%"
      className={className}
    >
      {[master, detail]}
    </SplitPane>
  );
}

// ─── ThreePaneLayout Component ─────────────────────────────────

export function ThreePaneLayout({
  left,
  center,
  right,
  leftWidth = '280px',
  rightWidth = '320px',
  className = '',
}: ThreePaneLayoutProps) {
  return (
    <div className={`flex h-full ${className}`}>
      {/* Left pane */}
      <div className="shrink-0 w-64 border-r border-[var(--vestara-border-subtle)] overflow-auto" style={{ width: leftWidth }}>
        {left}
      </div>

      {/* Center pane */}
      <div className="flex-1 min-w-0 overflow-auto">
        {center}
      </div>

      {/* Right pane */}
      <div className="shrink-0 w-80 border-l border-[var(--vestara-border-subtle)] overflow-auto" style={{ width: rightWidth }}>
        {right}
      </div>
    </div>
  );
}

// ─── Page Component ────────────────────────────────────────────

export function Page({ children, className = '' }: PageProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {children}
    </div>
  );
}

// ─── PageHeader Component ──────────────────────────────────────

export function PageHeader({ children, className = '' }: PageHeaderProps) {
  return (
    <div className={`shrink-0 px-6 py-4 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] ${className}`}>
      {children}
    </div>
  );
}

// ─── PageTitle Component ───────────────────────────────────────

export function PageTitle({ children, className = '' }: PageTitleProps) {
  return (
    <h1 className={`text-xl font-semibold text-[var(--vestara-text-primary)] ${className}`}>
      {children}
    </h1>
  );
}

// ─── PageActions Component ─────────────────────────────────────

export function PageActions({ children, className = '' }: PageActionsProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {children}
    </div>
  );
}
