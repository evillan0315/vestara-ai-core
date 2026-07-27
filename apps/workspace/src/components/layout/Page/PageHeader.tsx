import type { PropsWithChildren, ReactNode } from 'react';

export interface PageHeaderProps extends PropsWithChildren {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <header
      className="flex items-center justify-between gap-6 py-2 px-2"
      style={{
        color: 'var(--vestara-text)',
      }}
    >
      <div className="flex min-w-0 items-center gap-4">
        {icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors"
            style={{
              color: 'var(--vestara-primary)',
              background: 'var(--vestara-accent-bg)',
              borderColor: 'var(--vestara-accent-border)',
            }}
          >
            {icon}
          </div>
        )}

        <div className="min-w-0">
          <h1 className="truncate text-xl font-light tracking-wider text-zinc-300 uppercase">{title}</h1>

          {description && (
            <p
              className="mt-0 text-sm font-medium"
              style={{
                color: 'var(--vestara-primary)',
              }}
            >
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
