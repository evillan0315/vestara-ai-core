/**
 * U3 — `teal://vestara-shell` deep-link scheme (workspace-ui-v2 frontend).
 *
 * Maps incoming desktop deep links onto `WinType` package targets and bridges
 * the two Tauri delivery moments:
 * - cold-start: the app was launched via a link — drain with `getCurrent()`.
 * - running-app: a link arrives while the shell is open — observe with
 *   `onOpenUrl()` (Windows/Linux second-instance argv is forwarded through
 *   the same event by `tauri-plugin-single-instance` with its `deep-link`
 *   feature; see `src-tauri/src/lib.rs`).
 *
 * `parseDeepLinkToWinType` is pure and vitest-covered; the Tauri bridge
 * functions are thin dynamic-import wrappers so the browser bundle never
 * loads the native plugin.
 *
 * Architecture Traceability:
 *   U3: teal://vestara-shell deep-link scheme
 */

import type { WinType } from './types';

export const DEEP_LINK_SCHEME = 'teal';
export const DEEP_LINK_HOST = 'vestara-shell';
export const DEEP_LINK_DEFAULT_WINTYPE: WinType = 'overview';

const WIN_TYPES: readonly WinType[] = [
  'workspace',
  'terminal',
  'marketplace',
  'files',
  'overview',
  'settings',
  'agent',
  'diagnostic',
  'activity',
];

/**
 * Map a `teal://vestara-shell/<wintype>` deep link onto its package target.
 * Returns `null` for anything that is not a well-formed Vestara shell link.
 * Matching is case-sensitive on the path so behaviour mirrors the
 * `apps/workspace` shell-route mapper (dynamic params keep their case).
 */
export function parseDeepLinkToWinType(raw: unknown): WinType | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;
  if (url.hostname.toLowerCase() !== DEEP_LINK_HOST || url.port !== '') return null;
  const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  if (pathname === '/') return DEEP_LINK_DEFAULT_WINTYPE;
  const segment = pathname.slice(1);
  // Single-segment package links only — nested paths are not package targets.
  if (segment.includes('/')) return null;
  return (WIN_TYPES as readonly string[]).includes(segment) ? (segment as WinType) : null;
}

export interface ColdStartDeps {
  readonly getCurrent: () => Promise<readonly string[] | null>;
}

/**
 * Cold-start case: resolve the first valid package from the URLs that
 * launched the app. Never throws — plugin absence/denial means "no link".
 */
export async function resolveColdStartWinType(deps: ColdStartDeps): Promise<WinType | null> {
  let urls: readonly string[] | null;
  try {
    urls = await deps.getCurrent();
  } catch {
    return null;
  }
  if (!urls) return null;
  for (const url of urls) {
    const target = parseDeepLinkToWinType(url);
    if (target) return target;
  }
  return null;
}

/**
 * Running-app case: open the first valid package in an incoming batch.
 * Invalid URLs are ignored so a malformed link never disturbs the session.
 * Returns the package opened, or `null` when nothing matched.
 */
export function handleIncomingDeepLinks(urls: readonly string[], openType: (type: WinType) => void): WinType | null {
  for (const url of urls) {
    const target = parseDeepLinkToWinType(url);
    if (target) {
      openType(target);
      return target;
    }
  }
  return null;
}

function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Cold-start bridge: drain the launch URLs via the deep-link plugin.
 * Resolves to `null` outside the Tauri shell or when no link launched us.
 */
export async function getColdStartWinType(): Promise<WinType | null> {
  if (!isTauriShell()) return null;
  try {
    const { getCurrent } = await import('@tauri-apps/plugin-deep-link');
    return resolveColdStartWinType({ getCurrent });
  } catch {
    return null;
  }
}

/**
 * Running-app bridge: observe `deep-link://new-url` while the shell is
 * open and open each valid incoming link. Resolves to a no-op unlisten
 * function outside the Tauri shell.
 */
export async function subscribeDeepLinks(openType: (type: WinType) => void): Promise<() => void> {
  if (!isTauriShell()) return () => {};
  try {
    const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
    return await onOpenUrl((urls) => {
      handleIncomingDeepLinks(urls, openType);
    });
  } catch {
    return () => {};
  }
}
