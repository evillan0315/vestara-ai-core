/**
 * VES-UI-B5: Card Component
 *
 * Domain-independent card component with header, content, and actions.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives (phases 3-5)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { type ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type CardVariant = 'default' | 'interactive' | 'selected';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  /** Card variant */
  variant?: CardVariant;

  /** Card padding */
  padding?: CardPadding;

  /** Click handler (makes card interactive) */
  onClick?: () => void;

  /** Custom class name */
  className?: string;

  /** Card content */
  children: ReactNode;
}

export interface CardHeaderProps {
  /** Header title */
  title: ReactNode;

  /** Header subtitle */
  subtitle?: ReactNode;

  /** Header action (e.g., button) */
  action?: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface CardContentProps {
  /** Custom class name */
  className?: string;

  /** Content */
  children: ReactNode;
}

export interface CardActionsProps {
  /** Alignment */
  align?: 'left' | 'center' | 'right';

  /** Custom class name */
  className?: string;

  /** Actions */
  children: ReactNode;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_STYLES: Record<CardVariant, string> = {
  default: `
    bg-[var(--vestara-surface-panel)]
    border border-[var(--vestara-border-subtle)]
  `,
  interactive: `
    bg-[var(--vestara-surface-panel)]
    border border-[var(--vestara-border-subtle)]
    hover:border-[var(--vestara-border-default)]
    hover:bg-[var(--vestara-surface-interactive)]
    cursor-pointer
    transition-colors duration-150
  `,
  selected: `
    bg-[var(--vestara-surface-panel)]
    border-2 border-[var(--vestara-accent-primary)]
    ring-1 ring-[var(--vestara-accent-primary)]/20
  `,
};

const PADDING_STYLES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const ALIGN_STYLES: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

// ─── Card Component ────────────────────────────────────────────

export function Card({
  variant = 'default',
  padding = 'md',
  onClick,
  className = '',
  children,
}: CardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`
        rounded-xl
        ${VARIANT_STYLES[variant]}
        ${onClick ? 'text-left w-full' : ''}
        ${className}
      `}
    >
      <div className={PADDING_STYLES[padding]}>
        {children}
      </div>
    </Component>
  );
}

// ─── CardHeader Component ──────────────────────────────────────

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-2 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--vestara-text-primary)]">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-[var(--vestara-text-muted)] mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── CardContent Component ─────────────────────────────────────

export function CardContent({
  className = '',
  children,
}: CardContentProps) {
  return (
    <div className={`text-sm text-[var(--vestara-text-secondary)] ${className}`}>
      {children}
    </div>
  );
}

// ─── CardActions Component ─────────────────────────────────────

export function CardActions({
  align = 'right',
  className = '',
  children,
}: CardActionsProps) {
  return (
    <div className={`flex items-center gap-2 mt-3 ${ALIGN_STYLES[align]} ${className}`}>
      {children}
    </div>
  );
}
