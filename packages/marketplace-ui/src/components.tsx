/**
 * @vestara/marketplace-ui — Discover Gallery Components
 *
 * Globally reusable Marketplace Discover presentation primitives.
 * Router-agnostic: navigation props carry `to` (app route path) rendered
 * as a plain anchor. SPA hosts pass `onNavigate` to intercept client-side;
 * without it the anchor performs a standard navigation. This package must
 * never import react-router, workspace code, or Activity Room contracts
 * (same rule as @vestara/ui PageHero).
 *
 * Styling: the canonical `mpg-*` gallery grammar bound to `var(--vestara-*)`
 * tokens only — colors from DISCOVER_COLORS, geometry from MARKETPLACE_LAYOUT
 * vars. Hosts ship the gallery stylesheet (workspace `marketplace.css`).
 *
 * Architecture Traceability:
 *   VES-DESIGN-005 §M: marketplace premium gallery
 *   Canonical authority — apps/workspace re-exports these verbatim.
 */

import { Badge, Button, EmptyState, StatusIndicator } from '@vestara/ui';
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react';
import { accentGlow, DISCOVER_ACCENT } from './accent.js';
import { MARKETPLACE_SORTS, type MarketplaceSortId, WORKSPACE_BENEFITS_FIXTURE } from './fixtures.js';
import { typeAccent, typeBadgeVariant, UPDATE_ACCENTS } from './tokens.js';

// ─── Navigation Helper ──────────────────────────────────────────

export type NavigateHandler = (to: string, event: MouseEvent) => void;

// ─── TypeBadge ──────────────────────────────────────────────────

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant={typeBadgeVariant(type)} size="md">
      {type}
    </Badge>
  );
}

// ─── GalleryCard ────────────────────────────────────────────────

export interface GalleryCardProps {
  accent?: string;
  children: ReactNode;
  className?: string;
}

