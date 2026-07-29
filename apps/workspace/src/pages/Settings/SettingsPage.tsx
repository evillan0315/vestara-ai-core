/**
 * Settings Page — The main settings page.
 *
 * Architecture Traceability:
 *   Settings Framework: 01-Overview.md → Purpose
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

import {
  AnalyticsEngine,
  DEFAULT_PERMISSIONS,
  ImportExportEngine,
  ModuleRegistry,
  PermissionEngine,
  ResetEngine,
  SearchEngine,
  type SettingsDatabase,
  SettingsStore,
  ValidationEngine,
  VersioningEngine,
} from '@vestara/settings-framework';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SettingsContent, SettingsLayout } from './components/layout/index.js';

// Lazy load module components
const AccountSettings = lazy(() => import('./components/account/AccountSettings.js'));
const AIProvidersSettings = lazy(() => import('./components/ai/providers/AIProvidersSettings.js'));
const AppearanceSettings = lazy(() => import('./components/appearance/AppearanceSettings.js'));

// ─── SQLite Database Implementation ──────────────────────────

class BrowserDatabase implements SettingsDatabase {
  private data = new Map<string, Record<string, unknown>>();

  run(sql: string, params?: unknown[]): void {
    // Simple in-memory implementation for browser
    // In production, this would use IndexedDB or a WASM SQLite
    if (sql.includes('INSERT OR REPLACE')) {
      const [moduleId, key, value, updatedAt, updatedBy] = params || [];
      this.data.set(`${moduleId}:${key}`, {
        module_id: moduleId,
        key,
        value,
        updated_at: updatedAt,
        updated_by: updatedBy,
      });
    } else if (sql.includes('DELETE')) {
      const [moduleId, key] = params || [];
      if (key) {
        this.data.delete(`${moduleId}:${key}`);
      } else {
        for (const [mapKey] of this.data) {
          if (mapKey.startsWith(`${moduleId}:`)) {
            this.data.delete(mapKey);
          }
        }
      }
    }
  }

  get(sql: string, params?: unknown[]): Record<string, unknown> | undefined {
    if (sql.includes('WHERE module_id = ? AND key = ?')) {
      const [moduleId, key] = params || [];
      return this.data.get(`${moduleId}:${key}`);
    }
    return undefined;
  }

  all(sql: string, params?: unknown[]): Record<string, unknown>[] {
    if (sql.includes('WHERE module_id = ?')) {
      const [moduleId] = params || [];
      const results: Record<string, unknown>[] = [];
      for (const [mapKey, value] of this.data) {
        if (mapKey.startsWith(`${moduleId}:`)) {
          results.push(value);
        }
      }
      return results;
    }
    return [];
  }
}

// ─── Create Registry, Store, Permission Engine, and Search Engine ───────────

const registry = new ModuleRegistry();
const db = new BrowserDatabase();
const store = new SettingsStore(registry, db);
const permissionEngine = new PermissionEngine();
const searchEngine = new SearchEngine();
const importExportEngine = new ImportExportEngine(registry, store);
const resetEngine = new ResetEngine(registry, store);
const validationEngine = new ValidationEngine(registry, store);
const versioningEngine = new VersioningEngine(registry, store);
const analyticsEngine = new AnalyticsEngine(registry, store);

// Register default permissions
for (const permission of DEFAULT_PERMISSIONS) {
  permissionEngine.register(permission);
}

// Register modules
registry.register({
  name: 'AI',
  description: 'Configure AI providers, routing, and memory',
  icon: '🤖',
  path: '/settings/ai',
  order: 1,
});

registry.register({
  name: 'Providers',
  description: 'Manage AI provider connections',
  icon: '⚡',
  path: '/settings/ai/providers',
  parentId: 'ai',
  order: 1,
});

registry.register({
  name: 'Routing',
  description: 'Configure intent-based routing',
  icon: '🔀',
  path: '/settings/ai/routing',
  parentId: 'ai',
  order: 2,
});

registry.register({
  name: 'Workspace',
  description: 'Customize workspace layout and preferences',
  icon: '🎨',
  path: '/settings/workspace',
  order: 2,
});

registry.register({
  name: 'Account',
  description: 'Profile, API token, and user management',
  icon: '👤',
  path: '/settings/account',
  order: 3,
});

registry.register({
  name: 'Appearance',
  description: 'Theme, colors, and typography',
  icon: '🖌️',
  path: '/settings/appearance',
  order: 4,
});

registry.register({
  name: 'System',
  description: 'Updates, logs, and storage',
  icon: '⚙️',
  path: '/settings/system',
  order: 5,
});

// Index all modules in search engine
searchEngine.indexModules(registry.getAll());

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--vestara-accent)]" />
    </div>
  );
}

export default function SettingsPage() {
  const modules = useMemo(() => registry.getAll(), []);
  const [exportStatus, setExportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [resetStatus, setResetStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleExport = async () => {
    try {
      const result = await importExportEngine.export();
      if (result.success && result.data) {
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vestara-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportStatus({ success: true, message: `Exported ${result.count} settings successfully` });
      } else {
        setExportStatus({ success: false, message: 'Export failed: No data' });
      }
    } catch (error) {
      setExportStatus({
        success: false,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    setTimeout(() => setExportStatus(null), 3000);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const result = await importExportEngine.import(content, { overwrite: true });
        if (result.success) {
          setImportStatus({ success: true, message: `Imported ${result.count} settings successfully` });
        } else {
          setImportStatus({
            success: false,
            message: `Import failed: ${result.errors?.map((e) => e.message).join(', ') || 'Unknown error'}`,
          });
        }
      } catch (error) {
        setImportStatus({
          success: false,
          message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
      setTimeout(() => setImportStatus(null), 3000);
    };
    input.click();
  };

  const handleReset = async () => {
    try {
      const result = await resetEngine.reset({ createRollbackPoint: true });
      if (result.success) {
        setResetStatus({ success: true, message: `Reset ${result.count} settings to defaults` });
      } else {
        setResetStatus({
          success: false,
          message: `Reset failed: ${result.errors?.map((e) => e.message).join(', ') || 'Unknown error'}`,
        });
      }
    } catch (error) {
      setResetStatus({
        success: false,
        message: `Reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    setTimeout(() => setResetStatus(null), 3000);
  };

  return (
    <SettingsLayout modules={modules}>
      <SettingsContent>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route
              path="/"
              element={
                <div className="text-center py-12">
                  <h2 className="text-xl font-semibold text-[var(--vestara-text)] mb-2">Settings</h2>
                  <p className="text-[var(--vestara-text-2)] mb-6">
                    Select a tab above to configure your workspace.
                  </p>
                  <div className="flex justify-center gap-4 flex-wrap">
                    <button
                      onClick={handleExport}
                      className="px-4 py-2 bg-[var(--vestara-accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Export Settings
                    </button>
                    <button
                      onClick={handleImport}
                      className="px-4 py-2 bg-[var(--vestara-accent-light)] text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Import Settings
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Reset to Defaults
                    </button>
                  </div>
                  {exportStatus && (
                    <div className={`mt-4 text-sm ${exportStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                      {exportStatus.message}
                    </div>
                  )}
                  {importStatus && (
                    <div className={`mt-4 text-sm ${importStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                      {importStatus.message}
                    </div>
                  )}
                  {resetStatus && (
                    <div className={`mt-4 text-sm ${resetStatus.success ? 'text-green-600' : 'text-red-600'}`}>
                      {resetStatus.message}
                    </div>
                  )}
                </div>
              }
            />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/ai/providers" element={<AIProvidersSettings />} />
            <Route
              path="/ai/routing"
              element={
                <div className="text-center py-12">
                  <h2 className="text-xl font-semibold text-[var(--vestara-text)] mb-2">Routing</h2>
                  <p className="text-[var(--vestara-text-2)]">Coming soon</p>
                </div>
              }
            />
            <Route
              path="/workspace"
              element={
                <div className="text-center py-12">
                  <h2 className="text-xl font-semibold text-[var(--vestara-text)] mb-2">Workspace</h2>
                  <p className="text-[var(--vestara-text-2)]">Coming soon</p>
                </div>
              }
            />
            <Route path="/appearance" element={<AppearanceSettings />} />
            <Route
              path="/system"
              element={
                <div className="text-center py-12">
                  <h2 className="text-xl font-semibold text-[var(--vestara-text)] mb-2">System</h2>
                  <p className="text-[var(--vestara-text-2)]">Coming soon</p>
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Routes>
        </Suspense>
      </SettingsContent>
    </SettingsLayout>
  );
}
