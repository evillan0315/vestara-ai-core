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
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
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
    <div className="flex items-center justify-center py-16 text-(--vestara-text-muted) animate-pulse">
      <span className="text-sm">Loading settings...</span>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const modules = useMemo(() => registry.getAll(), []);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [exportStatus, setExportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [resetStatus, setResetStatus] = useState<{ success: boolean; message: string } | null>(null);

  const filteredModules = useMemo(() => {
    if (!settingsSearch.trim()) return modules;
    const q = settingsSearch.toLowerCase();
    return modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description || '').toLowerCase().includes(q),
    );
  }, [modules, settingsSearch]);

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
                <div className="w-full">
                  {/* Page header */}
                  <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                    <div>
                      <h1 className="text-lg font-bold text-(--vestara-text)">Settings</h1>
                      <p className="text-[10px] text-(--vestara-text-muted) mt-1">
                        {modules.length} modules · {modules.filter((m) => m.parentId).length} sub-pages
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--vestara-text-dim) text-[11px]">🔍</span>
                        <input
                          value={settingsSearch}
                          onChange={(e) => setSettingsSearch(e.target.value)}
                          placeholder="Search settings..."
                          className="w-48 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-7 pr-2 py-1.5 text-xs text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: '#8b5cf6' }}>
                      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">Modules</div>
                      <div className="text-lg font-bold text-(--vestara-text) mt-1">{modules.length}</div>
                    </div>
                    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: '#3b82f6' }}>
                      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">Sub-pages</div>
                      <div className="text-lg font-bold text-(--vestara-text) mt-1">{modules.filter((m) => m.parentId).length}</div>
                    </div>
                    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: '#10b981' }}>
                      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">Root</div>
                      <div className="text-lg font-bold text-(--vestara-text) mt-1">{modules.filter((m) => !m.parentId).length}</div>
                    </div>
                    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-[3px]" style={{ borderLeftColor: '#f59e0b' }}>
                      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">With Children</div>
                      <div className="text-lg font-bold text-(--vestara-text) mt-1">{modules.filter((m) => modules.some((c) => c.parentId === m.id)).length}</div>
                    </div>
                  </div>

                  {/* Distribution bar chart */}
                  <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3 mb-5">
                    <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-2">Module Distribution</div>
                    <div className="flex items-end gap-1 h-16">
                      {modules.filter((m) => !m.parentId).map((m) => {
                        const childCount = modules.filter((c) => c.parentId === m.id).length;
                        const maxChildren = Math.max(1, ...modules.filter((m2) => !m2.parentId).map((m2) => modules.filter((c) => c.parentId === m2.id).length));
                        return (
                          <div key={m.id} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full rounded-t-sm bg-(--vestara-accent)" style={{ height: `${Math.max(8, (childCount / maxChildren) * 48)}px`, opacity: 0.3 + (childCount / Math.max(maxChildren, 1)) * 0.5 }} />
                            <span className="text-[6px] text-(--vestara-text-dim) truncate w-full text-center">{m.icon}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {settingsSearch.trim() && (
                    <div className="mb-6 space-y-1.5">
                      {filteredModules.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center">
                          <p className="text-sm text-(--vestara-text-muted) mb-1">No settings match "{settingsSearch}"</p>
                          <p className="text-[10px] text-(--vestara-text-dim)">Try a different search term</p>
                        </div>
                      ) : (
                        filteredModules.map((m) => (
                          <button
                            key={m.path}
                            type="button"
                            onClick={() => { setSettingsSearch(''); navigate(m.path); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-active) hover:bg-(--vestara-accent-bg) transition-colors text-left cursor-pointer border-l-[3px]"
                            style={{ borderLeftColor: '#6366f1' }}
                          >
                            <span className="text-base">{m.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-(--vestara-text)">{m.name}</div>
                              <div className="text-[9px] text-(--vestara-text-muted) truncate">{m.description}</div>
                            </div>
                            <span className="text-(--vestara-text-dim) text-[9px]">→</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Module cards grid */}
                  {!settingsSearch.trim() && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                      {modules
                        .filter((m) => !m.parentId)
                        .map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              const children = modules.filter((c) => c.parentId === m.id);
                              navigate(children.length > 0 ? children[0].path : m.path);
                            }}
                            className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-active) hover:bg-(--vestara-accent-bg) transition-colors text-left cursor-pointer group"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xl">{m.icon}</span>
                              <span className="text-sm font-semibold text-(--vestara-text) group-hover:text-(--vestara-text) transition-colors">
                                {m.name}
                              </span>
                            </div>
                            <p className="text-[10px] text-(--vestara-text-muted) leading-relaxed">{m.description}</p>
                            <div className="mt-2 flex items-center gap-1 text-[9px] text-(--vestara-text-dim)">
                              <span>{modules.filter((c) => c.parentId === m.id).length} sub-pages</span>
                              <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 justify-center">
                    <button
                      onClick={handleExport}
                      className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer"
                    >
                      ⬇ Export
                    </button>
                    <button
                      onClick={handleImport}
                      className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) rounded-lg hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) transition-colors cursor-pointer"
                    >
                      📥 Import
                    </button>
                    <button
                      onClick={handleReset}
                      className="text-[10px] px-3 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-red-400 rounded-lg hover:bg-red-400/20 transition-colors cursor-pointer"
                    >
                      ↺ Reset
                    </button>
                  </div>

                  {exportStatus && (
                    <div className={`mt-3 text-center text-[10px] ${exportStatus.success ? 'text-green-500' : 'text-red-400'}`}>
                      {exportStatus.message}
                    </div>
                  )}
                  {importStatus && (
                    <div className={`mt-3 text-center text-[10px] ${importStatus.success ? 'text-green-500' : 'text-red-400'}`}>
                      {importStatus.message}
                    </div>
                  )}
                  {resetStatus && (
                    <div className={`mt-3 text-center text-[10px] ${resetStatus.success ? 'text-green-500' : 'text-red-400'}`}>
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
                <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center mx-4 mt-4">
                  <div className="text-3xl mb-3 opacity-50">🔀</div>
                  <h2 className="text-sm font-semibold text-(--vestara-text) mb-2">Intent-Based Routing</h2>
                  <p className="text-xs text-(--vestara-text-muted) max-w-md mb-2">
                    Route requests to the optimal AI provider based on task type, complexity, and cost preferences.
                  </p>
                  <p className="text-[10px] text-(--vestara-text-dim) max-w-sm">
                    Planned: Define routing rules, assign provider per capability, set fallback chains, and configure cost/quality thresholds.
                  </p>
                </div>
              }
            />
            <Route
              path="/workspace"
              element={
                <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center mx-4 mt-4">
                  <div className="text-3xl mb-3 opacity-50">🎨</div>
                  <h2 className="text-sm font-semibold text-(--vestara-text) mb-2">Workspace Preferences</h2>
                  <p className="text-xs text-(--vestara-text-muted) max-w-md mb-2">
                    Customize your workspace layout, default views, panel visibility, and session behavior.
                  </p>
                  <p className="text-[10px] text-(--vestara-text-dim) max-w-sm">
                    Planned: Default view per workspace, panel visibility presets, auto-refresh intervals, session defaults, and layout preferences.
                  </p>
                </div>
              }
            />
            <Route path="/appearance" element={<AppearanceSettings />} />
            <Route
              path="/system"
              element={
                <div className="flex flex-col items-center justify-center py-16 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-center mx-4 mt-4">
                  <div className="text-3xl mb-3 opacity-50">⚙️</div>
                  <h2 className="text-sm font-semibold text-(--vestara-text) mb-2">System Settings</h2>
                  <p className="text-xs text-(--vestara-text-muted) max-w-md mb-2">
                    Manage system updates, storage, diagnostics, and performance monitoring.
                  </p>
                  <p className="text-[10px] text-(--vestara-text-dim) max-w-sm">
                    Planned: Storage management, log retention policies, diagnostic tools, performance monitoring, and update channels.
                  </p>
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
