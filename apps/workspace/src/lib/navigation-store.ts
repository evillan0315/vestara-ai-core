/**
 * VES-DESIGN-006: workspace navigation store (CRUD backing).
 *
 * Module-level external store (useSyncExternalStore) so the sidebar and
 * the Settings CRUD UI share one live navigation state in the same tab.
 *
 * Durability mirrors appearance-durability: localStorage first (sync,
 * first paint), best-effort server PUT (`vestara-navigation`), server
 * hydrate on first subscribe (server wins when present).
 */

import { useSyncExternalStore } from 'react';
import {
  PARKED_CAPABILITIES,
  buildWorkspaceNavigation,
  type CustomNavEntry,
  type ProjectedNavSection,
} from '../layouts/workspace-navigation.js';

export type { CustomNavEntry };

export interface NavigationStoreState {
  custom: CustomNavEntry[];
  visibility: Record<string, boolean>;
}

const STORAGE_KEY = 'vestara-navigation';
const SERVER_KEY = 'vestara-navigation';

function defaultState(): NavigationStoreState {
  return { custom: [], visibility: {} };
}

function readLocal(): NavigationStoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<NavigationStoreState>;
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      visibility:
        parsed.visibility && typeof parsed.visibility === 'object' ? parsed.visibility : {},
    };
  } catch {
    return defaultState();
  }
}

let state: NavigationStoreState = readLocal();
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
    body: JSON.stringify({ section: 'appearance', overrides: { [SERVER_KEY]: JSON.stringify(state) }, source: 'workspace-ui' }),
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
          const parsed = JSON.parse(setting.value) as Partial<NavigationStoreState>;
          state = {
            custom: Array.isArray(parsed.custom) ? parsed.custom : state.custom,
            visibility:
              parsed.visibility && typeof parsed.visibility === 'object'
                ? parsed.visibility
                : state.visibility,
          };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          } catch {}
          emit();
        } catch {
          // invalid stored navigation — keep local values
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

function getSnapshot(): NavigationStoreState {
  return state;
}

// ─── Mutations (the CRUD) ─────────────────────────────────────────

export function setNavVisibility(id: string, visible: boolean): void {
  state = { ...state, visibility: { ...state.visibility, [id]: visible } };
  persist();
  emit();
}

export function addCustomNavEntry(entry: Omit<CustomNavEntry, 'id'>): CustomNavEntry {
  const created: CustomNavEntry = { ...entry, id: `custom-${Date.now()}` };
  state = { ...state, custom: [...state.custom, created] };
  persist();
  emit();
  return created;
}

export function updateCustomNavEntry(id: string, patch: Partial<Omit<CustomNavEntry, 'id'>>): void {
  state = {
    ...state,
    custom: state.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
  persist();
  emit();
}

export function deleteCustomNavEntry(id: string): void {
  state = { ...state, custom: state.custom.filter((c) => c.id !== id) };
  persist();
  emit();
}

export function useNavigationStore(): NavigationStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ─── Parked capabilities (dogfood profile, today's mechanism) ─────

async function fetchParkedCapabilities(): Promise<ReadonlySet<string>> {
  try {
    const health = await fetch('/api/health');
    if (!health.ok) return new Set();
    await health.json();
    const catalog = await fetch('/api/catalog');
    if (!catalog.ok) return new Set();
    const data = (await catalog.json()) as { profileId?: string };
    return data.profileId === 'dogfood' ? PARKED_CAPABILITIES : new Set<string>();
  } catch {
    return new Set();
  }
}

const parkedCache: { value: ReadonlySet<string> | null } = { value: null };
const EMPTY_PARKED: ReadonlySet<string> = new Set();
const parkedListeners = new Set<() => void>();
let parkedInFlight = false;

function subscribeParked(listener: () => void): () => void {
  parkedListeners.add(listener);
  if (parkedCache.value === null && !parkedInFlight) {
    parkedInFlight = true;
    void fetchParkedCapabilities().then((parked) => {
      parkedCache.value = parked;
      for (const l of parkedListeners) l();
    });
  }
  return () => {
    parkedListeners.delete(listener);
  };
}

function getParkedSnapshot(): ReadonlySet<string> {
  return parkedCache.value ?? EMPTY_PARKED;
}

export function useParkedCapabilities(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeParked, getParkedSnapshot, getParkedSnapshot);
}

/** Sidebar-ready sections: registry + user CRUD + parked filter. */
export function useWorkspaceNavigation(): ProjectedNavSection[] {
  const store = useNavigationStore();
  const parked = useParkedCapabilities();
  return buildWorkspaceNavigation({
    visibility: store.visibility,
    parkedCapabilities: parked,
    custom: store.custom,
  });
}
