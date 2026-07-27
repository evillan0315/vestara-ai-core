/**
 * Settings Breadcrumbs — Path-based breadcrumbs.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → Navigation
 *   Natural Law: Identity precedes responsibility
 */

import { useLocation, useNavigate } from 'react-router-dom';
import type { SettingsModule } from '@vestara/settings-framework';

interface SettingsBreadcrumbsProps {
  modules: SettingsModule[];
  basePath?: string;
}

export default function SettingsBreadcrumbs({ modules, basePath = '/settings' }: SettingsBreadcrumbsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Build breadcrumb trail from current path
  const pathParts = location.pathname.replace(basePath, '').split('/').filter(Boolean);

  const breadcrumbs: Array<{ label: string; path: string }> = [{ label: 'Settings', path: basePath }];

  let currentPath = basePath;
  for (const part of pathParts) {
    currentPath += `/${part}`;
    const module = modules.find((m) => m.path === currentPath);
    if (module) {
      breadcrumbs.push({ label: module.name, path: module.path });
    } else {
      breadcrumbs.push({ label: part, path: currentPath });
    }
  }

  return (
    <nav className="mb-4 flex items-center space-x-2 text-sm text-[var(--text-secondary)]">
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center">
          {index > 0 && <span className="mx-2 text-[var(--text-tertiary)]">/</span>}
          {index < breadcrumbs.length - 1 ? (
            <button
              type="button"
              onClick={() => navigate(crumb.path)}
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              {crumb.label}
            </button>
          ) : (
            <span className="text-[var(--text-primary)] font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
