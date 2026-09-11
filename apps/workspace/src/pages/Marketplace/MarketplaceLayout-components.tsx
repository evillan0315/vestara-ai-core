/**
 * VES-DESIGN-004A: Marketplace Reusable Layout & Composition
 *
 * Reusable structural components for Marketplace pages.
 * Extracts the proven design grammar from Discover + Capabilities.
 *
 * Composition hierarchy:
 *   Vestara Design System → MarketplaceLayout → Marketplace Pages
 *
 * Ownership: apps/workspace (Marketplace presentation)
 * Authority: None — pure presentation, no domain behavior.
 */

import type { ReactNode } from 'react';

// ─── MarketplacePage ────────────────────────────────────────

/**
 * Reusable page container for Marketplace surfaces.
 * Provides consistent header, description, stats, and content area.
 */
export interface MarketplacePageProps {
  /** Page title. */
  title: string;
  /** Concise page description. */
  description?: string;
  /** Optional stat pills rendered below the header. */
  stats?: ReactNode;
  /** Toolbar/filter region rendered below stats. */
  toolbar?: ReactNode;
  /** Page-specific content. */
  children: ReactNode;
}

export function MarketplacePage({ title, description, stats, toolbar, children }: MarketplacePageProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">{title}</h2>
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

// ─── MarketplaceStatPill ─────────────────────────────────────

/**
 * Reusable stat display for Marketplace summaries.
 */
export interface MarketplaceStatPillProps {
  label: string;
  value: string | number;
  color?: string;
}

export function MarketplaceStatPill({ label, value, color = 'text-zinc-100' }: MarketplaceStatPillProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">{label}</span>
    </div>
  );
}

// ─── MarketplaceToolbar ──────────────────────────────────────

/**
 * Reusable search + filter toolbar for Marketplace pages.
 */
export interface MarketplaceToolbarProps {
  /** Search input value. */
  searchValue: string;
  /** Search input change handler. */
  onSearchChange: (value: string) => void;
  /** Search placeholder text. */
  searchPlaceholder?: string;
  /** Filter buttons. */
  filters?: Array<{ id: string; label: string; active: boolean }>;
  /** Filter change handler. */
  onFilterChange?: (filterId: string) => void;
  /** Optional action button(s) on the right. */
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
          className={`rounded-md border px-3 py-2 text-sm transition-colors ${
            f.active
              ? 'border-sky-500 text-sky-400 bg-sky-950/30'
              : 'border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] text-[var(--vestara-text-muted,var(--color-zinc-400))] hover:text-zinc-200'
          }`}
        >
          {f.label}
        </button>
      ))}
      {actions && <div className="ml-auto">{actions}</div>}
    </div>
  );
}

// ─── MarketplaceEmptyState ───────────────────────────────────

/**
 * Reusable empty state for Marketplace pages.
 */
export interface MarketplaceEmptyStateProps {
  message?: string;
}

export function MarketplaceEmptyState({ message = 'Nothing found.' }: MarketplaceEmptyStateProps) {
  return (
    <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-12 text-center">
      <div className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">{message}</div>
    </div>
  );
}

// ─── MarketplaceLoadingState ─────────────────────────────────

/**
 * Reusable loading state for Marketplace pages.
 */
export interface MarketplaceLoadingStateProps {
  message?: string;
}

export function MarketplaceLoadingState({ message = 'Loading…' }: MarketplaceLoadingStateProps) {
  return (
    <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-12 text-center">
      <div className="text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">{message}</div>
    </div>
  );
}

// ─── MarketplaceErrorState ───────────────────────────────────

/**
 * Reusable error state for Marketplace pages.
 */
export interface MarketplaceErrorStateProps {
  message: string;
}

export function MarketplaceErrorState({ message }: MarketplaceErrorStateProps) {
  return (
    <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}

// ─── MarketplaceSection ──────────────────────────────────────

/**
 * Reusable section header for grouping Marketplace content.
 */
export interface MarketplaceSectionProps {
  title: string;
  children: ReactNode;
}

export function MarketplaceSection({ title, children }: MarketplaceSectionProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-zinc-300">{title}</h3>
      {children}
    </div>
  );
}
