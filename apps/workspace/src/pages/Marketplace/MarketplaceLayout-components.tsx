/**
 * Marketplace Premium Gallery (v7.14) — composition primitives.
 *
 * Premium product cards with holographic overlay, hover glow, left
 * accent, and status footer. Built on `@vestara/ui` (Button, Badge,
 * Card, StatusIndicator, EmptyState, Table) with the gallery chamber
 * treatments from `styles/marketplace.css`.
 *
 * Backward compatible: MarketplacePage, MarketplaceStatPill,
 * MarketplaceToolbar, MarketplaceEmptyState, MarketplaceLoadingState,
 * MarketplaceErrorState, MarketplaceSection keep their props so
 * existing tests and pages continue to work.
 *
 * Ownership: apps/workspace (Marketplace presentation)
 * Authority: None — pure presentation, no domain behavior.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, EmptyState, StatusIndicator } from '@vestara/ui';

// ─── Type accent colors ─────────────────────────────────────────
// VES-DESIGN-005: canonical marketplace tokens (dark/light aware).
// Never hardcode hex here — theme.tsx + generated-tokens.css own values.

const TYPE_ACCENTS: Record<string, string> = {
  agent: 'var(--vestara-marketplace-agent)',
  skill: 'var(--vestara-marketplace-skill)',
  provider: 'var(--vestara-marketplace-provider)',
  theme: 'var(--vestara-marketplace-theme)',
  workflow: 'var(--vestara-marketplace-workflow)',
  'mcp-server': 'var(--vestara-marketplace-mcp)',
  mcpserver: 'var(--vestara-marketplace-mcp)',
  command: 'var(--vestara-marketplace-command)',
  module: 'var(--vestara-marketplace-module)',
  plugin: 'var(--vestara-marketplace-plugin)',
  'standards-pack': 'var(--vestara-marketplace-standards)',
};

export function typeAccent(type: string): string {
  return TYPE_ACCENTS[type] ?? 'var(--vestara-accent)';
}

function typeBadgeVariant(type: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (type) {
    case 'agent':
    case 'plugin':
      return 'info';
    case 'skill':
    case 'module':
      return 'default';
    case 'provider':
    case 'standards-pack':
      return 'success';
    case 'theme':
    case 'workflow':
      return 'warning';
    case 'mcp-server':
    case 'command':
      return 'error';
    default:
      return 'default';
  }
}

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

export function GalleryCard({ accent = 'var(--vestara-accent)', children, className = '' }: GalleryCardProps) {
  return (
    <div className={`mpg-card p-4 ${className}`}>
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}

// ─── AssetCard ──────────────────────────────────────────────────
// v2 (assets/vestara-marketplace-02-screen.png): icon box + name/publisher,
// 2-line summary, tag pills, version/verified footer + Install affordance.
// Outer element stays a Link so existing Discover tests and routes keep working.

export interface AssetCardProps {
  to: string;
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
}

export function AssetCard({
  to,
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
}: AssetCardProps) {
  const accent = typeAccent(type);
  const initial = (displayName.trim().charAt(0) || 'V').toUpperCase();
  const tagPills = tags.slice(0, 3);
  return (
    <Link
      to={to}
      className="mpg-card mpg-enter mpg-asset block p-4"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <div className="relative z-[2]">
        <div className="flex items-start gap-3">
          <span
            className="mpg-icon-box"
            style={{ color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }}
            aria-hidden="true"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--vestara-text-primary,var(--color-zinc-100))]">
                  {displayName}
                </div>
                <div className="mt-0.5 truncate text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  {publisherId ?? packageName.split('.')[0] ?? 'vestara'}
                </div>
              </div>
              {featured && <span className="mpg-featured-badge">★ Featured</span>}
            </div>
          </div>
        </div>
        {summary && (
          <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-[var(--vestara-text-secondary,var(--color-zinc-400))]">
            {summary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <TypeBadge type={type} />
          {tagPills.map((tag) => (
            <span key={tag} className="mpg-tag-pill">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--vestara-border-subtle,var(--color-zinc-800))] pt-3">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span
              className={verified ? 'text-[var(--vestara-status-success)]' : 'text-[var(--vestara-text-disabled)]'}
              title={verified ? 'Checksum verified' : 'Not verified'}
            >
              {verified ? '✓' : '○'}
            </span>
            <span className="font-mono text-[var(--vestara-text-muted)]">{latestVersion}</span>
          </div>
          <span className="mpg-install-btn" aria-hidden="true">
            Install
          </span>
        </div>
        {statusFooter && <div className="mt-2 flex flex-wrap items-center gap-2">{statusFooter}</div>}
        <span className="sr-only">{packageName}</span>
      </div>
    </Link>
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
  info: 'border-sky-800/50 bg-sky-950/30 text-sky-300',
  warning: 'border-amber-800/50 bg-amber-950/30 text-amber-300',
  error: 'border-red-800/50 bg-red-950/30 text-red-300',
  success: 'border-emerald-800/50 bg-emerald-950/30 text-emerald-300',
};

export function InsightBanner({ severity, title, description, action }: InsightBannerProps) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${INSIGHT_STYLES[severity]}`}>
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
        <div className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-sm font-semibold text-zinc-100">
          {title}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </section>
  );
}

// ─── UpdateGroup ────────────────────────────────────────────────

const UPDATE_ACCENTS: Record<string, string> = {
  compatible: '#34d399',
  breaking: '#fbbf24',
  incompatible: '#f87171',
};

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
  const accent = UPDATE_ACCENTS[id] ?? 'var(--vestara-accent)';
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading assets">
      {Array.from({ length: count }, (_, i) => (
        <div key={`skeleton-${i}`} className="mpg-skeleton h-32" />
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
}

export function MarketplacePage({ title, description, stats, toolbar, children }: MarketplacePageProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--vestara-text-primary,var(--color-zinc-100))]">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">{description}</p>
          )}
        </div>
        {stats}
        {toolbar}
      </div>
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

export function MarketplaceStatPill({ label, value, color = 'text-zinc-100' }: MarketplaceStatPillProps) {
  return (
    <div className="mpg-card flex items-center gap-2 px-3 py-2">
      <span className="relative z-[2] flex items-center gap-2">
        <span className={`text-lg font-bold ${color}`}>{value}</span>
        <span className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">{label}</span>
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
        className="w-full max-w-md rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] px-3 py-2 text-sm"
      />
      {filters?.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilterChange?.(f.id)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
            f.active
              ? 'border-[var(--vestara-accent-border-hover)] text-white shadow-[0_0_16px_var(--vestara-surface-glow-hover)]'
              : 'border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] text-[var(--vestara-text-muted,var(--color-zinc-400))] hover:text-zinc-200'
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

export function MarketplaceLoadingState({ message = 'Loading…' }: MarketplaceLoadingStateProps) {
  return <AssetGridSkeleton count={6} />;
}

export function MarketplaceLoadingMessage({ message = 'Loading…' }: MarketplaceLoadingStateProps) {
  return (
    <div className="mpg-card p-12 text-center">
      <div className="relative z-[2] text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">{message}</div>
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--vestara-text-primary,var(--color-zinc-200))]">{title}</h3>
        {action && <div className="text-xs">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── v2 Hero ──────────────────────────────────────────────────────
// assets/vestara-marketplace-02-screen.png: "Build More with Vestara"
// + inline search + right checklist card. All colors via tokens.

export function MarketplaceHero({
  query,
  onQueryChange,
  searchPlaceholder = 'Search assets by name, publisher, or capability…',
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <section className="mpg-hero" aria-label="Marketplace highlights">
      <div className="mpg-hero-copy">
        <h2 className="text-xl font-bold text-[var(--vestara-text-primary)] sm:text-2xl">Build More with Vestara</h2>
        <p className="mt-1 max-w-xl text-sm text-[var(--vestara-text-secondary)]">
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
      <aside className="mpg-hero-checklist" aria-label="Why extend">
        <ul>
          <li>◇ Extend your workspace</li>
          <li>⬔ Automate your workflow</li>
          <li>❖ Share with the community</li>
          <li>⬣ Build what&apos;s next</li>
        </ul>
      </aside>
    </section>
  );
}

// ─── v2 Filter pills + sort ───────────────────────────────────────

export type MarketplaceSortId = 'relevant' | 'popular' | 'newest' | 'name';

export const MARKETPLACE_SORTS: Array<{ id: MarketplaceSortId; label: string }> = [
  { id: 'relevant', label: 'Most Relevant' },
  { id: 'popular', label: 'Most Popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name A–Z' },
];

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
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Marketplace filters">
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
      {/* Sort is a button-menu (not a native select) so the type-filter
          select remains the single combobox in the page for a11y/tests. */}
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
        <h3 className="text-[13px] font-semibold text-[var(--vestara-text-primary)]">{title}</h3>
        {action && <div className="text-xs">{action}</div>}
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
