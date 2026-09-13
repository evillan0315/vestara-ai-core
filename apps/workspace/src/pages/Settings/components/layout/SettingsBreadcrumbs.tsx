/**
 * Settings Breadcrumbs — Path-based breadcrumbs.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → Navigation
 *   Natural Law: Identity precedes responsibility
 */

import type { SettingsModule } from '@vestara/settings-framework';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildBreadcrumbs } from '../../../../components/layout/Breadcrumbs/useBreadcrumbs';

interface SettingsBreadcrumbsProps {
  modules: SettingsModule[];
  basePath?: string;
}

export default function SettingsBreadcrumbs({ modules, basePath = '/settings' }: SettingsBreadcrumbsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  // Delegate to global resolver for consistency (system → Settings → Section → inner tab).
  // Keeps modules prop for backward compat but now also resolves SETTINGS_SECTIONS + intelligence parity + ?tab
  const globalCrumbs = buildBreadcrumbs(location.pathname, location.search);
  // If global resolver produced system→Settings trail, reuse it
  const useGlobal = location.pathname.startsWith(basePath) && globalCrumbs.length > 0;
  const breadcrumbs: Array<{ label: string; path: string }> = useGlobal
    ? globalCrumbs.map((c) => ({ label: c.label, path: c.href ?? basePath }))
    : (() => {
        const pathParts = location.pathname.replace(basePath, '').split('/').filter(Boolean);
        const crumbs: Array<{ label: string; path: string }> = [{ label: 'Settings', path: basePath }];
        let currentPath = basePath;
        for (const part of pathParts) {
          currentPath += `/${part}`;
          const module = modules.find((m) => m.path === currentPath);
          if (module) {
            crumbs.push({ label: module.name, path: module.path });
          } else {
            crumbs.push({ label: part, path: currentPath });
          }
        }
        return crumbs;
      })();

  return (
    <nav className="mb-4 flex items-center gap-2 text-[11px] text-(--vestara-text-muted)">
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-2">
          {index > 0 && <span className="text-(--vestara-text-dim)">/</span>}
          {index < breadcrumbs.length - 1 ? (
            <button
              type="button"
              onClick={() => navigate(crumb.path)}
              className="hover:text-(--vestara-text-2) transition-colors cursor-pointer"
            >
              {crumb.label}
            </button>
          ) : (
            <span className="text-(--vestara-text-2) font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
