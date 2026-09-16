/**
 * CI-UI-002 — Token-governed chrome for reusable CI presentation.
 *
 * Every class maps to a canonical `--vestara-*` token (see
 * docs/governance/UI-UX-GOVERNANCE.md). No raw palette utilities, no inline
 * CSS, no arbitrary hardcode. Components here are domain components (CI), so
 * they live in the workspace app rather than the domain-independent
 * `@vestara/ui` primitive package.
 */

import { StatusIndicator, type StatusVariant } from '@vestara/ui';
import type { ReactNode } from 'react';
import type { CIAvailability, CITone } from './ci-view-model.js';

// ─── Tone → token classes ───────────────────────────────────────────

interface ToneClasses {
  readonly text: string;
  readonly chip: string;
  readonly lamp: StatusVariant;
}

const TONE: Record<CITone, ToneClasses> = {
  positive: {
    text: 'text-[var(--vestara-status-success)]',
    chip:
      'border-[var(--vestara-status-success-border)] bg-[var(--vestara-status-success-bg)] text-[var(--vestara-status-success)]',
    lamp: 'live',
  },
  negative: {
    text: 'text-[var(--vestara-status-error)]',
    chip: 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] text-[var(--vestara-status-error)]',
    lamp: 'error',
  },
  warning: {
    text: 'text-[var(--vestara-status-warning)]',
    chip:
      'border-[var(--vestara-status-warning-border)] bg-[var(--vestara-status-warning-bg)] text-[var(--vestara-status-warning)]',
    lamp: 'warn',
  },
  info: {
    text: 'text-[var(--vestara-status-info)]',
    chip: 'border-[var(--vestara-status-info-border)] bg-[var(--vestara-status-info-bg)] text-[var(--vestara-status-info)]',
    lamp: 'live',
  },
  neutral: {
    text: 'text-[var(--vestara-text-secondary)]',
    chip: 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-text-secondary)]',
    lamp: 'idle',
  },
  unknown: {
    text: 'text-[var(--vestara-text-muted)]',
    chip: 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-text-muted)]',
    lamp: 'off',
  },
};

export function toneTextClass(tone: CITone): string {
  return TONE[tone].text;
}

// ─── Chip ───────────────────────────────────────────────────────────

export function CIToneChip({ tone, children }: { tone: CITone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--vestara-radius-full)] border px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium ${TONE[tone].chip}`}
    >
      <StatusIndicator variant={TONE[tone].lamp} size="xs" pulse={false} />
      {children}
    </span>
  );
}

// ─── Section heading (content, not a layout primitive) ──────────────

/**
 * Sub-heading for a content block inside a host-owned section (e.g. the
 * Settings `SettingsSection`). The host owns card chrome/padding; this only
 * provides the label hierarchy.
 */
export function CISubHeading({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4 sm:px-5">
      <h3 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">{title}</h3>
      {actions}
    </div>
  );
}

// ─── Fact row ───────────────────────────────────────────────────────

export function CIFact({
  label,
  value,
  tone,
  mono = false,
  title,
}: {
  label: string;
  value: ReactNode;
  tone?: CITone;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-3 border-t border-[var(--vestara-border-subtle)] px-4 py-2.5 first:border-t-0 sm:px-5"
      title={title}
    >
      <span className="min-w-0 flex-1 truncate text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
        {label}
      </span>
      <span
        className={`min-w-0 max-w-[60%] truncate text-right text-[var(--vestara-font-size-sm)] ${mono ? 'font-mono' : ''} ${tone ? toneTextClass(tone) : 'text-[var(--vestara-text-primary)]'}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Availability / HOLD notice ─────────────────────────────────────

/**
 * Renders the honest state for a value the backend does not expose.
 * `unavailable` is a HOLD, not an error to work around by inventing data.
 */
export function CIAvailabilityNotice({
  availability,
  label,
  reason,
}: {
  availability: CIAvailability;
  label: string;
  reason?: string;
}) {
  if (availability === 'available') return null;
  const isUnknown = availability === 'unknown';
  return (
    <div className="flex items-start gap-2 border-t border-[var(--vestara-border-subtle)] px-4 py-3 first:border-t-0 sm:px-5">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        <StatusIndicator variant={isUnknown ? 'idle' : 'warn'} size="xs" pulse={false} />
      </span>
      <p className="text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
        <span className="font-medium text-[var(--vestara-status-warning)]">{isUnknown ? 'UNKNOWN' : 'HOLD'}</span>{' '}
        <span className="text-[var(--vestara-text-secondary)]">{label}</span>
        {reason ? ` — ${reason}` : ''}
      </p>
    </div>
  );
}

// ─── Authority note ─────────────────────────────────────────────────

export function CIAuthorityNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-[var(--vestara-border-subtle)] px-4 py-3 text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)] sm:px-5">
      {children}
    </p>
  );
}
