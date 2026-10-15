/**
 * Workspace layout config store — durability for Settings → Workspace → Layout.
 *
 * Module-level external store (useSyncExternalStore) so the Settings form and
 * the live preview share one layout state in the same tab.
 *
 * Durability mirrors lib/navigation-store.ts: localStorage first (sync, first
 * paint), best-effort server PUT (`vestara-layout-config`), server hydrate on
 * first subscribe (server wins when present). Validation runs through
 * migrateLayoutConfig, so stored garbage can never break the layout.
 */

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_LAYOUT_CONFIG,
  migrateLayoutConfig,
  parseLayoutConfigJson,
  withLayoutPath,
  type LayoutConfig,
  type LayoutConfigPath,
} from '../layouts/WorkspaceLayout/layout-config.js';

export type { LayoutConfig, LayoutConfigPath };

const STORAGE_KEY = 'vestara-layout-config';
const SERVER_KEY = 'vestara-layout-config';

function readLocal(): LayoutConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_LAYOUT_CONFIG);
    return migrateLayoutConfig(JSON.parse(raw) as unknown);
  } catch {
    return structuredClone(DEFAULT_LAYOUT_CONFIG);
  }
}

let state: LayoutConfig = readLocal();
const listeners = new Set<() => void>();
let hydrated = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  void fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section: 'workspace',
      overrides: { [SERVER_KEY]: JSON.stringify(state) },
      source: 'workspace-ui',
    }),
  }).catch(() => {});
}

async function hydrateFromServer(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;
    const configuration = (await res.json()) as {
      settings?: Array<{ key?: string; value?: unknown }>;
    };
    for (const setting of configuration.settings ?? []) {
      if (setting.key === SERVER_KEY && typeof setting.value === 'string' && setting.value) {
        try {
          state = migrateLayoutConfig(JSON.parse(setting.value) as unknown);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch {}
          emit();
        } catch {
          // invalid stored layout — keep local values
        }
        return;
      }
    }
  } catch {
    // API unavailable — keep localStorage values
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void hydrateFromServer();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LayoutConfig {
  return state;
}

// ─── Mutations ────────────────────────────────────────────────────

export function getLayoutConfig(): LayoutConfig {
  return state;
}

export function setLayoutConfig(next: LayoutConfig): void {
  state = migrateLayoutConfig(next);
  persist();
  emit();
}

export function updateLayoutConfig(path: LayoutConfigPath, value: unknown): void {
  state = withLayoutPath(state, path, value);
  persist();
  emit();
}

export function resetLayoutConfig(): void {
  state = structuredClone(DEFAULT_LAYOUT_CONFIG);
  persist();
  emit();
}

export interface LayoutImportResult {
  ok: boolean;
  error?: string;
}

export function importLayoutConfigJson(raw: string): LayoutImportResult {
  const parsed = parseLayoutConfigJson(raw);
  if (!parsed.ok || !parsed.config) return { ok: false, error: parsed.error ?? 'Import failed.' };
  state = parsed.config;
  persist();
  emit();
  return { ok: true };
}

export function useLayoutConfig(): LayoutConfig {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
