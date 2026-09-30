import type { ReactNode } from 'react';
import { useId } from 'react';
import './WorkspaceOperationalPanel.css';

export interface WorkspaceOperationalPanelProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  tone?: 'accent' | 'info';
  fill?: boolean;
  scrollable?: boolean;
}

export function WorkspaceOperationalPanel({
  icon,
  title,
  description,
  children,
  className = '',
  actions,
  tone = 'accent',
  fill = false,
  scrollable = false,
}: WorkspaceOperationalPanelProps) {
  const titleId = useId();
  const panelClassName = [className, fill ? 'st-card-fill' : '', scrollable ? 'st-card-fixed' : ''].filter(Boolean).join(' ');
  return (
    <section className={`st-panel min-w-0 ${panelClassName}`} aria-labelledby={titleId}>
      <header className="st-card-header st-gap-field st-px-card st-py-card flex min-w-0 items-start border-b border-[var(--vestara-border-subtle)]">
        {icon && <WorkspacePanelIcon icon={icon} tone={tone} />}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">{title}</h2>
          {description && (
            <p title={description} className="st-mt-element block max-w-2xl truncate text-[var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-muted)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className="st-card-body st-pad-card">{children}</div>
    </section>
  );
}

export function WorkspacePanelIcon({ icon, tone = 'accent' }: { icon: ReactNode; tone?: 'accent' | 'info' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-11 shrink-0 place-items-center rounded-[var(--vestara-radius)] border [&_svg]:size-5 ${
        tone === 'info'
          ? 'border-[color-mix(in_srgb,var(--vestara-status-info)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-status-info)_12%,transparent)] text-[var(--vestara-status-info)]'
          : 'border-[color-mix(in_srgb,var(--vestara-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-accent)_12%,transparent)] text-[var(--vestara-accent-text)]'
      }`}
    >
      {icon}
    </span>
  );
}
