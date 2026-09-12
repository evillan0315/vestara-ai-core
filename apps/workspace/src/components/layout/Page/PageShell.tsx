/**
 * PageShell — Reusable page layout component
 *
 * Provides a consistent responsive shell for all Vestara pages:
 *   header → content (with optional sidebar) → footer
 *
 * Responsive behavior:
 *   mobile  (< 640px):  stacked layout, sidebar as overlay
 *   tablet  (640-1023): 2-col grid, sidebar toggle
 *   desktop (≥ 1024):   sidebar always visible
 *
 * Usage:
 *   <PageShell>
 *     <PageShell.Header>
 *       <PageShell.Title>My Page</PageShell.Title>
 *       <PageShell.Status>Live</PageShell.Status>
 *       <PageShell.Actions><button>...</button></PageShell.Actions>
 *     </PageShell.Header>
 *     <PageShell.Content>
 *       <main>...</main>
 *     </PageShell.Content>
 *     <PageShell.Sidebar>...</PageShell.Sidebar>
 *     <PageShell.Footer>...</PageShell.Footer>
 *   </PageShell>
 *
 * Architecture Traceability:
 *   CSP-020 → Shared UI layout shell
 */

import { createContext, useCallback, useContext, useState, type PropsWithChildren, type ReactNode } from 'react';

// ─── Context ─────────────────────────────────────────────────

interface PageShellContextValue {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
}

const PageShellContext = createContext<PageShellContextValue>({
  sidebarOpen: false,
  toggleSidebar: () => {},
  closeSidebar: () => {},
});

export function usePageShell() {
  return useContext(PageShellContext);
}

// ─── Root ────────────────────────────────────────────────────

export interface PageShellProps extends PropsWithChildren {
  /** Full-viewport mode (no internal scroll, fills parent). Default: true */
  fullViewport?: boolean;
}

function PageShellRoot({ children, fullViewport = true }: PageShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((s) => !s), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <PageShellContext.Provider value={{ sidebarOpen, toggleSidebar, closeSidebar }}>
      <div
        className={[
          // min-w-0 keeps flex/grid descendants from forcing horizontal
          // overflow on narrow viewports; w-full fills the shell content.
          'flex w-full min-w-0 flex-col bg-(--vestara-bg) text-(--vestara-text)',
          fullViewport ? 'h-full min-h-0' : '',
        ].join(' ')}
      >
        {children}
      </div>
    </PageShellContext.Provider>
  );
}

// ─── Header ──────────────────────────────────────────────────

export interface PageShellHeaderProps extends PropsWithChildren {
  /** Render as a styled card with accent border. Default: false */
  card?: boolean;
}

function PageShellHeader({ children, card = false }: PageShellHeaderProps) {
  return (
    <header
      className={[
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        'px-3 py-3 sm:px-4 sm:py-4',
        card
          ? 'rounded-xl border border-(--vestara-accent-border) bg-(--vestara-surface) shadow-[0_0_0_1px_var(--vestara-accent-bg),0_0_12px_color-mix(in_srgb,var(--vestara-accent)_10%,transparent)]'
          : 'border-b border-(--vestara-accent-border)',
      ].join(' ')}
    >
      {children}
    </header>
  );
}

// ─── Header Title Block ──────────────────────────────────────

export interface PageShellTitleProps {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
}

function PageShellTitle({ eyebrow, title, subtitle }: PageShellTitleProps) {
  return (
    <div className="min-w-0">
      {eyebrow && (
        <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-(--vestara-accent-text)">
          {eyebrow}
        </div>
      )}
      <h1 className="text-lg font-bold text-(--vestara-text)">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-[10px] text-(--vestara-text-muted)">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Header Status Badge ─────────────────────────────────────

export type PageShellStatusColor = 'green' | 'amber' | 'red' | 'neutral';

const STATUS_COLORS: Record<PageShellStatusColor, string> = {
  green: 'bg-(--vestara-green)',
  amber: 'bg-(--vestara-amber)',
  red: 'bg-(--vestara-red)',
  neutral: 'bg-(--vestara-text-muted)',
};

export interface PageShellStatusProps {
  color?: PageShellStatusColor;
  pulse?: boolean;
  label: string;
}

function PageShellStatus({ color = 'green', pulse = false, label }: PageShellStatusProps) {
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-surface) px-3 py-1.5 text-[10px] text-(--vestara-text-2) shadow-[0_0_6px_var(--vestara-accent-bg)]"
      role="status"
    >
      <span
        className={[
          'inline-block h-1.5 w-1.5 rounded-full',
          STATUS_COLORS[color],
          pulse ? 'animate-pulse' : '',
        ].join(' ')}
      />
      {label}
    </span>
  );
}

// ─── Header Actions ──────────────────────────────────────────

function PageShellActions({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">{children}</div>
  );
}

// ─── Content Area ────────────────────────────────────────────

