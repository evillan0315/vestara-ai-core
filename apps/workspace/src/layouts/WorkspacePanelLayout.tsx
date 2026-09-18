/**
 * UI-FOUNDATION-006: WorkspacePanelLayout — shared page geometry contract.
 *
 * Single substrate for every workspace page: centered max-width, page
 * gutters, and hero → content rhythm — all sourced from Vestara tokens, so
 * user spacing/layout settings (lib/theme.tsx) propagate everywhere.
 *
 * Authority boundaries (do not blur):
 * - Tokens own every visual value (--vestara-page-max-width,
 *   --vestara-spacing-page, --vestara-spacing-section). This component adds
 *   no literal spacing, widths, or colors.
 * - ROUTES own routing; ShellLayout owns shell chrome (sidebar/header/
 *   breadcrumbs). This component owns page-panel geometry only.
 * - Pages own content. Settings is the first designated consumer; Overview
 *   and Diagnostics adopt the panel when their migrations land (their direct
 *   PageContainer use is unchanged by this milestone).
 */

import type { PropsWithChildren, ReactNode } from 'react';

export interface WorkspacePanelLayoutProps extends PropsWithChildren {
  /** Optional hero slot (PageHero/RouteHero composition). Stacked above content. */
  hero?: ReactNode;
  /** Full-bleed mode: skip the max-width constraint. Default: false */
  fluid?: boolean;
}

export function WorkspacePanelLayout({ hero, fluid = false, children }: WorkspacePanelLayoutProps) {
  return (
    <div
      className={[
        'mx-auto w-full',
        fluid ? 'max-w-none' : 'max-w-[var(--vestara-page-max-width)]',
        'px-[var(--vestara-spacing-page)] pt-[var(--vestara-spacing-page)] pb-[var(--vestara-spacing-page)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col gap-[var(--vestara-spacing-section)]">
        {hero}
        {children}
      </div>
    </div>
  );
}

export default WorkspacePanelLayout;
