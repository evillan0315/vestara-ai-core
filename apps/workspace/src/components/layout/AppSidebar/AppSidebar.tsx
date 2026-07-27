import type { FC } from 'react';

import SidebarBrand from './SidebarBrand';
import SidebarWorkspace from './SidebarWorkspace';
import SidebarNavigation, { type NavigationSection } from './SidebarNavigation';
import SidebarFooter from './SidebarFooter';

interface AppSidebarProps {
  navigation: NavigationSection[];
}

const AppSidebar: FC<AppSidebarProps> = ({ navigation }) => {
  return (
    <aside
      className="
        flex
        h-screen
        w-70
        shrink-0
        flex-col
        border-r
        border-(--vestara-accent-border) 

      "
    >
      <SidebarBrand />

      {/*} <SidebarWorkspace
        workspace="Vestara AI OS"
        repository="vestara-ai-core"
      />*/}

      <SidebarNavigation sections={navigation} />

      {/*  <SidebarUser
        name="Eddie Villanueva"
        role="Administrator"
      />*/}

      <SidebarFooter version="v1.0.0" />
    </aside>
  );
};

export default AppSidebar;
