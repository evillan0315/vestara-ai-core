import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface DashboardListItemProps {
  label: ReactNode;
  value?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  endIcon?: ReactNode;
  badge?: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export function DashboardListItem({
  label, value, description, icon, endIcon, badge, onClick, className, disabled = false,
}: DashboardListItemProps) {
  const interactive = Boolean(onClick) && !disabled;
  const Component = interactive ? 'button' : 'div';

  return (
    <Component
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? disabled : undefined}
      className={clsx(
        'group flex w-full items-center justify-between gap-4 px-5 py-3',
        'transition-colors duration-200',
        interactive && [
          'cursor-pointer rounded-xl',
          'hover:bg-(--vestara-accent-bg)',
          'focus:outline-none',
          'focus:ring-2 focus:ring-blue-500/40',
        ],
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--vestara-accent-bg) text-(--vestara-text-2)">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-(--vestara-text)">{label}</div>
          {description && <div className="mt-0.5 truncate text-xs text-(--vestara-text-2)">{description}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badge}
        {value && <span className="font-medium text-(--vestara-text)">{value}</span>}
        {endIcon}
      </div>
    </Component>
  );
}

export default DashboardListItem;
