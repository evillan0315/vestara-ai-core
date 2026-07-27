import type { FC, ReactNode } from 'react';

import SidebarSection from './SidebarSection';
import SidebarNavigationItem from './SidebarNavigationItem';

export interface NavigationItem {
  to: string;
  title: string;
  icon: ReactNode;
  description?: string;
  badge?: string | number;
}

export interface NavigationSection {
  title: string;
  icon: ReactNode;
  items: NavigationItem[];
}

interface SidebarNavigationProps {
  sections: NavigationSection[];
}

const SidebarNavigation: FC<SidebarNavigationProps> = ({ sections }) => {
  return (
    <div className="flex-1 space-y-8 overflow-y-auto px-3 py-6">
      {sections.map((section) => (
        <SidebarSection key={section.title} title={section.title}>
          {section.items.map((item) => (
            <SidebarNavigationItem key={item.to} {...item} />
          ))}
        </SidebarSection>
      ))}
    </div>
  );
};

export default SidebarNavigation;