export function GalleryCard({ accent = DISCOVER_ACCENT.fallback, children, className = '' }: GalleryCardProps) {
  return (
    <div className={`mpg-card p-[var(--vestara-spacing-page)] ${className}`}>
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}

// ─── AssetCard ──────────────────────────────────────────────────
// v2 gallery card: icon box + name/publisher, 2-line summary, tag pills,
// version/verified footer + Install affordance. Outer element is an anchor;
// SPA hosts pass onNavigate for client-side routing.

export type AssetInstallState = 'idle' | 'installing' | 'installed' | 'error';

export interface AssetCardProps {
  to: string;
  onNavigate?: NavigateHandler;
  displayName: string;
  packageName: string;
  publisherId?: string;
  type: string;
  summary?: string;
  tags?: string[];
  latestVersion: string;
  verified: boolean;
  featured?: boolean;
  statusFooter?: ReactNode;
  index?: number;
  /** Reference rating row — fixture or derived display metadata. */
  rating?: number;
  reviews?: number;
  installs?: string;
  /** Icon-tile glyph override (fixtures); defaults to the title initial. */
  glyph?: string;
  /** Icon-tile accent override; defaults to the type accent. */
  accentOverride?: string;
  /** Real install workflow; when omitted the card keeps a visual affordance. */
  onInstall?: () => void;
  installBusy?: boolean;
  installState?: 'idle' | 'installing' | 'installed' | 'error';
  className?: string;
}

export function AssetCard({
  to,
  onNavigate,
  displayName,
  packageName,
  publisherId,
  type,
  summary,
  tags = [],
  latestVersion,
  verified,
  featured = false,
  statusFooter,
  index = 0,
  rating,
  reviews,
  installs,
  glyph,
  accentOverride,
  onInstall,
  installBusy = false,
  installState = 'idle',
  className = '',
}: AssetCardProps) {
  const accent = accentOverride ?? typeAccent(type);
  const initial = (displayName.trim().charAt(0) || 'V').toUpperCase();
  const tagPills = tags.slice(0, 3);
  const installLabel =
    installState === 'installed'
      ? 'Installed ✓'
      : installState === 'installing' || installBusy
        ? 'Installing…'
        : installState === 'error'
          ? 'Retry'
          : 'Install';
  return (
    <a
      href={to}
      onClick={onNavigate ? (event) => onNavigate(to, event) : undefined}
      className={`mpg-card mpg-enter mpg-asset block p-[var(--vestara-spacing-section)] ${className}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <div className="relative z-[2] flex h-full flex-col">
        <div className="flex items-start gap-2">
          <span
            className="mpg-icon-box mpg-icon-solid"
            style={{ background: accent, boxShadow: accentGlow(accent) }}
            aria-hidden="true"
          >
            {glyph ?? initial}
          </span>
          <div className={`min-w-0 flex-1 ${featured ? 'pr-[72px]' : ''}`}>
            <div className="truncate text-[length:var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
              {displayName}
            </div>
            <div className="mt-0.5 truncate text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              {publisherId ?? packageName.split('.')[0] ?? 'vestara'}
            </div>
          </div>
        </div>
        {featured && <span className="mpg-featured-badge">★ Featured</span>}
        {summary && (
          <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
            {summary}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {tagPills.map((tag) => (
            <span key={tag} className="mpg-tag-pill">
              {tag}
            </span>
          ))}
        </div>
        <div className="mpg-asset-foot mt-auto flex items-center justify-between gap-1.5 pt-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[length:var(--vestara-font-size-xs)]">
            {rating !== undefined && (
              <span
                className="inline-flex items-center gap-1 font-medium text-[var(--vestara-marketplace-rating)]"
                title={verified ? 'Checksum verified' : undefined}
              >
                <span aria-hidden="true">★</span> {rating.toFixed(1)}
                {reviews !== undefined && (
                  <span className="font-normal text-[var(--vestara-text-muted)]">({reviews})</span>
                )}
              </span>
            )}
            {installs !== undefined && (
              <span className="inline-flex items-center gap-1 text-[var(--vestara-text-muted)]">
                <span aria-hidden="true">⤓</span> {installs}
              </span>
            )}
            {rating === undefined && installs === undefined && (
              <>
                <span
                  className={verified ? 'text-[var(--vestara-status-success)]' : 'text-[var(--vestara-text-disabled)]'}
                  title={verified ? 'Checksum verified' : 'Not verified'}
                >
                  {verified ? '✓' : '○'}
                </span>
                <span className="font-mono text-[var(--vestara-text-muted)]">{latestVersion}</span>
              </>
            )}
          </div>
          {onInstall ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onInstall();
              }}
              disabled={installBusy || installState === 'installing' || installState === 'installed'}
              className="mpg-install-btn"
              aria-label={`Install ${displayName}`}
            >
              {installLabel}
            </button>
          ) : (
            <span className="mpg-install-btn" aria-hidden="true">
              Install
            </span>
          )}
        </div>
        {statusFooter && <div className="mt-2 flex flex-wrap items-center gap-2">{statusFooter}</div>}
        <span className="sr-only">{packageName}</span>
      </div>
    </a>
  );
}

// ─── InsightBanner ──────────────────────────────────────────────

export interface InsightBannerProps {
  severity: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  description: ReactNode;
  action?: ReactNode;
}

const INSIGHT_STYLES: Record<InsightBannerProps['severity'], string> = {
  info: 'border-[var(--vestara-status-info-border)] bg-[var(--vestara-status-info-bg)] text-[var(--vestara-status-info)]',
  warning:
    'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]',
  error:
    'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]',
  success:
    'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]',
};

export function InsightBanner({ severity, title, description, action }: InsightBannerProps) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-[length:var(--vestara-font-size-base)] ${INSIGHT_STYLES[severity]}`}
    >
      {title && <div className="font-medium">{title}</div>}
      <div>{description}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─── DetailCard ─────────────────────────────────────────────────

export function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mpg-card mpg-hairline-top">
      <div className="relative z-[2]">
        <div className="border-b border-[var(--vestara-border-subtle)] px-4 py-3 text-[length:var(--vestara-font-size-base)] font-semibold text-[var(--vestara-text-primary)]">
          {title}
        </div>
        <div className="p-[var(--vestara-spacing-page)]">{children}</div>
      </div>
    </section>
  );
}

// ─── UpdateGroup ────────────────────────────────────────────────

export function UpdateGroup({
  id,
  label,
  count,
  children,
}: {
  id: 'compatible' | 'breaking' | 'incompatible';
  label: string;
  count: number;
  children: ReactNode;
}) {
  const accent = UPDATE_ACCENTS[id] ?? DISCOVER_ACCENT.fallback;
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-[length:var(--vestara-font-size-base)] font-medium text-[var(--vestara-text-secondary)]">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
        />
        {label} ({count})
      </h3>
      <div className="space-y-2" style={{ borderLeft: `3px solid ${accent}`, borderRadius: 8, paddingLeft: 12 }}>
        {children}
      </div>
    </div>
  );
}

