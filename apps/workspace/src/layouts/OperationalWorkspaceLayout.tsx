/**
 * UI-FOUNDATION-007: OperationalWorkspaceLayout — dense operational surface layout.
 *
 * Owns main/context/footer composition geometry for operational surfaces.
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
  /** Main content area (tabs, toolbar, viewport, etc.) */
  children: ReactNode;
  /** Optional context/side panel (session details, quick actions, environment) */
  context?: ReactNode;
  /** Optional footer/status bar (connection/runtime/session status) */
  footer?: ReactNode;
}

export default function OperationalWorkspaceLayout({
  children,
  context,
  footer,
}: OperationalWorkspaceLayoutProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-x-hidden">
      {/* Main work area — expands to fill available space, owns terminal content scroll */}
      <div className="flex-1 flex flex-col overflow-auto">
        {children}
      </div>

      {/* Context panel — optional secondary area with its own scroll when needed */}
      {context && (
        <div className="flex-shrink-0 overflow-auto max-w-sm">
          {context}
        </div>
      )}

      {/* Footer — fixed height, does not expand, owns status placement */}
      <div className="shrink-0 flex flex-col items-start gap-2 px-4 py-1 bg-(--vestara-surface-panel) border-t border-(--vestara-accent-border)">
        {footer}
      </div>
    </div>
  );
}