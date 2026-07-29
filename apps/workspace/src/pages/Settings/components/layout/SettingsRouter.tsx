/**
 * Settings Router — Routes to the correct module component.
 *
 * Architecture Traceability:
 *   Settings Framework: 06-Registry.md → Route Registry
 *   Natural Law: Identity precedes responsibility
 */

import type { SettingsModule, SettingsRoute } from '@vestara/settings-framework';
import { useLocation } from 'react-router-dom';

interface SettingsRouterProps {
  modules: SettingsModule[];
  routes: SettingsRoute[];
  fallback?: React.ReactNode;
}

export default function SettingsRouter({ modules, routes, fallback }: SettingsRouterProps) {
  const location = useLocation();

  // Find matching route
  const route = routes.find((r) => {
    if (r.exact) {
      return r.path === location.pathname;
    }
    return location.pathname.startsWith(r.path);
  });

  if (!route) {
    return <>{fallback || <div className="text-[var(--vestara-text-2)]">Select a setting from the sidebar.</div>}</>;
  }

  // Find the module for this route
  const module = modules.find((m) => m.id === route.moduleId);

  if (!module) {
    return <div className="text-[var(--vestara-red)]">Module not found: {route.moduleId}</div>;
  }

  // In a real implementation, this would dynamically load the component
  // For now, render a placeholder
  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--vestara-text)] mb-4">{module.name}</h1>
      {module.description && <p className="text-[var(--vestara-text-2)] mb-6">{module.description}</p>}
      <div className="bg-[var(--color-zinc-900)] rounded-lg p-6 border border-[var(--vestara-accent-border)]">
        <p className="text-[var(--vestara-text-2)]">
          Module component would be rendered here.
          <br />
          <span className="text-sm">Component: {route.component}</span>
        </p>
      </div>
    </div>
  );
}
