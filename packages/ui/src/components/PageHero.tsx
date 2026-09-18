/**
 * VES-UI: PageHero Component (UI-FOUNDATION-002 canonical extraction)
 *
 * The Workspace hero composition — eyebrow + headline, description,
 * optional search, CTAs + stat pills, capability checklist — owned by
 * @vestara/ui. Migrated from apps/workspace without redesign: same grammar,
 * same token-driven appearance, no app-local `mpg-*` classes.
 *
 * Provider-neutral navigation: actions carry `to` (app route path) rendered
 * as a plain anchor. SPA hosts pass `onNavigate` to intercept client-side;
 * without it the anchor performs a standard navigation. No react-router
 * dependency — @vestara/ui must never import routing, workspace code, or
 * Activity Room contracts.
 *
 * Styling: Tailwind v4 utilities bound to `var(--vestara-*)` tokens only.
 * No inline CSS, no raw palette utilities, no new token authority.
 *
 * Architecture Traceability:
 *   UI-FOUNDATION-001 → canonical primitive inventory (PageHero)
 *   UI-FOUNDATION-002 → ownership convergence
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type PageHeroStatusTone = 'success' | 'warning' | 'error' | 'info';

export interface PageHeroStat {
  label: string;
  value: string | number;
  color?: string;
}

export interface PageHeroAction {
  label: string;
  /** App route path. Rendered as an anchor; intercepted when onNavigate is set. */
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

export type PageHeroDensity = 'default' | 'compact';

export interface PageHeroProps {
  /** Small caps eyebrow above the title. */
  eyebrow?: string;
  /** Status dot tone. Defaults to success. */
  statusTone?: PageHeroStatusTone;
  /** Headline text. */
  title?: string;
  /** Heading level for the title. Defaults to h1. */
  titleAs?: 'h1' | 'h2';
  subtitle?: string;
  /** Italic pull-quote under the subtitle. */
  quote?: string;
  search?: PageHeroSearch;
  actions?: PageHeroAction[];
  /** Structured stat pills. */
  stats?: PageHeroStat[];
  /** Custom row (tag pills, status pills) rendered before the stats. */
  meta?: ReactNode;
  /** Where to render meta/stats: 'copy' (left, under text) or 'side' (right, under actions). Defaults to 'copy'. */
  metaPosition?: 'copy' | 'side';
  /** Checklist card title + rows. Omit for a copy-only hero. */
  checklistTitle?: string;
  checklist?: string[];
  checklistLabel?: string;
  /** aria-label for the banner. Defaults to "<title> highlights". */
  label?: string;
  /** Compact density for page headers (was `mpg-hero--compact`). */
  density?: PageHeroDensity;
  /**
   * SPA navigation interceptor provided by the host shell.
   * When set, `to` actions navigate client-side; otherwise plain anchors.
   */
  onNavigate?: (to: string) => void;
  /** Extra class appended to the banner. */
  className?: string;
}

/** Registry type for route-bound heroes (registries stay app-owned). */
export type PageHeroRegistry = Record<string, PageHeroProps>;

// ─── Status tones (canonical status tokens, never literals) ────
//
// Static class literals only: Tailwind generates utilities from source
// text, so tones must never be interpolated into dynamic class strings.

const STATUS_DOT: Record<PageHeroStatusTone, string> = {
  success: 'bg-[var(--vestara-status-success)] shadow-[0_0_8px_var(--vestara-status-success)]',
  warning: 'bg-[var(--vestara-status-warning)] shadow-[0_0_8px_var(--vestara-status-warning)]',
  error: 'bg-[var(--vestara-status-error)] shadow-[0_0_8px_var(--vestara-status-error)]',
  info: 'bg-[var(--vestara-status-info)] shadow-[0_0_8px_var(--vestara-status-info)]',
};

// ─── Banner + panel styles (mpg-hero grammar, token utilities) ─

const BANNER_BASE =
  'relative overflow-hidden flex flex-wrap gap-4 justify-between rounded-[var(--vestara-radius-lg,8px)] border border-[var(--vestara-accent-border)] px-6 py-5';

