/**
 * UI-FOUNDATION-006: WorkspacePanelLayout — shared page geometry contract.
 *
 * Single substrate for every workspace page: centered max-width and
 * hero → content rhythm — all sourced from Vestara tokens, so
 * user spacing/layout settings (lib/theme.tsx) propagate everywhere.
 * Page gutters live in ShellLayout's PageContainer only; this panel adds
 * no outer padding (no double-gutter).
 *
 * Authority boundaries (do not blur):
  * - Tokens own every visual value (--vestara-page-max-width,
  *   --vestara-spacing-section). Outer page padding is owned by
  *   ShellLayout's PageContainer. This component adds
  *   no literal spacing, widths, or colors.
 * - ROUTES own routing; ShellLayout owns shell chrome (sidebar/header/
 *   breadcrumbs). This component owns page-panel geometry only.
 * - Pages own content. Current consumers: Overview, Execution, Terminal,
 *   and Files. Settings uses its own fit-screen root (styles/settings-page.css)
 *   mirroring the Activity Room / Workflows pattern instead of this panel.
 */

import type { PropsWithChildren, ReactNode } from 'react';

export interface WorkspacePanelLayoutProps extends PropsWithChildren {
  /** Optional hero slot (PageHero/RouteHero composition). Stacked above content. */
  hero?: ReactNode;
  /** Full-bleed mode: skip the max-width constraint. Default: false */
  fluid?: boolean;
  /** Preserve the shell's bounded-height flex chain for operational workspaces. */
  fill?: boolean;
}

export function WorkspacePanelLayout({ hero, fluid = false, fill = false, children }: WorkspacePanelLayoutProps) {
  return (
    <div
      className={[
        'mx-auto w-full',
        fluid ? 'max-w-none' : 'max-w-[var(--vestara-page-max-width)]',
        fill ? 'flex h-full min-h-0 flex-col overflow-hidden' : '',
      ].join(' ')}
    >
      <div className={['flex min-w-0 flex-col gap-[var(--vestara-spacing-section)]', fill ? 'min-h-0 flex-1 overflow-hidden' : ''].join(' ')}>
        {hero}
        {children}
      </div>
    </div>
  );
}

export default WorkspacePanelLayout;
