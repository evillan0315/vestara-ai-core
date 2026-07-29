import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import type { FC, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export interface SidebarNavigationItemProps {
  to: string;
  icon: ReactNode;
  title: string;
  description?: string;
}

const SidebarNavigationItem: FC<SidebarNavigationItemProps> = ({ to, icon, title, description }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'group relative flex items-center gap-3 rounded-xl border px-2 py-1 transition-all duration-200',
          isActive
            ? 'border-(--vestara-accent-border) bg-(--vestara-accent-bg) shadow-lg'
            : 'border-transparent hover:border-(--vestara-accent-border) hover:bg-(--vestara-bg)',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          <div
            className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl  transition-all"
            style={{
              backgroundColor: isActive ? 'var(--bg-primary-950)' : 'transparent',
              borderColor: isActive ? 'var(--vestara-accent-border)' : 'transparent',
              color: isActive ? 'var(--text-zinc-400)' : 'var(--vestara-text-secondary)',
            }}
          >
            {icon}
          </div>

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

          <div
            className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-opacity"
            style={{
              backgroundColor: 'var(--vestara-primary)',
              opacity: isActive ? 1 : 0,
            }}
          />
        </>
      )}
    </NavLink>
  );
};

export default SidebarNavigationItem;