const BANNER_BACKGROUND =
  'bg-[radial-gradient(90%_130%_at_85%_10%,color-mix(in_srgb,var(--vestara-marketplace-primary)_15%,transparent),transparent_60%),radial-gradient(70%_100%_at_15%_0%,color-mix(in_srgb,var(--vestara-accent)_8%,transparent),transparent_55%),var(--vestara-hero-bg,var(--vestara-shell-bg,var(--vestara-surface-panel)))]';

const BANNER_BACKGROUND_LIGHT =
  "[[data-theme='light']_&]:bg-[radial-gradient(90%_130%_at_85%_10%,color-mix(in_srgb,var(--vestara-marketplace-primary)_22%,transparent),transparent_60%),radial-gradient(70%_100%_at_15%_0%,color-mix(in_srgb,var(--vestara-accent)_12%,transparent),transparent_55%),var(--vestara-hero-bg,var(--vestara-shell-bg,var(--vestara-surface-panel)))]";

const PRIMARY_ACTION =
  'rounded-[var(--vestara-radius,6px)] px-4 py-1.5 text-[13px] font-semibold text-[var(--vestara-on-accent)] bg-[var(--vestara-accent)] border border-[var(--vestara-accent-border-active)] shadow-[0_0_14px_var(--vestara-surface-glow)] transition-[filter] duration-150 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed';

const SECONDARY_ACTION =
  'rounded-full border border-[var(--vestara-border-default)] px-3.5 py-1.5 text-[13px] text-[var(--vestara-text-secondary)] bg-transparent transition-colors duration-150 hover:text-[var(--vestara-text-primary)] hover:border-[var(--vestara-marketplace-primary-border)] disabled:opacity-50 disabled:cursor-not-allowed';

const STAT_PILL =
  'relative isolate overflow-hidden rounded-xl border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg,var(--vestara-card-bg,var(--vestara-shell-bg)))] shadow-[0_0_0_1px_var(--vestara-surface-glow),0_0_12px_var(--vestara-surface-glow),inset_0_1px_0_var(--vestara-surface-sheen)] flex items-center gap-2 px-3 py-2';

// ─── Subcomponents ─────────────────────────────────────────────

function HeroStatPill({ label, value, color = 'text-[var(--vestara-text-primary)]' }: PageHeroStat) {
  return (
    <div className={STAT_PILL}>
      <span className="relative z-[2] flex items-center gap-2">
        <span className={`text-lg font-bold ${color}`}>{value}</span>
        <span className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">{label}</span>
      </span>
    </div>
  );
}

function HeroAction({ action, onNavigate }: { action: PageHeroAction; onNavigate?: (to: string) => void }) {
  const className = `${action.primary ? PRIMARY_ACTION : SECONDARY_ACTION} inline-flex items-center gap-1`;
  const content = (
    <>
      {action.glyph && (
        <span aria-hidden="true" className="inline-flex items-center">
          {action.glyph}{' '}
        </span>
      )}
      {action.label}
    </>
  );
  if (action.to) {
    return (
      <a
        key={action.label}
        href={action.to}
        className={className}
        title={action.title}
        aria-disabled={action.disabled}
        onClick={
          onNavigate
            ? (event) => {
                event.preventDefault();
                if (!action.disabled) onNavigate(action.to as string);
              }
            : undefined
        }
      >
        {content}
      </a>
    );
  }
  return (
    <button
      key={action.label}
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={className}
      title={action.title}
    >
      {content}
    </button>
  );
}

// ─── PageHero ───────────────────────────────────────────────────

