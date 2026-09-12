/**
 * VES-OVERVIEW-001: Overview Section Card
 *
 * Router-aware wrapper over the Marketplace gallery card. All gallery
 * materials (mpg-card, hairline, icon box, pills, links) are the
 * Marketplace's own styles/components — no parallel premium system.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GalleryCard } from '../../../pages/Marketplace/MarketplaceLayout-components.js';

interface SectionCardProps {
  title: string;
  actionLabel?: string;
  actionHref?: string;
  badge?: string;
  live?: boolean;
  accent?: string;
  index?: number;
  children: ReactNode;
}

export function SectionCard({ title, actionLabel, actionHref, badge, live, accent, index = 0, children }: SectionCardProps) {
  const action = actionLabel ? (
    actionHref && actionHref !== '#' ? (
      <Link to={actionHref} className="mpg-link">
        {actionLabel}
        <span aria-hidden="true"> ›</span>
      </Link>
    ) : (
      <span className="mpg-link cursor-pointer">{actionLabel}</span>
    )
  ) : undefined;

  return (
    <section aria-label={title} className="mpg-enter" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <GalleryCard accent={accent ?? 'var(--vestara-accent)'}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--vestara-text-primary)]">
            <span className="truncate">{title}</span>
            {badge && (
              <span className="mpg-tag-pill shrink-0">
                {live && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--vestara-status-success)', boxShadow: '0 0 6px var(--vestara-status-success)' }}
                  />
                )}
                {badge}
              </span>
            )}
          </h2>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </GalleryCard>
    </section>
  );
}
