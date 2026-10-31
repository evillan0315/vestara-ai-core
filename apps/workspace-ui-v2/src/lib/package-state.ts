// Shell package lifecycle mirror — install/enable state for shell windows.
// The marketplace API (install/uninstall/setEnabled) is the source of truth
// when live; this store mirrors it in localStorage so the shell (dock,
// desktop icons, open windows) can gate launchables synchronously —
// including offline, where marketplace mutations apply locally.

import type { WinType } from './types';

export const VOICE_PACKAGE_ID = 'voice-streaming';

const STORE_KEY = 'vestara.v2.packages';

export interface PackageLifecycle {
  installed: boolean;
  enabled: boolean;
}

/** Built-in shell packages and their out-of-the-box lifecycle. */
const BUILT_IN: Record<string, PackageLifecycle> = {
  [VOICE_PACKAGE_ID]: { installed: true, enabled: true },
};

const WIN_TO_PACKAGE: Record<string, string> = {
  voice: VOICE_PACKAGE_ID,
};

function readStore(): Record<string, Partial<PackageLifecycle>> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return {};
    return data as Record<string, Partial<PackageLifecycle>>;
  } catch {
    return {};
  }
}

function writeStore(next: Record<string, PackageLifecycle>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Storage full/blocked — shell keeps running with in-memory state.
  }
}

type Listener = () => void;

const listeners = new Set<Listener>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribePackageState(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function readPackageLifecycle(packageId: string): PackageLifecycle {
  const base = BUILT_IN[packageId] ?? { installed: false, enabled: false };
  const override = readStore()[packageId] ?? {};
  return {
    installed: typeof override.installed === 'boolean' ? override.installed : base.installed,
    enabled: typeof override.enabled === 'boolean' ? override.enabled : base.enabled,
  };
}

function persist(packageId: string, patch: Partial<PackageLifecycle>): PackageLifecycle {
  const next = { ...readPackageLifecycle(packageId), ...patch };
  const store = readStore();
  store[packageId] = next;
  const full: Record<string, PackageLifecycle> = {};
  for (const [key, value] of Object.entries(store)) {
    full[key] = {
      installed: value.installed === true,
      enabled: value.enabled === true,
    };
  }
  writeStore(full);
  notify();
  return next;
}

/** Mark a package installed (installs enabled) or uninstalled. */
export function setPackageInstalled(packageId: string, installed: boolean): PackageLifecycle {
  return installed
    ? persist(packageId, { installed: true, enabled: true })
    : persist(packageId, { installed: false, enabled: false });
}

/** Toggle the enabled flag of an installed package. */
export function setPackageEnabled(packageId: string, enabled: boolean): PackageLifecycle {
  return persist(packageId, { enabled });
}

/** Whether a shell window type may be opened right now. */
export function isPackageLaunchable(type: WinType): boolean {
  const packageId = WIN_TO_PACKAGE[type];
  if (!packageId) return true;
  const state = readPackageLifecycle(packageId);
  return state.installed && state.enabled;
}
