import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import type { FC } from 'react';

import SidebarBrand from './SidebarBrand';
import SidebarFooter from './SidebarFooter';
import SidebarNavigation, { type NavigationSection } from './SidebarNavigation';

interface AppSidebarProps {
  navigation: NavigationSection[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const AppSidebar: FC<AppSidebarProps> = ({ navigation, collapsed, onToggleCollapse }) => {
  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-(--vestara-accent-border) transition-all duration-200 ${collapsed ? 'w-16' : 'w-70'}`}
    >
      <SidebarBrand collapsed={collapsed} />

      <SidebarNavigation sections={navigation} collapsed={collapsed} />

      <div className="px-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center rounded-xl border border-transparent px-2 py-2 text-zinc-500 transition-all hover:border-(--vestara-accent-border) hover:bg-(--vestara-bg) hover:text-zinc-300 cursor-pointer"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRightRounded fontSize="small" /> : <ChevronLeftRounded fontSize="small" />}
        </button>
      </div>

      <SidebarFooter version="v1.0.0" collapsed={collapsed} />
    </aside>
  );
};

export default AppSidebar;
