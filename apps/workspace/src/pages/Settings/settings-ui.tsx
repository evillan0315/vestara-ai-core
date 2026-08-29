import type { ResolvedSetting } from '@vestara/configuration';
import type { ReactNode } from 'react';

export const surface =
  'border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]';
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

export function Status({ value }: { value: string | boolean }) {
  const normalized = String(value).toLowerCase();
  const positive =
    value === true || ['healthy', 'running', 'available', 'connected', 'passed', 'ok', 'ready'].includes(normalized);
  const negative = value === false || ['failed', 'error', 'unavailable', 'degraded'].includes(normalized);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--vestara-radius-full)] border px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium ${positive ? 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)] text-[var(--vestara-green)]' : negative ? 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)] text-[var(--vestara-red)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]'}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
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
  code?: string;
  onClick?: () => void;
  children?: ReactNode;
}

export function SettingsRow({ label, description, value, code, onClick, children }: SettingsRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="hidden size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] font-mono text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:grid">
          {code}
        </span>
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
  return (
    <section
      className={`overflow-hidden rounded-[var(--vestara-radius-lg)] ${surface} shadow-[0_1px_0_rgb(255_255_255/0.02)_inset,0_12px_36px_rgb(0_0_0/0.18)]`}
    >
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
      className={`min-h-9 rounded-[var(--vestara-radius)] border px-3 text-[var(--vestara-font-size-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focus} ${primary ? 'border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent)] text-[var(--color-zinc-950)] hover:bg-[var(--vestara-accent-light)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
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
        className={`absolute top-0.5 size-4 rounded-full bg-[var(--color-zinc-50)] shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
