/**
 * VES-UI-D9: Shell Component
 *
 * Slot-based shell layout that any Vestara screen can compose.
 * Same shell, different slots.
 *
 * Architecture Traceability:
 *   VES-UI-D: Layout Shell (phases 9-11)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-008
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ShellBreakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ShellContextValue {
  /** Current breakpoint */
  breakpoint: ShellBreakpoint;

  /** Whether navigation sidebar is collapsed */
  navCollapsed: boolean;

  /** Toggle navigation sidebar */
  toggleNav: () => void;

  /** Set navigation collapsed state */
  setNavCollapsed: (collapsed: boolean) => void;

  /** Whether inspector is open */
  inspectorOpen: boolean;

  /** Toggle inspector */
  toggleInspector: () => void;

  /** Set inspector open state */
  setInspectorOpen: (open: boolean) => void;
}

export interface ShellProps {
  /** Shell content */
  children: ReactNode;

  /** Custom class name */
  className?: string;

  /** Initial nav collapsed state */
  defaultNavCollapsed?: boolean;

  /** Initial inspector open state */
  defaultInspectorOpen?: boolean;
}

export interface ShellHeaderProps {
  /** Header content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface ShellNavigationProps {
  /** Navigation content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface ShellContentProps {
  /** Main content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface ShellInspectorProps {
  /** Inspector content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface ShellBottomPanelProps {
  /** Bottom panel content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

// ─── Context ───────────────────────────────────────────────────

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within Shell');
  return ctx;
}

// ─── Breakpoint Hook ───────────────────────────────────────────

function useBreakpoint(): ShellBreakpoint {
  // Simple breakpoint detection
  if (typeof window === 'undefined') return 'desktop';

  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1200) return 'tablet';
  return 'desktop';
}

// ─── Shell Component ───────────────────────────────────────────

export function Shell({
  children,
  className = '',
  defaultNavCollapsed = false,
  defaultInspectorOpen = true,
}: ShellProps) {
  const breakpoint = useBreakpoint();
  const [navCollapsed, setNavCollapsed] = useState(defaultNavCollapsed);
  const [inspectorOpen, setInspectorOpen] = useState(defaultInspectorOpen);

  const toggleNav = useCallback(() => setNavCollapsed((prev) => !prev), []);
  const toggleInspector = useCallback(() => setInspectorOpen((prev) => !prev), []);

  const value: ShellContextValue = useMemo(
    () => ({
      breakpoint,
      navCollapsed,
      toggleNav,
      setNavCollapsed,
      inspectorOpen,
      toggleInspector,
      setInspectorOpen,
    }),
    [breakpoint, navCollapsed, inspectorOpen, toggleNav, toggleInspector],
  );

  return (
    <ShellContext.Provider value={value}>
      <div className={`flex flex-col h-screen overflow-hidden bg-[var(--vestara-surface-canvas)] ${className}`}>
        {children}
      </div>
    </ShellContext.Provider>
  );
}

// ─── ShellHeader Component ─────────────────────────────────────

export function ShellHeader({ children, className = '' }: ShellHeaderProps) {
  return (
    <header
      className={`shrink-0 h-14 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] flex items-center px-4 ${className}`}
    >
      {children}
    </header>
  );
}

// ─── ShellNavigation Component ─────────────────────────────────

export function ShellNavigation({ children, className = '' }: ShellNavigationProps) {
  const { navCollapsed, breakpoint } = useShell();

  // Mobile: hidden by default (drawer pattern)
  if (breakpoint === 'mobile' && navCollapsed) {
    return null;
  }

  return (
    <aside
      className={`
        shrink-0 border-r border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)]
        ${navCollapsed ? 'w-16' : 'w-64'}
        transition-all duration-200
        ${breakpoint === 'mobile' ? 'absolute z-20 h-full' : ''}
        ${className}
      `}
    >
      {children}
    </aside>
  );
}

// ─── ShellContent Component ────────────────────────────────────

export function ShellContent({ children, className = '' }: ShellContentProps) {
  return <main className={`flex-1 min-w-0 overflow-auto ${className}`}>{children}</main>;
}

// ─── ShellInspector Component ──────────────────────────────────

export function ShellInspector({ children, className = '' }: ShellInspectorProps) {
  const { inspectorOpen, breakpoint } = useShell();

  if (!inspectorOpen) return null;

  // Mobile/Tablet: overlay drawer
  if (breakpoint !== 'desktop') {
    return (
      <div className="fixed inset-y-0 right-0 z-30 w-80 border-l border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] shadow-xl">
        {children}
      </div>
    );
  }

  return (
    <aside
      className={`shrink-0 w-80 border-l border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] ${className}`}
    >
      {children}
    </aside>
  );
}

// ─── ShellBottomPanel Component ────────────────────────────────

export function ShellBottomPanel({ children, className = '' }: ShellBottomPanelProps) {
  return (
    <div
      className={`shrink-0 border-t border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-shell)] ${className}`}
    >
      {children}
    </div>
  );
}
