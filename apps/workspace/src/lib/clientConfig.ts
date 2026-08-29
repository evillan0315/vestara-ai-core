/**
 * Endpoint resolution for the Workspace UI.
 *
 * The UI must run both as a same-origin browser SPA (served by/alongside the
 * API, or via the Vite dev proxy) and as a standalone desktop client (Tauri /
 * Electron) that connects to an API on another origin. To support the latter,
 * the HTTP and WebSocket base URLs are resolved from a configurable source
 * instead of `window.location`.
 *
 * Resolution order:
 *   1. runtime override (`setApiBase`) — e.g. a Settings "API endpoint" field
 *   2. `import.meta.env.VITE_API_URL` — injected at build time
 *   3. `''` — same-origin (browser default; WebSocket falls back to
 *      `window.location`)
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI (standalone desktop client)
 */

function readEnvBase(): string {
  const meta = import.meta as { env?: Record<string, string | undefined> };
  return (meta.env?.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
}

const STORAGE_KEY = 'vestara-api-endpoint';

let runtimeBase = '';

/** Override the API base at runtime (for example from a Settings field). */
export function setApiBase(url: string): void {
  runtimeBase = (url ?? '').trim().replace(/\/+$/, '');
}

/**
 * Apply a persisted endpoint (if any) from local storage. Call this once at
 * application startup, before any request is made, so a standalone client
 * connects to its configured API rather than the same origin.
 */
export function loadApiBaseFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) runtimeBase = stored.trim().replace(/\/+$/, '');
  } catch {
    /* localStorage unavailable */
  }
}

/** Read the endpoint persisted in local storage (empty string when none). */
export function getStoredApiBase(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Persist an endpoint to local storage and apply it to the active base. */
export function persistApiBase(url: string): void {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  runtimeBase = trimmed;
  try {
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getApiBase(): string {
  return runtimeBase || readEnvBase();
}

/**
 * Resolve an HTTP path to a full URL. When no base is configured the path is
 * returned unchanged (same-origin). When a base is configured, the `/api`
 * prefix is ensured so `/api/workspace` and `/notifications` both resolve
 * correctly.
 */
export function resolveHttpUrl(path: string): string {
  const base = getApiBase();
  if (!base) return path;
  const normalized = path.startsWith('/api/')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return `${base}${normalized}`;
}

/**
 * Resolve a WebSocket path to a full `ws://`/`wss://` URL. When no base is
 * configured, falls back to the current `window.location` (same-origin
 * browser behavior).
 */
export function resolveWsUrl(suffix: string): string {
  const base = getApiBase();
  if (base) {
    const proto = base.startsWith('https:') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `${proto}//${host}${suffix}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}${suffix}`;
}