// ─── AssetGridSkeleton ──────────────────────────────────────────

export function AssetGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-[var(--vestara-spacing-section)] md:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading assets"
    >
      {Array.from({ length: count }, (_, i) => `skeleton-${i}`).map((key) => (
        <div key={key} className="mpg-skeleton h-32" />
      ))}
    </div>
  );
}

// ─── ConfirmButton ──────────────────────────────────────────────

export function ConfirmButton({
  confirmLabel,
  children,
  variant = 'danger',
  disabled,
  onConfirm,
}: {
  confirmLabel: string;
  children: ReactNode;
  variant?: 'danger' | 'secondary';
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          variant="primary"
          size="sm"
          disabled={disabled}
          title={confirmLabel}
          aria-label={`Confirm ${typeof children === 'string' ? children.toLowerCase() : 'action'}`}
          onClick={(event) => {
            event.stopPropagation();
            setArmed(false);
            onConfirm();
          }}
        >
          Confirm
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label="Cancel"
          onClick={(event) => {
            event.stopPropagation();
            setArmed(false);
          }}
        >
          ✕
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant={variant === 'danger' ? 'danger' : 'secondary'}
        size="sm"
        disabled={disabled}
        title={confirmLabel}
        onClick={(event) => {
          event.stopPropagation();
          setArmed(true);
        }}
      >
        {children}
      </Button>
    </span>
  );
}

// ─── MarketplacePage (premium chamber section) ──────────────────

export interface MarketplacePageProps {
  title: string;
  description?: string;
  stats?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  /** Hide the title block — the layout owns the canonical Marketplace
      heading above the tabs (reference hierarchy, Discover only). */
  hideHeader?: boolean;
}

export function MarketplacePage({
  title,
  description,
  stats,
  toolbar,
  children,
  hideHeader = false,
}: MarketplacePageProps) {
  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--vestara-text-primary)]">{title}</h2>
            {description && (
              <p className="mt-1 text-[length:var(--vestara-font-size-base)] text-[var(--vestara-text-muted)]">
                {description}
              </p>
            )}
          </div>
          {stats}
          {toolbar}
        </div>
      )}
      {hideHeader && (stats || toolbar) ? (
        <>
          {stats}
          {toolbar}
        </>
      ) : null}
      {children}
    </div>
  );
}

// ─── MarketplaceStatPill ────────────────────────────────────────

export interface MarketplaceStatPillProps {
  label: string;
  value: string | number;
  color?: string;
}

export function MarketplaceStatPill({
  label,
  value,
  color = 'text-[var(--vestara-text-primary)]',
}: MarketplaceStatPillProps) {
  return (
    <div className="mpg-card flex items-center gap-2 px-3 py-2">
      <span className="relative z-[2] flex items-center gap-2">
        <span className={`text-lg font-bold ${color}`}>{value}</span>
        <span className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{label}</span>
      </span>
    </div>
  );
}

// ─── MarketplaceToolbar ─────────────────────────────────────────

export interface MarketplaceToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: Array<{ id: string; label: string; active: boolean }>;
  onFilterChange?: (filterId: string) => void;
  actions?: ReactNode;
}

