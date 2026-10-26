import type { ReactNode } from 'react';

export interface ShellRootProps {
  sidebar: ReactNode;
  header: ReactNode;
  mobileSidebarOpen: boolean;
  onCloseMobileSidebar: () => void;
  children: ReactNode;
}

/**
 * Canonical workspace shell geometry.
 *
 * The top bar header spans the full viewport width; the navigation sidebar
 * docks below it (never beside it), so the header owns the entire top edge.
 * The sidebar brand lockup is retired — brand identity lives in the header.
 *
 * Ownership:
 * - ShellRoot owns the application viewport and shell-level containment.
 * - Sidebar and header own their presentation and internal behavior.
 * - PageContainer owns route scrolling.
 * - WorkspacePanelLayout owns page geometry.
 * - Pages own domain composition.
 */
export function ShellRoot({
  sidebar,
  header,
  mobileSidebarOpen,
  onCloseMobileSidebar,
  children,
}: ShellRootProps) {
  return (
    <div className="shell-root flex h-screen flex-col overflow-hidden bg-(--vestara-shell-bg)">
      {header}

      <div className="flex min-h-0 min-w-0 flex-1">
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-[var(--vestara-z-index-overlay)] bg-(--vestara-surface-overlay) lg:hidden"
            onClick={onCloseMobileSidebar}
          />
        )}

        <div
          className={[
            'fixed top-[var(--vestara-sizing-topbar-height)] bottom-0 left-0 z-[var(--vestara-z-index-overlay)] transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          {sidebar}
        </div>

        <div className="isolate flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

export default ShellRoot;
