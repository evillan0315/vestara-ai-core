import type { ReactNode } from 'react';
import { WorkspaceOperationalPanel } from '../WorkspaceOperationalPanel.js';

export interface DashboardPanelProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'accent' | 'info';
}

/**
 * Shared dashboard surface for summary panels across workspace pages.
 * It deliberately uses the same operational panel grammar as Settings so
 * dashboard cards have one accessible header/body contract.
 */
export function DashboardPanel({
  title,
  description,
  icon,
  badge,
  actions,
  children,
  className = '',
  tone = 'accent',
}: DashboardPanelProps) {
  return (
    <WorkspaceOperationalPanel
      title={title}
      description={description}
      icon={icon}
      actions={
        badge || actions ? (
          <>
            {badge}
            {actions}
          </>
        ) : undefined
      }
      tone={tone}
      className={`mpg-enter ${className}`}
    >
      {children}
    </WorkspaceOperationalPanel>
  );
}
