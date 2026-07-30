/**
 * Settings Tabs — Pill-style tab navigation matching Dashboard pattern.
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

  const currentPath = location.pathname;
  const activeModule = rootModules.find(
    (m) => currentPath === m.path || currentPath.startsWith(m.path + '/'),
  );

  const handleTabClick = (module: SettingsModule) => {
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
    <div className="flex items-center gap-0.5 px-4 py-2 border-b border-(--vestara-accent-border) overflow-x-auto scrollbar-thin">
      {rootModules.map((module) => {
        const isActive = activeModule?.id === module.id;
        return (
          <button
            key={module.id}
            type="button"
            onClick={() => handleTabClick(module)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              isActive
                ? 'bg-zinc-700 text-(--vestara-text) border border-zinc-600'
                : 'text-(--vestara-text-2)hover:text-zinc-300 hover:bg-zinc-800 border border-transparent'
            }`}
            title={module.description}
          >
            {module.icon && <span className="text-sm">{module.icon}</span>}
            <span>{module.name}</span>
          </button>
        );
      })}
    </div>
  );
}
