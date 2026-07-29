/**
 * Settings Tabs — Tab-based navigation for settings, replaces sidebar.
 *
 * Shows root-level modules as horizontal tabs across the top.
 * For parent modules with children (e.g. AI → Providers, Routing),
 * the tab navigates to the first child's path.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → System Architecture
 *   Natural Law: Identity precedes responsibility
 */

import type { SettingsModule } from '@vestara/settings-framework';
import { useLocation, useNavigate } from 'react-router-dom';

interface SettingsTabsProps {
  modules: SettingsModule[];
  basePath?: string;
}

export default function SettingsTabs({ modules, basePath = '/settings' }: SettingsTabsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const rootModules = modules
    .filter((m) => !m.parentId)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const childModules = modules.filter((m) => m.parentId);

  // Determine active tab: match current path against module paths
  const currentPath = location.pathname;
  const activeModule = rootModules.find(
    (m) => currentPath === m.path || currentPath.startsWith(m.path + '/'),
  );

  const handleTabClick = (module: SettingsModule) => {
    // If this module has children, navigate to the first child
    const children = childModules
      .filter((m) => m.parentId === module.id)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    if (children.length > 0) {
      navigate(children[0].path);
    } else {
      navigate(module.path);
    }
  };

  return (
    <div className="flex items-center border-b border-[var(--vestara-border)] bg-[var(--vestara-bg)] px-2 gap-0.5">
      {rootModules.map((module) => {
        const isActive = activeModule?.id === module.id;
        return (
          <button
            key={module.id}
            type="button"
            onClick={() => handleTabClick(module)}
            className={`
              relative px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors
              flex items-center gap-1.5
              ${
                isActive
                  ? 'text-[var(--vestara-text)] bg-[var(--vestara-bg-2)] border-t border-l border-r border-[var(--vestara-border)] -mb-px'
                  : 'text-[var(--vestara-text-2)] hover:text-[var(--vestara-text)] hover:bg-[var(--vestara-bg-1)]'
              }
            `}
            title={module.description}
          >
            {module.icon && <span className="text-base">{module.icon}</span>}
            <span>{module.name}</span>
          </button>
        );
      })}
    </div>
  );
}
