import AccountCircleRounded from '@mui/icons-material/AccountCircleRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import type { FC } from 'react';
import { useLocation } from 'react-router-dom';
import { NAV_CATEGORIES } from '../../../layouts/navigation';
import { useAuth } from '../../../lib/auth';
import { useTheme } from '../../../lib/theme';
import PageHeader from '../Page/PageHeader';
import HeaderActions from './HeaderActions';
import HeaderConnection from './HeaderConnection';
import HeaderNotifications from './HeaderNotifications';
import HeaderSearch from './HeaderSearch';
import HeaderUserMenu from './HeaderUserMenu';

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
          className="flex h-10 w-10 items-center justify-center rounded-xl accent-btn text-(--vestara-text-2) transition lg:hidden"
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

      {/* Activity indicator */}
      <div className="hidden lg:flex items-center gap-1.5 mx-3">
        <div className="flex items-end gap-[1px] h-4">
          {[3, 5, 4, 6, 5, 7, 4].map((h, i) => (
            <span key={i} className="w-[2px] rounded-sm bg-(--vestara-accent)" style={{ height: `${h}px`, opacity: 0.25 + i * 0.1 }} />
          ))}
        </div>
      </div>

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
