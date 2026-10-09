/**
 * VES-OVERVIEW-001: Overview Section Card
 *
 * Router-aware wrapper over the shared DashboardPanel surface. Overview
 * sections and Settings domain panels now share the same operational-card
 * structure, while this adapter preserves existing Overview call sites.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DashboardPanel } from '../../../components/dashboard/DashboardPanel.js';

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

export function SectionCard({
  title,
  actionLabel,
  actionHref,
  badge,
  live,
  accent,
  index = 0,
  children,
}: SectionCardProps) {
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

  // Kept for compatibility with existing Overview panel call sites. The
  // shared operational surface owns panel geometry and animation now.
  void accent;
  void index;

  return (
    <DashboardPanel
      title={title}
      badge={
        badge ? (
          <span className="mpg-tag-pill">
            {live && 'Live · '}
            {badge}
          </span>
        ) : undefined
      }
      actions={action}
    >
      {children}
    </DashboardPanel>
  );
}