export function MarketplaceToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters,
  onFilterChange,
  actions,
}: MarketplaceToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full max-w-md rounded-md border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3 py-2 text-[length:var(--vestara-font-size-base)]"
      />
      {filters?.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilterChange?.(f.id)}
          className={`rounded-full border px-3 py-1.5 text-[length:var(--vestara-font-size-base)] transition-all ${
            f.active
              ? 'border-[var(--vestara-accent-border-hover)] text-white shadow-[0_0_16px_var(--vestara-surface-glow-hover)]'
              : 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
          }`}
          style={f.active ? { background: 'color-mix(in srgb, var(--vestara-accent) 22%, transparent)' } : undefined}
        >
          {f.label}
        </button>
      ))}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── MarketplaceEmptyState ──────────────────────────────────────

export interface MarketplaceEmptyStateProps {
  message?: string;
}

export function MarketplaceEmptyState({ message = 'Nothing found.' }: MarketplaceEmptyStateProps) {
  return (
    <div className="mpg-card mpg-hairline-top">
      <div className="relative z-[2]">
        <EmptyState title={message} />
      </div>
    </div>
  );
}

// ─── MarketplaceLoadingState ────────────────────────────────────

export interface MarketplaceLoadingStateProps {
  message?: string;
}

export function MarketplaceLoadingState(_props: MarketplaceLoadingStateProps) {
  return <AssetGridSkeleton count={6} />;
}

export function MarketplaceLoadingMessage({ message = 'Loading…' }: MarketplaceLoadingStateProps) {
  return (
    <div className="mpg-card p-12 text-center">
      <div className="relative z-[2] text-[length:var(--vestara-font-size-base)] text-[var(--vestara-text-muted)]">
        {message}
      </div>
    </div>
  );
}

// ─── MarketplaceErrorState ──────────────────────────────────────

export interface MarketplaceErrorStateProps {
  message: string;
}

export function MarketplaceErrorState({ message }: MarketplaceErrorStateProps) {
  return <InsightBanner severity="error" description={message} />;
}

// ─── MarketplaceSection ─────────────────────────────────────────

