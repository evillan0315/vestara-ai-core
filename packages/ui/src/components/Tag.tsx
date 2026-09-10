/**
 * VES-UI-C8: Tag Component
 *
 * Domain-independent tag component for categorization and labels.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-C: Data Display (phases 6-8)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type TagVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
export type TagSize = 'sm' | 'md' | 'lg';

export interface TagProps {
  /** Tag variant */
  variant?: TagVariant;

  /** Tag size */
  size?: TagSize;

  /** Tag content */
  children: ReactNode;

  /** Optional icon */
  icon?: ReactNode;

  /** Whether tag is removable */
  removable?: boolean;

  /** Remove handler */
  onRemove?: () => void;

  /** Click handler */
  onClick?: () => void;

  /** Custom class name */
  className?: string;
}

// ─── Styles ────────────────────────────────────────────────────

const VARIANT_STYLES: Record<TagVariant, string> = {
  default:
    'bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-text-secondary)] border-[var(--vestara-border-subtle)]',
  primary:
    'bg-[var(--vestara-accent-primary)]/15 text-[var(--vestara-accent-primary)] border-[var(--vestara-accent-primary)]/30',
  success:
    'bg-[var(--vestara-status-success)]/15 text-[var(--vestara-status-success)] border-[var(--vestara-status-success)]/30',
  warning:
    'bg-[var(--vestara-status-warning)]/15 text-[var(--vestara-status-warning)] border-[var(--vestara-status-warning)]/30',
  error:
    'bg-[var(--vestara-status-error)]/15 text-[var(--vestara-status-error)] border-[var(--vestara-status-error)]/30',
  info: 'bg-[var(--vestara-status-info)]/15 text-[var(--vestara-status-info)] border-[var(--vestara-status-info)]/30',
};

const SIZE_STYLES: Record<TagSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

// ─── Component ─────────────────────────────────────────────────

export function Tag({
  variant = 'default',
  size = 'md',
  children,
  icon,
  removable = false,
  onRemove,
  onClick,
  className = '',
}: TagProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-md font-medium
        border
        ${VARIANT_STYLES[variant]}
        ${SIZE_STYLES[size]}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="shrink-0 ml-0.5 rounded-full p-0.5 hover:bg-[var(--vestara-surface-interactive)] transition-colors cursor-pointer"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
