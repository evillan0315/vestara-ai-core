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
}

export default function OperationalWorkspaceLayout({
  banner,
  rail,
  children,
  context,
  footer,
}: OperationalWorkspaceLayoutProps) {
  return (
    <div className="operational-workspace-layout flex min-h-0 flex-1 flex-col overflow-x-hidden">
      {banner && <div className="operational-workspace-layout__banner shrink-0">{banner}</div>}

      {/* Work region — stacks on compact viewports and composes rail/main/context on desktop. */}
      <div className="operational-workspace-layout__work flex min-h-0 flex-1 flex-col lg:flex-row">
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
      </div>

      {/* Footer — fixed height, does not expand, owns status placement */}
      <div className="operational-workspace-layout__footer shrink-0 flex flex-col items-start ">
        {footer}
      </div>
    </div>
  );
}