export interface PageShellContentProps extends PropsWithChildren {
  /** Minimum height for the content area. Default: '28rem' */
  minHeight?: string;
}

function PageShellContent({ children, minHeight = '28rem' }: PageShellContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4 md:flex-row md:gap-4">
      {children}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────

export interface PageShellMainProps extends PropsWithChildren {
  minHeight?: string;
}

function PageShellMain({ children, minHeight = '28rem' }: PageShellMainProps) {
  return (
    <main
      className="flex min-w-0 flex-1 flex-col rounded-xl border border-(--vestara-accent-border) bg-(--vestara-surface) p-2 sm:p-3 shadow-[0_0_0_1px_var(--vestara-accent-bg),0_0_12px_color-mix(in_srgb,var(--vestara-accent)_10%,transparent),inset_0_1px_0_color-mix(in_srgb,var(--vestara-accent-light)_8%,transparent)]"
      style={{ minHeight }}
    >
      {children}
    </main>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────

export interface PageShellSidebarProps extends PropsWithChildren {
  /** Sidebar width. Default: 'w-72' */
  width?: string;
  /** Hide on mobile by default (use overlay pattern). Default: true */
  hideOnMobile?: boolean;
  /** Render sidebar header (mobile close button, title) */
  header?: ReactNode;
}

function PageShellSidebar({
  children,
  width = 'w-72',
  hideOnMobile = true,
  header,
}: PageShellSidebarProps) {
  const { sidebarOpen, closeSidebar } = usePageShell();

  return (
    <>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'flex flex-col border-l border-(--vestara-accent-border) bg-(--vestara-surface) shadow-[-4px_0_24px_-8px_var(--vestara-accent-bg)]',
          // Mobile: fixed overlay
          'fixed inset-y-0 right-0 z-50 transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: static
          'sm:static sm:z-auto sm:translate-x-0',
          // Responsive visibility
          hideOnMobile ? 'hidden sm:flex' : 'flex',
          width,
        ].join(' ')}
      >
        {/* Mobile close header */}
        <div className="flex items-center justify-between border-b border-(--vestara-accent-border) px-4 sm:hidden">
          {header ?? <span className="text-sm font-medium text-(--vestara-text-2)">Menu</span>}
          <button
            type="button"
            onClick={closeSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-(--vestara-text-2) hover:bg-(--vestara-accent-bg) cursor-pointer"
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        {children}
      </aside>
    </>
  );
}

// ─── Sidebar Section ─────────────────────────────────────────

export interface PageShellSidebarSectionProps extends PropsWithChildren {
  title?: string;
}

function PageShellSidebarSection({ title, children }: PageShellSidebarSectionProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      {title && (
        <div className="mb-2 px-2 text-[9px] uppercase tracking-widest text-(--vestara-text-dim)">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────

export interface PageShellFooterProps extends PropsWithChildren {
  /** Render as a styled card with accent border. Default: false */
  card?: boolean;
}

function PageShellFooter({ children, card = false }: PageShellFooterProps) {
  return (
    <footer
      className={[
        'flex flex-col sm:flex-row items-center justify-between gap-1',
        'px-3 py-2 sm:px-4 sm:py-2.5',
        card
          ? 'rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)'
          : 'border-t border-(--vestara-accent-border)',
      ].join(' ')}
    >
      {children}
    </footer>
  );
}

// ─── Error Banner ────────────────────────────────────────────

export interface PageShellErrorProps {
  message: string;
  onRetry?: () => void;
}

function PageShellError({ message, onRetry }: PageShellErrorProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-(--vestara-amber-border) bg-(--vestara-amber-bg) px-3 py-2 text-[10px] text-(--vestara-amber)"
      role="alert"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto rounded border border-(--vestara-amber-border) px-2 py-1 font-medium cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ─── Compact Button (for header actions) ─────────────────────

export interface PageShellButtonProps extends PropsWithChildren {
  onClick?: () => void;
  active?: boolean;
  variant?: 'default' | 'danger';
  title?: string;
}

function PageShellButton({ children, onClick, active = false, variant = 'default', title }: PageShellButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        'rounded-lg border px-3 py-1.5 text-[10px] transition-colors cursor-pointer',
        variant === 'danger'
          ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
          : active
            ? 'border-(--vestara-accent-text) bg-(--vestara-accent-text)/10 text-(--vestara-accent-text)'
            : 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-(--vestara-text-2) hover:text-(--vestara-text)',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─── Exports ─────────────────────────────────────────────────

export const PageShell = Object.assign(PageShellRoot, {
  Header: PageShellHeader,
  Title: PageShellTitle,
  Status: PageShellStatus,
  Actions: PageShellActions,
  Content: PageShellContent,
  Main: PageShellMain,
  Sidebar: PageShellSidebar,
  SidebarSection: PageShellSidebarSection,
  Footer: PageShellFooter,
  Error: PageShellError,
  Button: PageShellButton,
});

export default PageShell;
