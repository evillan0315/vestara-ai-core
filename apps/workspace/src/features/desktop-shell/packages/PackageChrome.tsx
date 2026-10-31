/**
 * VES-UI-001 packages: shared sub-header + state primitives.
 *
 * Single source for the `Title + LIVE/SNAPSHOT Pill + primary action` bar
 * that replaces the five bespoke `h-9` bars across the package windows,
 * plus token-bound empty / skeleton / search primitives.
 *
 * Visual roles bind to the scoped `--ds-*` layer (which resolves to
 * `--vestara-*`), never hex literals. Loading skeletons use the
 * `.ds-skeleton` pulse defined in `desktop-shell.tokens.css`.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (packages polish)
 */

import type { ReactNode } from 'react';

/** Live versus fixture-snapshot provenance badge. */
export function PackageLiveBadge({ isLive, liveLabel = 'LIVE', snapshotLabel = 'SNAPSHOT' }: {
  readonly isLive: boolean;
  readonly liveLabel?: string;
  readonly snapshotLabel?: string;
}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] ${
        isLive
          ? 'border-[var(--ds-success)] bg-[var(--ds-success-bg)] text-[var(--ds-success)]'
          : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-secondary)]'
      }`}
    >
      {isLive ? liveLabel : snapshotLabel}
    </span>
  );
}

/**
 * Shared package sub-header: eyebrow title + live badge + optional meta
 * and primary action. Renders the 36px bar (`h-9`) with a bottom hairline.
 */
export function PackageSubHeader({
  eyebrow,
  isLive,
  liveLabel,
  meta,
  action,
}: {
  readonly eyebrow: string;
  readonly isLive: boolean;
  readonly liveLabel?: string;
  readonly meta?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] px-[var(--vestara-spacing-3)]">
      <div className="flex min-w-0 items-center gap-[var(--vestara-spacing-2)]">
        <span className="truncate text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
          {eyebrow}
        </span>
        <PackageLiveBadge isLive={isLive} liveLabel={liveLabel} />
        {meta}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-[var(--vestara-spacing-1)]">{action}</div> : null}
    </div>
  );
}

/** Token-bound ghost action button used for Reload / New session / Clear. */
export function PackageGhostButton({
  children,
  onClick,
  label,
  disabled,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="min-h-[28px] shrink-0 rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Token-bound empty state for zero-result package surfaces. */
export function PackageEmpty({ title, hint }: { readonly title: string; readonly hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius-md)] border border-dashed border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-4)] text-center">
      <div className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--ds-text)]">{title}</div>
      {hint ? (
        <div className="max-w-[280px] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

/** Pulse skeleton cards shown while a package hook is loading. */
export function PackageSkeleton({ count = 3, label = 'Loading' }: { readonly count?: number; readonly label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-[var(--vestara-spacing-2)]">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={`ds-skeleton-${index}`}
          className="ds-skeleton h-[52px] rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)]"
        />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Token-bound filter input shared by list packages (agents/files/activity/marketplace). */
export function PackageSearchInput({
  id,
  value,
  onChange,
  label,
  placeholder,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly label: string;
  readonly placeholder: string;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-1 text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-focus-ring)]"
      />
    </>
  );
}