export interface MarketplaceSectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export function MarketplaceSection({ title, action, children }: MarketplaceSectionProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[length:var(--vestara-font-size-base)] font-semibold text-[var(--vestara-text-primary)]">
          {title}
        </h3>
        {action && <div className="text-[length:var(--vestara-font-size-xs)]">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── SectionCard (v2 shell contract alias) ─────────────────────
// The v2 desktop shell composes sections via `SectionCard`. In the
// gallery package that contract is `MarketplaceSection` (titled section
// with optional action) — re-exported under the canonical name so
// shell hosts import one spelling alongside `GalleryCard`.

export type SectionCardProps = MarketplaceSectionProps;
export const SectionCard = MarketplaceSection;

// ─── v2 Hero ──────────────────────────────────────────────────────
// Discover hero row: "Build More with Vestara" panel (3/4) with inline
// search + futuristic blue geometric artwork (floating translucent
// cubes, central Vestara-branded cube), and the workspace-benefits
// card (Extend your workspace…) at 1/4 on its right (stacked on mobile).
//
// Artwork note: no matching hero asset exists in the repo (searched
// assets/, apps/workspace/public/, apps/workspace/src — only the gold
// V logo, wallpapers, and OS chrome). The artwork is therefore a
// lightweight inline SVG cube composition styled purely with
// var(--vestara-*) token classes from marketplace.css — no gradients
// blobs, no new assets, no hardcoded colors.

function HeroCube({ x, y, s, tone, label }: { x: number; y: number; s: number; tone: string; label?: string }) {
  const h = s / 2;
  return (
    <g className={tone}>
      <polygon points={`${x},${y - h} ${x + s},${y} ${x},${y + h} ${x - s},${y}`} className="mpg-cube-top" />
      <polygon points={`${x - s},${y} ${x},${y + h} ${x},${y + h + s} ${x - s},${y + s}`} className="mpg-cube-left" />
      <polygon points={`${x + s},${y} ${x},${y + h} ${x},${y + h + s} ${x + s},${y + s}`} className="mpg-cube-right" />
      {label && (
        <text x={x} y={y + h + s * 0.72} textAnchor="middle" className="mpg-cube-label">
          {label}
        </text>
      )}
    </g>
  );
}

export function MarketplaceHero({
  query,
  onQueryChange,
  searchPlaceholder = 'Search marketplace...',
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="mpg-hero-row">
      <section className="mpg-hero mpg-hero-discover" aria-label="Marketplace highlights">
        <div className="mpg-hero-copy">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-[var(--vestara-text-primary)]">
            Build More with Vestara
          </h2>
          <p className="mt-1.5 text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
            Agents, tools, templates, and integrations for a more capable tomorrow.
          </p>
          <div className="mpg-hero-search">
            <span aria-hidden="true">⌕</span>
            <label className="sr-only" htmlFor="marketplace-hero-search">
              Search marketplace
            </label>
            <input
              id="marketplace-hero-search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
        </div>
        <div className="mpg-hero-art" aria-hidden="true">
          <svg viewBox="170 0 250 210" preserveAspectRatio="xMidYMid slice" focusable="false" role="img">
            <title>Marketplace artwork</title>
            <HeroCube x={252} y={160} s={15} tone="mpg-cube-skill" />
            <HeroCube x={242} y={62} s={22} tone="mpg-cube-violet" />
            <HeroCube x={292} y={162} s={14} tone="mpg-cube-primary" />
            <HeroCube x={324} y={98} s={50} tone="mpg-cube-brand" label="V" />
            <HeroCube x={368} y={52} s={25} tone="mpg-cube-primary" />
            <HeroCube x={380} y={146} s={19} tone="mpg-cube-violet" />
            <HeroCube x={407} y={100} s={14} tone="mpg-cube-skill" />
          </svg>
        </div>
      </section>
      <aside className="mpg-benefits" aria-label="Why extend">
        <ul>
          {WORKSPACE_BENEFITS_FIXTURE.map((benefit) => (
            <li key={benefit.label}>
              <span className="mpg-benefits-icon" aria-hidden="true">
                {benefit.glyph}
              </span>
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// ─── v2 Filter pills + sort ───────────────────────────────────────
// Sort is a button-menu (not a native select) so a page-level native
// type-filter select remains the single combobox for a11y/tests.

export function MarketplaceFilterRow({
  filters,
  onFilterChange,
  sort,
  onSortChange,
}: {
  filters?: Array<{ id: string; label: string; active: boolean }>;
  onFilterChange?: (filterId: string) => void;
  sort: MarketplaceSortId;
  onSortChange: (sort: MarketplaceSortId) => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const activeSort = MARKETPLACE_SORTS.find((s) => s.id === sort) ?? MARKETPLACE_SORTS[0];
  return (
    <div className="mpg-filterbar" role="toolbar" aria-label="Marketplace filters">
      <div className="mpg-filterbar-pills">
        {filters?.map((f) => (
          <button
            key={f.id || 'all'}
            type="button"
            onClick={() => onFilterChange?.(f.id)}
            aria-pressed={f.active}
            className={`mpg-pill ${f.active ? 'mpg-pill-active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="mpg-sort-wrap">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          aria-label="Sort marketplace"
          onClick={() => setSortOpen((open) => !open)}
          className="mpg-sort"
        >
          Sort: {activeSort.label} ▾
        </button>
        {sortOpen && (
          <div role="menu" aria-label="Sort options" className="mpg-sort-menu">
            {MARKETPLACE_SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={s.id === sort}
                onClick={() => {
                  onSortChange(s.id);
                  setSortOpen(false);
                }}
                className={`mpg-sort-item ${s.id === sort ? 'mpg-sort-item-active' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── v2 Sidebar ───────────────────────────────────────────────────

export function MarketplaceSidebarCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mpg-side-card" aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="whitespace-nowrap text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-text-primary)]">
          {title}
        </h3>
        {action && <div className="shrink-0 text-[length:var(--vestara-font-size-xs)]">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// ─── Health helpers (StatusIndicator-backed) ────────────────────

export function RegistryHealthLamp({ status }: { status: string }) {
  const variant = status === 'healthy' ? 'live' : status === 'degraded' ? 'warn' : 'error';
  return <StatusIndicator variant={variant} size="sm" ariaLabel={status} />;
}
