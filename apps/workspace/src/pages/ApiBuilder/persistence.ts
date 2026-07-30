import type { TabData, EnvironmentVars } from './types';

const TABS_KEY = 'vestara-api-builder-tabs';
const ENV_KEY = 'vestara-api-builder-env';
const MAX_TABS = 10;

let tabCounter = 0;

export function createTab(name?: string): TabData {
  tabCounter += 1;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    name: name || `Request ${tabCounter}`,
    url: '',
    method: 'GET',
    body: '',
    headers: '',
    result: { status: 'success' },
    history: [],
  };
}

export function loadTabs(): TabData[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  const defaultTab = createTab('Request 1');
  saveTabs([defaultTab]);
  return [defaultTab];
}

export function saveTabs(tabs: TabData[]): void {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs.slice(0, MAX_TABS)));
  } catch {}
}

export function loadEnv(): EnvironmentVars {
  try {
    const raw = localStorage.getItem(ENV_KEY);
    return raw ? JSON.parse(raw) : { baseUrl: '', authToken: '' };
  } catch {
    return { baseUrl: '', authToken: '' };
  }
}

export function saveEnv(env: EnvironmentVars): void {
  try {
    localStorage.setItem(ENV_KEY, JSON.stringify(env));
  } catch {}
}
