import type { ResolvedSetting } from '@vestara/configuration';
import type { ReactNode } from 'react';
import { StatusIndicator, type StatusVariant } from '@vestara/ui';
import '../../styles/marketplace.css';
import './settings.tokens.css';

/** Presentation-only capitalization for hero/card labels. Values stay authoritative. */
export function humanize(value: string): string {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export const surface =
  'border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)]';
export const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset';
export const input = `min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] ${focus}`;

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4 transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="m7 4 6 6-6 6" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" />
    </svg>
  );
}

/**
 * VDS-REPAIR-001: canonical provider operational states.
 *
 * Authority: `ProviderOperationalState` in
 * packages/routing-types/src/provider-state.ts
 * (healthy | degraded | unavailable | cooling-down | disabled |
 *  authentication-required | rate-limited) plus the VDS cross-surface
 * `conflict` state (packages/tui/src/theme.ts `VdsStatus`).
 *
 * This table is a presentation projection, not a status authority:
 * state meaning lives in the canonical vocabularies; here each state
 * only selects a shared StatusIndicator lamp. Status meaning is carried
 * by the visible text label + aria-label below, never by color alone.
 */
const PROVIDER_STATE_VARIANT: Record<string, StatusVariant> = {
  healthy: 'live',
  degraded: 'warn',
  'cooling-down': 'warn',
  'rate-limited': 'warn',
  'authentication-required': 'warn',
  unavailable: 'error',
  conflict: 'error',
  disabled: 'idle',
};

export function Status({ value, bare = false, title }: { value: string | boolean; bare?: boolean; title?: string }) {
  const normalized = String(value).toLowerCase();
  const positive =
    value === true ||
    ['healthy', 'running', 'available', 'connected', 'configured', 'protected', 'synchronized', 'passed', 'ok', 'ready'].includes(
      normalized,
    );
  const negative = value === false || ['failed', 'error', 'unavailable', 'degraded'].includes(normalized);
  // Canonical lamp owns the dot; the pill carries the label. Unknown stays
  // neutral — statuses are never inferred for appearance. `bare` renders the
  // borderless hero/card form (colored text + lamp, no pill container).
  // Canonical provider states resolve first so Workspace Status UI and the
  // CLI/TUI adapters project the same semantic state; text tone derives
  // from the resolved variant so lamp and label never disagree.
  const canonicalVariant = PROVIDER_STATE_VARIANT[normalized];
  const variant: StatusVariant =
    canonicalVariant ?? (positive ? 'live' : negative ? 'error' : 'idle');
  const tone = variant === 'live' ? 'positive' : variant === 'error' ? 'negative' : variant === 'warn' ? 'warn' : 'neutral';
  if (bare) {
    return (
      <span
        title={title ?? `Current status: ${String(value)}`}
        aria-label={title ?? `Current status: ${String(value)}`}
        className={`inline-flex items-center gap-1.5 text-[var(--vestara-font-size-sm)] font-medium ${tone === 'positive' ? 'text-[var(--vestara-green)]' : tone === 'negative' ? 'text-[var(--vestara-red)]' : tone === 'warn' ? 'text-[var(--vestara-amber)]' : 'text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]'}`}
      >
        <StatusIndicator variant={variant} size="xs" pulse={false} aria-hidden />
        {String(value)}
      </span>
    );
  }
  return (
    <span
      title={title ?? `Current status: ${String(value)}`}
      aria-label={title ?? `Current status: ${String(value)}`}
      className={`inline-flex items-center gap-1.5 rounded-[var(--vestara-radius-full)] border px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium ${tone === 'positive' ? 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)] text-[var(--vestara-green)]' : tone === 'negative' ? 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)] text-[var(--vestara-red)]' : tone === 'warn' ? 'border-[color-mix(in_srgb,var(--vestara-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-amber)_9%,transparent)] text-[var(--vestara-amber)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]'}`}
    >
      <StatusIndicator variant={variant} size="xs" pulse={false} aria-hidden />
      {String(value)}
    </span>
  );
}

export function Source({ setting }: { setting: ResolvedSetting }) {
  if (setting.source === 'default') return null;
  return (
    <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-2 py-0.5 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
      {`${setting.source}${setting.inherited ? ' · inherited' : ' · override'}`}
    </span>
  );
}

export interface SettingsRowProps {
  label: string;
  description?: string;
  value?: ReactNode;
  /** Legacy two-letter tile. Rendered only when no icon is provided. */
  code?: string;
  /** Canonical workspace icon tile — preferred over `code`. */
  icon?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}

