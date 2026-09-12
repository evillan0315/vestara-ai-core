/**
 * VES-OVERVIEW-001: Shared Page Hero (Overview template grammar)
 *
 * The Overview hero composition — eyebrow + headline, description,
 * optional search, CTAs + stat pills, capability checklist — extracted
 * as the reusable banner for every Workspace page. Overview,
 * Diagnostics, Marketplace, Execution, Graph, Routing, Settings, and
 * Agents all render this instead of hand-rolled `mpg-hero` markup so
 * the premium banner stays uniform.
 *
 * Ownership: apps/workspace (shared layout presentation)
 * Authority: None — pure presentation, no domain behavior.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import '../../../styles/marketplace.css';

export interface PageHeroStat {
  label: string;
  value: string | number;
  color?: string;
}

export interface PageHeroAction {
  label: string;
  /** Internal route — renders a Link. Omit for a plain button. */
  to?: string;
  onClick?: () => void;
  title?: string;
  primary?: boolean;
  disabled?: boolean;
  glyph?: ReactNode;
}

export interface PageHeroSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputId?: string;
  label?: string;
}

export interface PageHeroProps {
  /** Small caps eyebrow above the title (accent text + status dot). */
  eyebrow?: string;
  /** Status dot color for the eyebrow. Defaults to success green. */
  statusColor?: string;
  title: string;
  /** Heading level for the title. Defaults to h1. */
  titleAs?: 'h1' | 'h2';
  subtitle?: string;
  /** Italic pull-quote under the subtitle. */
  quote?: string;
  search?: PageHeroSearch;
  actions?: PageHeroAction[];
  /** Structured stat pills (MarketplaceStatPill grammar). */
  stats?: PageHeroStat[];
  /** Custom row (tag pills, status pills) rendered before the stats. */
  meta?: ReactNode;
  /** Checklist card title (accent) + rows. Omit for a copy-only hero. */
  checklistTitle?: string;
  checklist?: string[];
  checklistLabel?: string;
  /** aria-label for the banner. Defaults to "<title> highlights". */
  label?: string;
}

function HeroStatPill({ label, value, color = 'text-zinc-100' }: PageHeroStat) {
  return (
    <div className="mpg-card flex items-center gap-2 px-3 py-2">
      <span className="relative z-[2] flex items-center gap-2">
        <span className={`text-lg font-bold ${color}`}>{value}</span>
        <span className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">{label}</span>
      </span>
    </div>
  );
}

export function PageHero({
  eyebrow,
  statusColor = 'var(--vestara-status-success)',
  title,
  titleAs = 'h1',
  subtitle,
  quote,
  search,
  actions,
  stats,
  meta,
  checklistTitle,
  checklist,
  checklistLabel,
  label,
}: PageHeroProps) {
  const Title = titleAs;
  return (
    <section className="mpg-hero mpg-enter" aria-label={label ?? `${title} highlights`}>
      <div className="mpg-hero-copy">
        {eyebrow && (
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--vestara-accent)]">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
            {eyebrow}
          </p>
        )}
        <Title className="mt-2 text-3xl font-bold tracking-tight text-[var(--vestara-text-primary)] sm:text-4xl">
          {title}
        </Title>
        {subtitle && (
          <p className="mt-2 text-[15px] font-medium text-[var(--vestara-text-secondary)]">{subtitle}</p>
        )}
        {quote && (
          <p className="mt-4 max-w-md text-[13px] italic leading-relaxed text-[var(--vestara-text-secondary)]">
            {quote}
          </p>
        )}
        {search && (
          <div className="mpg-hero-search">
            <span aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor={search.inputId ?? 'page-hero-search'}>
              {search.label ?? 'Search'}
            </label>
            <input
              id={search.inputId ?? 'page-hero-search'}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
            />
          </div>
        )}
        {actions && actions.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {actions.map((action) =>
              action.to ? (
                <Link
                  key={action.label}
                  to={action.to}
                  className={action.primary ? 'mpg-install-btn' : 'mpg-pill'}
                  title={action.title}
                >
                  {action.glyph && (
                    <span aria-hidden="true">{action.glyph} </span>
                  )}
                  {action.label}
                </Link>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={action.primary ? 'mpg-install-btn' : 'mpg-pill'}
                  title={action.title}
                >
                  {action.glyph && (
                    <span aria-hidden="true">{action.glyph} </span>
                  )}
                  {action.label}
                </button>
              ),
            )}
          </div>
        )}
        {(meta || (stats && stats.length > 0)) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {meta}
            {stats?.map((stat) => (
              <HeroStatPill key={stat.label} {...stat} />
            ))}
          </div>
        )}
      </div>
      {checklist && checklist.length > 0 && (
        <aside className="mpg-hero-checklist" aria-label={checklistLabel ?? checklistTitle ?? 'Highlights'}>
          {checklistTitle && (
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vestara-accent)]">
              {checklistTitle}
            </p>
          )}
          <ul>
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
