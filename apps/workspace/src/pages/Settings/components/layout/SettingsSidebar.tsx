/**
 * Settings Sidebar — Auto-generated from module registry.
 *
 * Architecture Traceability:
 *   Settings Framework: 06-Registry.md → Route Registry
 *   Natural Law: Identity precedes responsibility
 */

import type { SettingsModule } from '@vestara/settings-framework';
import { useLocation, useNavigate } from 'react-router-dom';

interface SettingsSidebarProps {
  modules: SettingsModule[];
  basePath?: string;
}

export default function SettingsSidebar({ modules, basePath = '/settings' }: SettingsSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Build hierarchy
  const rootModules = modules.filter((m) => !m.parentId);
  const childModules = modules.filter((m) => m.parentId);

  const isActive = (path: string) => location.pathname === path;

  const renderItem = (module: SettingsModule, depth = 0) => {
    const children = childModules.filter((m) => m.parentId === module.id);
    const active = isActive(module.path);

    return (
      <div key={module.id}>
        <button
          type="button"
          onClick={() => navigate(module.path)}
          className={`
            w-full text-left px-4 py-2 text-sm rounded-md transition-colors
            ${
              active
                ? 'bg-(--vestara-accent) text-white'
                : 'text-(--vestara-text-2) hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text)'
            }
          `}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
        >
          {module.icon && <span className="mr-2">{module.icon}</span>}
          {module.name}
        </button>
        {children.length > 0 && <div className="ml-2">{children.map((child) => renderItem(child, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <nav className="w-64 border-r border-(--vestara-accent-border) bg-(--vestara-accent-bg) p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-(--vestara-text)">Settings</h2>
      </div>
      <div className="space-y-1">{rootModules.map((module) => renderItem(module))}</div>
    </nav>
  );
}
