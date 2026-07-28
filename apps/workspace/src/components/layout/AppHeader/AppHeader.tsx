import type { FC } from 'react';
import { useLocation } from 'react-router-dom';
import MenuRounded from '@mui/icons-material/MenuRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import AccountCircleRounded from '@mui/icons-material/AccountCircleRounded';

import { useTheme } from '../../../lib/theme';
import { useAuth } from '../../../lib/auth';
import HeaderSearch from './HeaderSearch';
import HeaderConnection from './HeaderConnection';
import HeaderNotifications from './HeaderNotifications';
import HeaderUserMenu from './HeaderUserMenu';
import HeaderActions from './HeaderActions';
import PageHeader from '../Page/PageHeader';
import { NAV_CATEGORIES } from '../../../layouts/ShellLayout';

interface AppHeaderProps {
  onMenuClick?: () => void;
}

const AppHeader: FC<AppHeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const { actor } = useAuth();
  const { resolved, toggle } = useTheme();

  const currentItem = NAV_CATEGORIES.flatMap((category) => category.items).find(
    (item) => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to)),
  );

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center border-b border-(--vestara-accent-border) px-2">
      {/* Left */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-xl accent-btn text-zinc-500 transition lg:hidden"
        >
          <MenuRounded fontSize="small" />
        </button>
        <PageHeader
          title={currentItem?.title ?? 'Workspace'}
          description="Overview of your workspace"
          icon={currentItem?.icon ?? ''}
          actions={<HeaderActions />}
        />
      </div>

      {/* Center */}
      <HeaderSearch />

      {/* Right */}

      <div className="ml-auto flex items-center gap-3">
        <HeaderConnection />

        <div className="flex h-10 w-10 items-center justify-center rounded-xl accent-btn transition-colors">
          <HeaderNotifications />
        </div>

        <button
          onClick={toggle}
          className="flex h-10 w-10 items-center justify-center rounded-xl accent-btn  transition 
          "
        >
          {resolved === 'dark' ? <LightModeRounded fontSize="small" /> : <DarkModeRounded fontSize="small" />}
        </button>

        <HeaderUserMenu name={actor} />
      </div>
    </header>
  );
};

export default AppHeader;