export function PageHero({
  eyebrow,
  statusTone = 'success',
  title,
  titleAs = 'h1',
  subtitle,
  quote,
  search,
  actions,
  stats,
  meta,
  metaPosition = 'copy',
  checklistTitle,
  checklist,
  checklistLabel,
  label,
  density = 'default',
  onNavigate,
  className,
}: PageHeroProps) {
  const Title = titleAs;
  const hasMeta = Boolean(meta) || (stats && stats.length > 0);
  const hasSide =
    (actions && actions.length > 0) || (checklist && checklist.length > 0) || (metaPosition === 'side' && hasMeta);
  return (
    <section
      className={`${BANNER_BASE} ${BANNER_BACKGROUND} ${BANNER_BACKGROUND_LIGHT} ${density === 'compact' ? 'px-5 py-4' : ''} ${className ?? ''}`}
      aria-label={label ?? `${title ?? 'Page'} highlights`}
    >
      <div className="min-w-[min(100%,320px)] flex-[1_1_320px] min-w-0 overflow-hidden">
        {eyebrow && (
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--vestara-accent)]">
            <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[statusTone]}`} />
            {eyebrow}
          </p>
        )}
        <Title
          className="mt-2 block max-w-full truncate whitespace-nowrap text-[28px] font-bold tracking-tight text-[var(--vestara-text-primary)] sm:text-[34px]"
          title={title}
        >
          {title}
        </Title>
        {subtitle && <p className="mt-2 text-[15px] font-medium text-[var(--vestara-text-secondary)]">{subtitle}</p>}
        {quote && (
          <p className="mt-4 max-w-md text-[13px] italic leading-relaxed text-[var(--vestara-text-secondary)]">
            {quote}
          </p>
        )}
        {search && (
          <div className="mt-3.5 flex max-w-md items-center gap-2 rounded-[var(--vestara-radius,6px)] border border-[var(--vestara-border-default)] bg-[color-mix(in_srgb,var(--vestara-surface-canvas)_80%,transparent)] px-3 py-2 text-[var(--vestara-text-muted)]">
            <span aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor={search.inputId ?? 'page-hero-search'}>
              {search.label ?? 'Search'}
            </label>
            <input
              id={search.inputId ?? 'page-hero-search'}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vestara-text-primary)] outline-none"
            />
          </div>
        )}
        {metaPosition !== 'side' && (meta || (stats && stats.length > 0)) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {meta}
            {stats?.map((stat) => (
              <HeroStatPill key={stat.label} {...stat} />
            ))}
          </div>
        )}
      </div>
      {hasSide && (
        <div className="ml-auto flex min-w-[min(100%,220px)] flex-[0_1_260px] flex-col items-end justify-center gap-3.5 text-right">
          {actions && actions.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions.map((action) => (
                <HeroAction key={action.label} action={action} onNavigate={onNavigate} />
              ))}
            </div>
          )}
          {metaPosition === 'side' && hasMeta && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {meta}
              {stats?.map((stat) => (
                <HeroStatPill key={stat.label} {...stat} />
              ))}
            </div>
          )}
          {checklist && checklist.length > 0 && (
            <aside
              className="w-full flex-none self-stretch rounded-[var(--vestara-radius,6px)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-accent-bg)] px-4 py-3.5 text-left"
              aria-label={checklistLabel ?? checklistTitle ?? 'Highlights'}
            >
              {checklistTitle && (
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--vestara-accent)]">
                  {checklistTitle}
                </p>
              )}
              <ul className="flex flex-col gap-2 text-[13px] text-[var(--vestara-text-secondary)]">
                {checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}

// ─── RouteHero (router-free) ────────────────────────────────────
//
// Merges static defaults from an app-owned registry under per-page
// overrides. Route resolution (useLocation, APP_ROUTES) stays in
// apps/workspace — this component never sees a router.

export interface RouteHeroProps extends PageHeroProps {
  /** Static defaults, typically `ROUTE_HERO_CONFIG[routeId]` (app-owned). */
  defaults?: PageHeroProps;
}

/** Pure defaults merge (underrides, then explicit overrides win). */
export function mergeHeroDefaults(defaults?: PageHeroProps, overrides?: PageHeroProps): PageHeroProps {
  return { ...defaults, ...overrides };
}

/** Status-dot utility classes for a tone (static literals for Tailwind). */
export function pageHeroStatusDotClass(tone: PageHeroStatusTone = 'success'): string {
  return STATUS_DOT[tone];
}

export function RouteHero({ defaults, ...overrides }: RouteHeroProps) {
  return <PageHero {...mergeHeroDefaults(defaults, overrides)} />;
}
