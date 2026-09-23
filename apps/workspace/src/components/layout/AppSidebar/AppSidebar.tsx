import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { SIZING } from '@vestara/ui-tokens';
import type { CSSProperties, FC } from 'react';

import SidebarBrand from './SidebarBrand';
import SidebarFooter from './SidebarFooter';
import SidebarNavigation, { type NavigationSection } from './SidebarNavigation';

interface AppSidebarProps {
  navigation: NavigationSection[];
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onShortcuts: () => void;
}

const AppSidebar: FC<AppSidebarProps> = ({
  navigation,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onShortcuts,
}) => {
  const effectiveCollapsed = collapsed && !mobileOpen;
  const collapsedStyle: CSSProperties | undefined = effectiveCollapsed
    ? { width: SIZING.sidebar.collapsedWidth }
    : undefined;

  return (
    <aside
      id="workspace-navigation"
      className={`shell-rail flex h-full shrink-0 flex-col border-r border-(--vestara-accent-border) bg-(--vestara-shell-bg) transition-all duration-200 ${
        effectiveCollapsed ? '' : 'w-[var(--vestara-sidebar-width)]'
      }`}
      style={collapsedStyle}
    >
      <SidebarBrand collapsed={effectiveCollapsed} />

      <SidebarNavigation sections={navigation} collapsed={effectiveCollapsed} />

      <div className="hidden px-2 lg:block">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center rounded-xl border border-transparent px-2 py-2 text-(--vestara-text-secondary) transition-all hover:border-(--vestara-accent-border) hover:bg-(--vestara-bg) hover:text-(--vestara-text) cursor-pointer"
          title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {effectiveCollapsed ? <ChevronRightRounded fontSize="small" /> : <ChevronLeftRounded fontSize="small" />}
        </button>
      </div>

      <SidebarFooter
        version="v1.0.0"
        collapsed={effectiveCollapsed}
        onShortcuts={onShortcuts}
      />
    </aside>
  );
};

export default AppSidebar;
