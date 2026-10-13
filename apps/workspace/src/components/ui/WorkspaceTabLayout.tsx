import type { ReactNode } from 'react';

export interface WorkspaceTabLayoutProps {
  /** Rail slot — typically a vertical WorkspaceTabs. Fixed on desktop, stacked above the panel on mobile. */
  rail: ReactNode;
  /** Panel header slot — pinned above the body on desktop. Omit it when the panel needs no header. */
  header?: ReactNode;
  /** Panel body content. The single scroll owner on desktop. */
  children: ReactNode;
  /** Optional panel footer slot — pinned below the body on desktop (action bars, save/discard rows). */
  footer?: ReactNode;
  /** Optional left sidebar header slot — pinned above the rail on desktop. Shows active tab metadata. */
  sidebarHeader?: ReactNode;
  /** Optional right-sidebar slot (details, inspectors, quick actions). Fixed beside the panel on desktop. */
  context?: ReactNode;
  /** Accessible label for the layout region. Omit when the rail already carries the accessible name. */
  ariaLabel?: string;
  className?: string;
  railClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  sidebarHeaderClassName?: string;
  contextClassName?: string;
}

/**
 * Workspace-level rail + panel composition shared by tabbed surfaces
 * (Settings sub-sections today, any rail-navigated page tomorrow).
 *
 * Regions and their styling hooks (semantic class + override prop):
 * - `.tab-layout` (`className`) — root
 * - `.tab-sidebar.tab-sidebar--left` (`railClassName`) — rail
 * - `.tab-sidebar-header` (`sidebarHeaderClassName`) — pinned sidebar header, stays at the top
 * - `.tab-content` (`contentClassName`) — panel frame, fits the screen, never scrolls itself
 * - `.tab-content-header` (`headerClassName`) — pinned panel header, stays at the top
 * - `.tab-content-body` (`bodyClassName`) — scrolling panel body, shows the scrollbar
 * - `.tab-content-footer` (`footerClassName`) — pinned panel footer, stays at the bottom
 * - `.tab-sidebar.tab-sidebar--right` (`contextClassName`) — context sidebar
 *
 * Fit-screen contract (mirrors the Activity Room / Workflows pattern):
 * stacked with natural page scroll below desktop; on desktop every region
 * fits the screen height — rail, header, footer, and optional context
 * sidebar stretch to the full layout height while the body takes the
 * remaining width and scrolls internally. The body is the single scroll
 * owner for panel content; sidebars keep their own overflow guards for
 * overlong content. The parent must provide a bounded height for the
 * internal scroll to engage (a flex chain with min-h-0, e.g.
 * settings-page__work); otherwise the layout degrades gracefully to
 * natural page scroll.
 *
 * Authority boundaries (do not blur):
 * - Tokens own every visual value (--vestara-*). This component adds
 *   no literal spacing, widths, or colors.
 * - Scroll ownership: only `.tab-content-body` scrolls; every other
 *   region caps at full height with its own overflow guard for overlong
 *   content.
 */
export function WorkspaceTabLayout({
  rail,
  header,
  children,
  footer,
  context,
  sidebarHeader,
  ariaLabel,
  className = '',
  railClassName = '',
  contentClassName = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  sidebarHeaderClassName = '',
  contextClassName = '',
}: WorkspaceTabLayoutProps) {
  return (
    <div
      aria-label={ariaLabel}
      data-fit-screen
      className={`tab-layout flex min-w-0 flex-col gap-[var(--vestara-spacing-section)] lg:h-full lg:min-h-0 lg:flex-1 lg:flex-row ${className}`}
    >
      <div
        className={`tab-sidebar tab-sidebar--left min-w-0 shrink-0 lg:min-h-0 lg:self-stretch lg:overflow-y-auto lg:w-[var(--vestara-sidebar-width)] ${railClassName}`}
      >
        {sidebarHeader !== undefined && <div className={`tab-sidebar-header shrink-0 ${sidebarHeaderClassName}`}>{sidebarHeader}</div>}
        {rail}
      </div>
      <div className={`tab-content min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col ${contentClassName}`}>
        {header !== undefined && <div className={`tab-content-header shrink-0 ${headerClassName}`}>{header}</div>}
        <div className={`tab-content-body min-w-0 flex-1 lg:min-h-0 lg:overflow-y-auto ${bodyClassName}`}>
          {children}
        </div>
        {footer !== undefined && <div className={`tab-content-footer shrink-0 ${footerClassName}`}>{footer}</div>}
      </div>
      {context !== undefined && (
        <div
          className={`tab-sidebar tab-sidebar--right min-w-0 shrink-0 lg:min-h-0 lg:self-stretch lg:overflow-y-auto lg:w-[var(--vestara-context-width)] ${contextClassName}`}
        >
          {context}
        </div>
      )}
    </div>
  );
}

export default WorkspaceTabLayout;
