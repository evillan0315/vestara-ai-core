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

export function Status({ value, bare = false }: { value: string | boolean; bare?: boolean }) {
  const normalized = String(value).toLowerCase();
  const positive =
    value === true || ['healthy', 'running', 'available', 'connected', 'passed', 'ok', 'ready'].includes(normalized);
  const negative = value === false || ['failed', 'error', 'unavailable', 'degraded'].includes(normalized);
  // Canonical lamp owns the dot; the pill carries the label. Unknown stays
  // neutral — statuses are never inferred for appearance. `bare` renders the
  // borderless hero/card form (colored text + lamp, no pill container).
  const variant: StatusVariant = positive ? 'live' : negative ? 'error' : 'idle';
  if (bare) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[var(--vestara-font-size-sm)] font-medium ${positive ? 'text-[var(--vestara-green)]' : negative ? 'text-[var(--vestara-red)]' : 'text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]'}`}
      >
        <StatusIndicator variant={variant} size="xs" pulse={false} aria-hidden />
        {String(value)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--vestara-radius-full)] border px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium ${positive ? 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)] text-[var(--vestara-green)]' : negative ? 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)] text-[var(--vestara-red)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]'}`}
    >
      <StatusIndicator variant={variant} size="xs" pulse={false} aria-hidden />
      {String(value)}
    </span>
  );
}

export function Source({ setting }: { setting: ResolvedSetting }) {
  return (
    <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-2 py-0.5 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
      {setting.source === 'default'
        ? 'Built-in default'
        : `${setting.source}${setting.inherited ? ' · inherited' : ' · override'}`}
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
            <span className="hidden size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] font-mono text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:grid">
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
 * VES-DESIGN-007A: domain summary card for /settings/overview.
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
      className={`min-h-9 whitespace-nowrap rounded-[var(--vestara-radius)] border px-3 text-[var(--vestara-font-size-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focus} ${primary ? 'border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent)] text-[var(--color-zinc-950)] hover:bg-[var(--vestara-accent-light)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`min-h-7 rounded-[var(--vestara-radius)] border px-2.5 text-[var(--vestara-font-size-xs)] capitalize ${focus} ${value === option ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]' : 'border-transparent text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
          >
            {option}
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
        className={`absolute top-0.5 size-4 rounded-full bg-[var(--color-zinc-50)] shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
