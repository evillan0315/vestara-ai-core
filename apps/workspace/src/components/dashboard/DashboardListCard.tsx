import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface DashboardListCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  className?: string;
}

export function DashboardListCard({
  title, subtitle, icon, action, footer, children, loading = false, className,
}: DashboardListCardProps) {
  return (
    <section
      className={clsx(
        'group overflow-hidden rounded-2xl',
        'border border-(--vestara-accent-border)',
        'bg-(--vestara-accent-bg) backdrop-blur-xl',
        'shadow-[0_0_0_1px_rgba(255,255,255,0.03)]',
        'transition-all duration-300',
        'hover:border-(--vestara-accent-border-hover)',
        'hover:bg-(--vestara-accent-bg)',
        'hover:shadow-xl',
        className,
      )}
    >
      <header className="flex items-start justify-between border-b border-(--vestara-accent-border) px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-(--vestara-text)">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-(--vestara-text)">{title}</h3>
            {subtitle && <p className="mt-1 truncate text-xs text-(--vestara-text-2)">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="ml-4 shrink-0">{action}</div>}
      </header>
      <div className="divide-y divide-(--vestara-accent-border)">
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-5 animate-pulse rounded bg-(--vestara-accent-bg)" />
            ))}
          </div>
        ) : (
          children
        )}
      </div>
      {footer && <footer className="border-t border-(--vestara-accent-border) px-5 py-3">{footer}</footer>}
    </section>
  );
}

export default DashboardListCard;