export function SettingsRow({ label, description, value, code, icon, onClick, children }: SettingsRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] [&_svg]:size-4"
          >
            {icon}
          </span>
        ) : (
          code && (
            <span className="hidden size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:grid">
              {code}
            </span>
          )
        )}
        <span className="min-w-0">
          <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            {label}
          </span>
          {description && (
            <span className="mt-0.5 block text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {description}
            </span>
          )}
        </span>
      </span>
      <span className="flex min-w-0 items-center justify-start gap-3 text-left text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] sm:justify-end sm:text-right">
        {value}
        {onClick && <Chevron />}
      </span>
      {children}
    </>
  );
  const classes = `group grid min-h-14 grid-cols-1 items-center gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-5 ${onClick ? `w-full text-left transition-colors hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))] ${focus}` : ''}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  // VES-DESIGN-007A: navy-elevated configuration panel (st-panel). Dark
  // neutral base + subtle blue elevation + hairline border; purple survives
  // in tiles, active states, and primary actions — it guides, not fills.
  return (
    <section className="st-panel mpg-enter overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {description}
            </p>
          )}
        </div>
        {actions}
      </header>
      <div>{children}</div>
    </section>
  );
}

/**
 * VES-DESIGN-007A: domain summary card for the Overview page snapshot.
 *
 * Settings-specific composition over generic grammar (st-panel surface,
 * canonical icon tile, Status pill): icon + title + status badge header,
 * muted description, then compact fact rows. Keeps overview → summarized
 * while domains stay organized below.
 */
export function SettingsDomainCard({
  icon,
  iconTone = 'var(--vestara-accent-text)',
  title,
  badge,
  description,
  action,
  children,
  index = 0,
}: {
  icon: ReactNode;
  iconTone?: string;
  title: string;
  badge?: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  index?: number;
}) {
  return (
    <section
      aria-label={title}
      className="st-panel mpg-enter flex min-w-0 flex-col p-4"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-[var(--vestara-radius)] border text-[var(--vestara-accent-text)] [&_svg]:size-[18px]"
            style={{
              color: iconTone,
              background: `color-mix(in srgb, ${iconTone} 12%, transparent)`,
              borderColor: `color-mix(in srgb, ${iconTone} 30%, transparent)`,
            }}
          >
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
              {title}
            </span>
          </span>
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      {description && (
        <p className="mt-2 text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          {description}
        </p>
      )}
      <div className="mt-2 min-w-0 flex-1">{children}</div>
      {action && <div className="mt-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pt-3">{action}</div>}
    </section>
  );
}

/**
 * Compact key/value fact row for domain cards. Statuses render as semantic
 * (bare lamp + colored text); plain configuration values stay plain primary
 * text — the semantic distinction is preserved, not flattened.
 */
export function FactRow({
  icon,
  label,
  value,
  isStatus = false,
  title,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  isStatus?: boolean;
  title?: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] py-2 first:border-t-0"
      title={title}
    >
      {icon && (
        <span aria-hidden="true" className="shrink-0 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] [&_svg]:size-4">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
        {label}
      </span>
      <span className="shrink-0 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))]">
        {isStatus && typeof value === 'string' ? <Status bare value={value} /> : value}
      </span>
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-9 whitespace-nowrap rounded-[var(--vestara-radius)] border px-3 text-[var(--vestara-font-size-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focus} ${primary ? 'border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent-dark)] text-[var(--vestara-surface-canvas)] hover:bg-[var(--vestara-accent)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
    >
      {children}
    </button>
  );
}

export type SegmentedOption<T extends string> = T | { value: T; label: string };

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  const normalized = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] p-1">
        {normalized.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-[var(--vestara-radius)] border px-3 text-[var(--vestara-font-size-xs)] capitalize ${focus} ${value === option.value ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]' : 'border-transparent text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 rounded-[var(--vestara-radius-full)] border transition-colors ${focus} ${checked ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent)]' : 'border-[var(--vestara-color-border-strong,var(--color-zinc-600))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'}`}
    >
      <span
        className={`absolute left-0.5 top-1 size-4 rounded-full bg-[var(--color-zinc-50)] shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export function SectionIcon({ icon, tone = 'accent' }: { icon: ReactNode; tone?: 'accent' | 'info' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-11 shrink-0 place-items-center rounded-[var(--vestara-radius)] border [&_svg]:size-5 ${
        tone === 'info'
          ? 'border-[color-mix(in_srgb,var(--vestara-status-info)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-status-info)_12%,transparent)] text-[var(--vestara-status-info)]'
          : 'border-[color-mix(in_srgb,var(--vestara-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-accent)_12%,transparent)] text-[var(--vestara-accent-text)]'
      }`}
    >
      {icon}
    </span>
  );
}

export function ReferenceCard({
  icon,
  title,
  description,
  children,
  className = '',
  actions,
  tone = 'accent',
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  tone?: 'accent' | 'info';
}) {
  return (
    <section className={`st-panel min-w-0 ${className}`}>
      <header className="st-card-header st-gap-field st-px-card st-py-card flex min-w-0 items-start border-b border-[var(--vestara-border-subtle)]">
        <SectionIcon icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">{title}</h2>
          {description && (
            <p
              title={description}
              className="st-mt-element block max-w-2xl truncate text-[var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-muted)]"
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className="st-card-body st-pad-card">{children}</div>
    </section>
  );
}
