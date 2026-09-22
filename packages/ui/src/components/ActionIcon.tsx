/**
 * VES-UI: ActionIcon Component (UI-FOUNDATION-006 canonical primitive)
 *
 * Presentation-only compact icon action: a square native button with an
 * authoritative accessible name, decorative icon, semantic tone, and a
 * dependency-free native tooltip. No MUI, no Emotion, no domain semantics —
 * consumers supply meaning and handlers.
 *
 * Square geometry derives from the audited repository inventory
 * (sm 28px / md 32px / lg 44px); no equivalent canonical sizing tokens
 * exist (SIZING.icon covers glyphs, not hit targets).
 *
 * Architecture Traceability:
 *   UI-FOUNDATION-005 → ActionIcon decision packet
 *   UI-FOUNDATION-006 → canonical implementation
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ActionIconTone = 'default' | 'muted' | 'accent' | 'info' | 'success' | 'warning' | 'destructive';
export type ActionIconSize = 'sm' | 'md' | 'lg';

export interface ActionIconProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Authoritative accessible name; also the default tooltip text. */
  label: string;
  /** Presentation-only icon (hidden from the accessibility tree by the primitive). */
  icon: ReactNode;
  /** Semantic Vestara token treatment. Defaults to 'default'. */
  tone?: ActionIconTone;
  /** Square hit target. Defaults to 'md' (32px). */
  size?: ActionIconSize;
  /**
   * Tooltip behavior. `undefined` → title is the label; a string overrides
   * it; `false` renders no title.
   */
  tooltip?: string | false;
}

// ─── Token maps (static literals for Tailwind; canonical tokens only) ───

export const ACTION_ICON_TONES: Record<ActionIconTone, { text: string; hover: string }> = {
  default: {
    text: 'text-[var(--vestara-text-secondary)]',
    hover: 'hover:text-[var(--vestara-text-primary)]',
  },
  muted: {
    text: 'text-[var(--vestara-text-muted)]',
    hover: 'hover:text-[var(--vestara-text-primary)]',
  },
  accent: {
    text: 'text-[var(--vestara-accent)]',
    hover: 'hover:brightness-125',
  },
  info: {
    text: 'text-[var(--vestara-status-info)]',
    hover: 'hover:brightness-125',
  },
  success: {
    text: 'text-[var(--vestara-status-success)]',
    hover: 'hover:brightness-125',
  },
  warning: {
    text: 'text-[var(--vestara-status-warning)]',
    hover: 'hover:brightness-125',
  },
  destructive: {
    text: 'text-[var(--vestara-status-error)]',
    hover: 'hover:bg-[var(--vestara-status-error)]/20',
  },
};

export const ACTION_ICON_SIZES: Record<ActionIconSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-11 w-11',
};

const DESTRUCTIVE_WASH = 'border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)]';
const NEUTRAL_WASH = 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)]';

// ─── Component ─────────────────────────────────────────────────

export function ActionIcon({
  label,
  icon,
  tone = 'default',
  size = 'md',
  tooltip,
  type = 'button',
  className = '',
  disabled,
  ...props
}: ActionIconProps) {
  const toneStyle = ACTION_ICON_TONES[tone];
  const title = tooltip === false ? undefined : (tooltip ?? label);
  return (
    <button
      type={type}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={`
        inline-flex cursor-pointer items-center justify-center
        rounded-md border transition-colors
        ${ACTION_ICON_SIZES[size]}
        ${tone === 'destructive' ? DESTRUCTIVE_WASH : NEUTRAL_WASH}
        ${toneStyle.text}
        ${toneStyle.hover}
        ${tone === 'destructive' ? '' : 'hover:bg-[var(--vestara-surface-interactive)]'}
        focus-visible:bg-[var(--vestara-surface-interactive)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset
        disabled:cursor-not-allowed disabled:opacity-45
        ${className}
      `}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {icon}
      </span>
    </button>
  );
}
