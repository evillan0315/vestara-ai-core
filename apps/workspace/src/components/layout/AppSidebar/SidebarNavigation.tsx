import type { FC, ReactNode } from 'react';
import SidebarNavigationItem from './SidebarNavigationItem';
import SidebarSection from './SidebarSection';

export interface NavigationItem {
  to: string;
  title: string;
  icon: ReactNode;
  description?: string;
  badge?: string | number;
}

export interface NavigationSection {
  title: string;
  icon?: ReactNode;
  items: NavigationItem[];
}

interface SidebarNavigationProps {
  sections: NavigationSection[];
  collapsed?: boolean;
}

const SidebarNavigation: FC<SidebarNavigationProps> = ({ sections, collapsed }) => {
  return (
    <div className={`flex-1 overflow-y-auto py-6 ${collapsed ? 'space-y-6 px-1' : 'space-y-8 px-3'}`}>
      {sections.map((section) => (
        <SidebarSection key={section.title} title={section.title} collapsed={collapsed}>
          {section.items.map((item) => (
            <SidebarNavigationItem key={item.to} {...item} collapsed={collapsed} />
          ))}
        </SidebarSection>
      ))}
    </div>
  );
};

export default SidebarNavigation;
