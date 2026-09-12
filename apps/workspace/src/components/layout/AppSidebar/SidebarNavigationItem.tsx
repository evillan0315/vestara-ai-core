import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import type { FC, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { WorkspaceNavAction } from '../../../layouts/workspace-navigation.js';

export interface SidebarNavigationItemProps {
  to?: string;
  icon: ReactNode;
  title: string;
  description?: string;
  collapsed?: boolean;
  /** Route-less behavior (e.g. Global Assistant opens the floating panel). */
  action?: WorkspaceNavAction;
}

function dispatchNavAction(action: WorkspaceNavAction): void {
  if (action === 'open-assistant') {
    window.dispatchEvent(new CustomEvent('open-assistant'));
  }
}

const ITEM_CLASSES =
  'group relative flex w-full items-center gap-3 rounded-xl border px-2 py-1 transition-all duration-200 cursor-pointer';

const SidebarNavigationItem: FC<SidebarNavigationItemProps> = ({
  to,
  icon,
  title,
  description,
  collapsed,
  action,
}) => {
  if (action || !to) {
    return (
      <button
        type="button"
        onClick={() => action && dispatchNavAction(action)}
        title={collapsed ? `${title}${description ? ` — ${description}` : ''}` : description}
        className={[
          ITEM_CLASSES,
          collapsed ? 'justify-center' : '',
          'border-transparent hover:border-(--vestara-accent-border) hover:bg-(--vestara-bg)',
        ].join(' ')}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all"
          style={{ color: 'var(--vestara-text-secondary)' }}
        >
          {icon}
        </div>

        {!collapsed && (
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium text-(--vestara-text)">{title}</div>
            {description && <div className="truncate text-xs text-(--vestara-text-secondary)">{description}</div>}
          </div>
        )}
      </button>
    );
  }

  return (
    <NavLink
      to={to}
      title={collapsed ? `${title}${description ? ` — ${description}` : ''}` : undefined}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-xl border px-2 py-1 transition-all duration-200',
          collapsed ? 'justify-center' : '',
          isActive
            ? 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) shadow-lg'
            : 'border-transparent hover:border-(--vestara-accent-border) hover:bg-(--vestara-bg)',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all"
            style={{
              color: isActive ? 'var(--vestara-accent-text)' : 'var(--vestara-text-secondary)',
            }}
          >
            {icon}
          </div>

          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-(--vestara-text)">{title}</div>
                {description && <div className="truncate text-xs text-(--vestara-text-secondary)">{description}</div>}
              </div>

              <ChevronRightRounded
                fontSize="small"
                className="text-zinc-700 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                style={{
                  color: isActive ? 'var(--vestara-primary)' : undefined,
                }}
              />
            </>
          )}
        </>
      )}
    </NavLink>
  );
};

export default SidebarNavigationItem;
