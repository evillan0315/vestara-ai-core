/**
 * Breadcrumbs — Global breadcrumb bar.
 *
 * Uses Vestara tokens only (`var(--vestara-*)`), renders trail from useBreadcrumbs().
 * Hidden on /overview, /login, / (redirect). Lightweight, memoized.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useBreadcrumbs } from './useBreadcrumbs';

function BreadcrumbsInner() {
  const crumbs = useBreadcrumbs();
  if (crumbs.length === 0) return null;
  // Hide on overview/landing where hero owns header
  const last = crumbs[crumbs.length - 1];
  if (last?.href === '/overview') return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] leading-none mb-3 px-1">
      {crumbs.map((crumb, idx) => (
        <span key={`${crumb.label}-${idx}`} className="flex items-center gap-1.5">
          {idx > 0 && <span className="text-[var(--vestara-color-text-dim,var(--vestara-text-dim))]">/</span>}
          {crumb.isCurrent || !crumb.href ? (
            <span className="font-medium text-[var(--vestara-color-text-primary,var(--vestara-text-2))]">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.href}
              className="text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text-2))] transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export const Breadcrumbs = memo(BreadcrumbsInner);
export default Breadcrumbs;
