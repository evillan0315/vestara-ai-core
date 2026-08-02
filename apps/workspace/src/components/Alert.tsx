import type { ReactNode } from 'react';

export type AlertVariant = 'error' | 'warning' | 'info' | 'success';

const VARIANT_STYLES: Record<AlertVariant, { container: string; icon: string; iconText: string }> = {
  error: { container: 'border-red-400/20 bg-red-400/5 text-red-300', icon: 'text-red-400', iconText: '⚠' },
  warning: { container: 'border-amber-400/20 bg-amber-400/5 text-amber-300', icon: 'text-amber-400', iconText: '▲' },
  info: { container: 'border-sky-400/20 bg-sky-400/5 text-sky-300', icon: 'text-sky-400', iconText: 'ℹ' },
  success: { container: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300', icon: 'text-emerald-400', iconText: '✓' },
};

export interface AlertProps {
  readonly variant?: AlertVariant;
  readonly title?: string;
  readonly children: ReactNode;
  readonly onDismiss?: () => void;
  readonly className?: string;
}

/**
 * Alert — inline status banner (error / warning / info / success).
 * Uses the shared theme tokens; respects reduced motion implicitly (no animation).
 */
export function Alert({ variant = 'info', title, children, onDismiss, className }: AlertProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${style.container} ${className ?? ''}`}
    >
      <span className={`mt-0.5 shrink-0 ${style.icon}`} aria-hidden="true">
        {style.iconText}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-inherit">{title}</p> : null}
        <div className={title ? 'mt-0.5 text-(--vestara-text-2)' : 'text-inherit'}>{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 cursor-pointer text-(--vestara-text-muted) hover:text-(--vestara-text)"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
