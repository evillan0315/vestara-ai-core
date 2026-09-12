import type { FC } from 'react';
import type {
  ProjectedNavItem,
  ProjectedNavSection,
} from '../../../layouts/workspace-navigation.js';
import SidebarNavigationItem from './SidebarNavigationItem';
import SidebarSection from './SidebarSection';

/**
 * Back-compat alias — AppSidebar imports NavigationSection from here.
 * Both resolve to the canonical projection shape (no duplicate contract).
 */
export type { ProjectedNavSection as NavigationSection };
export type { ProjectedNavItem as NavigationItem };

interface SidebarNavigationProps {
  sections: ProjectedNavSection[];
  collapsed?: boolean;
}

const SidebarNavigation: FC<SidebarNavigationProps> = ({ sections, collapsed }) => {
  return (
    <div className={`flex-1 overflow-y-auto py-6 ${collapsed ? 'space-y-6 px-1' : 'space-y-8 px-3'}`}>
      {sections.map((section) => (
        <SidebarSection key={section.title || 'workspace'} title={section.title} collapsed={collapsed}>
          {section.items.map((item) => (
            <div key={item.to ?? item.title}>
              {item.dividerBefore && (
                <div aria-hidden="true" className="mx-2 my-3 border-t border-(--vestara-accent-border)" />
              )}
              <SidebarNavigationItem key={item.to} {...item} collapsed={collapsed} />
            </div>
          ))}
        </SidebarSection>
      ))}
    </div>
  );
};

export default SidebarNavigation;
