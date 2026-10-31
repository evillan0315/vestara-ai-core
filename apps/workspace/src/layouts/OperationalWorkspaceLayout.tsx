/**
 * UI-FOUNDATION-007: OperationalWorkspaceLayout — dense operational surface layout.
 *
 * Owns banner/rail/main/context/footer composition geometry for operational surfaces.
 * Does NOT own page gutters, max-width, shell chrome, routing, or domain state.
 *
 * Authority boundaries (do not blur):
 * - Tokens own every visual value (--vestara-*). No hardcode literals.
 * - Scroll ownership: one scroll owner per region/axis (see H — SCROLL OWNERSHIP).
 * - ShellLayout owns page gutters and max-width (outer wrapper — UI-FO-006A).
 * - Terminal owns its own state, viewport content, and inspector data.
 * - Context content scroll is owned by the Context region when necessary.
 */

import type { ReactNode } from 'react';
import { ThreePaneLayout } from '@vestara/ui';

export interface OperationalWorkspaceLayoutProps {
  /** Optional operational banner or lane above the work region. */
  banner?: ReactNode;
  /** Optional left rail (participants, sessions, files, or navigation). */
  rail?: ReactNode;
  /** Main content area (tabs, toolbar, viewport, etc.) */
  children: ReactNode;
  /** Optional context/side panel (session details, quick actions, environment) */
  context?: ReactNode;
  /** Optional footer/status bar (connection/runtime/session status) */
  footer?: ReactNode;
  /**
   * Opt-in: render the work region as the global resizable ThreePaneLayout
   * (@vestara/ui) instead of static regions. Default false — existing
   * consumers keep their exact current geometry.
   */
  resizablePanes?: boolean;
  /** localStorage key persisting uncontrolled pane widths + collapse state. */
  paneStorageKey?: string;
  /**
   * Bare panes for the resizable work region (no rail background or edge
   * borders — slot content brings its own card, e.g. ar-panel rail/context).
   */
  barePanes?: boolean;
  /** Uncontrolled initial widths (px) and clamps for the resizable work region. */
  defaultLeftWidth?: number;
  defaultRightWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  minRightWidth?: number;
  maxRightWidth?: number;
  /** Controlled widths — provide with the matching change handler. */
  leftWidth?: number | string;
  rightWidth?: number | string;
  onLeftWidthChange?: (px: number) => void;
  onRightWidthChange?: (px: number) => void;
  /** Controlled collapse state for the resizable work region. */
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onLeftCollapsedChange?: (collapsed: boolean) => void;
  onRightCollapsedChange?: (collapsed: boolean) => void;
  /** Accessible labels for the resizable panes. */
  leftAriaLabel?: string;
  rightAriaLabel?: string;
}

export default function OperationalWorkspaceLayout({
  banner,
  rail,
  children,
  context,
  footer,
  resizablePanes = false,
  paneStorageKey,
  barePanes = false,
  defaultLeftWidth,
  defaultRightWidth,
  minLeftWidth,
  maxLeftWidth,
  minRightWidth,
  maxRightWidth,
  leftWidth,
  rightWidth,
  onLeftWidthChange,
  onRightWidthChange,
  leftCollapsed,
  rightCollapsed,
  onLeftCollapsedChange,
  onRightCollapsedChange,
  leftAriaLabel,
  rightAriaLabel,
}: OperationalWorkspaceLayoutProps) {
  return (
    <div className="operational-workspace-layout flex min-h-0 flex-1 flex-col overflow-x-hidden">
      {banner && <div className="operational-workspace-layout__banner shrink-0">{banner}</div>}

      {/* Work region — stacks on compact viewports and composes rail/main/context on desktop.
          No outer gap: panes dock edge-to-edge; slot content owns its own
          interior rhythm. With resizablePanes the global ThreePaneLayout owns
          the work-region geometry (drag handles, collapse, stacking); the hook
          classes are passed through so page CSS keeps applying. */}
      <div className="operational-workspace-layout__work flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        {resizablePanes ? (
          <ThreePaneLayout
            left={rail}
            center={children}
            right={context}
            leftWidth={leftWidth}
            rightWidth={rightWidth}
            defaultLeftWidth={defaultLeftWidth}
            defaultRightWidth={defaultRightWidth}
            minLeftWidth={minLeftWidth}
            maxLeftWidth={maxLeftWidth}
            minRightWidth={minRightWidth}
            maxRightWidth={maxRightWidth}
            onLeftWidthChange={onLeftWidthChange}
            onRightWidthChange={onRightWidthChange}
            leftCollapsed={leftCollapsed}
            rightCollapsed={rightCollapsed}
            onLeftCollapsedChange={onLeftCollapsedChange}
            onRightCollapsedChange={onRightCollapsedChange}
            leftAriaLabel={leftAriaLabel}
            rightAriaLabel={rightAriaLabel}
            storageKey={paneStorageKey}
            barePanes={barePanes}
            leftClassName="operational-workspace-layout__rail"
            centerClassName="operational-workspace-layout__main"
            rightClassName="operational-workspace-layout__context"
            className="w-full"
          />
        ) : (
          <>
            {rail && (
              <div className="operational-workspace-layout__rail min-h-0 min-w-0 shrink-0 overflow-auto lg:w-[var(--vestara-sidebar-width)]">
                {rail}
              </div>
            )}

            <div className="operational-workspace-layout__main flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
              {children}
            </div>

            {context && (
              <div className="operational-workspace-layout__context min-h-0 shrink-0 overflow-auto lg:max-w-sm">
                {context}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — fixed height, does not expand, owns status placement */}
      <div className="operational-workspace-layout__footer shrink-0 flex flex-col items-start ">
        {footer}
      </div>
    </div>
  );
}
