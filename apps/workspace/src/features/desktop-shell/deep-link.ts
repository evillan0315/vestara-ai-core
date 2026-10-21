/**
 * U3 — `teal://vestara-shell` deep-link scheme (frontend).
 *
 * Maps incoming desktop deep links onto canonical shell routes and bridges
 * the two Tauri delivery moments:
 * - cold-start: the app was launched via a link — drain with `getCurrent()`.
 * - running-app: a link arrives while the shell is open — observe with
 *   `onOpenUrl()` (Windows/Linux second-instance argv is forwarded through
 *   the same event by `tauri-plugin-single-instance` with its `deep-link`
 *   feature; see `src-tauri/src/lib.rs`).
 *
 * `parseDeepLinkToRoute` is pure and vitest-covered; the Tauri bridge
 * functions are thin dynamic-import wrappers so the browser bundle never
 * loads the native plugin. Only canonical `layout: 'shell'` routes from
 * `APP_ROUTES` are reachable — redirects, the catch-all, and public routes
 * (`/login`, `/startup`) map to `null`.
 *
 * Architecture Traceability:
 *   U3: teal://vestara-shell deep-link scheme
 */

import { APP_ROUTES } from '../../routes.js';

export const DEEP_LINK_SCHEME = 'teal';
export const DEEP_LINK_HOST = 'vestara-shell';
export const DEEP_LINK_DEFAULT_ROUTE = '/overview';

/**
 * Compile an `APP_ROUTES` path pattern (`:param` segments, `/*` splats)
 * into a matcher for concrete URL pathnames.
 */
function compileRoutePattern(pattern: string): RegExp {
  const segments = pattern.split('/').filter((segment) => segment.length > 0);
  const body = segments
    .map((segment) => {
      if (segment === '*') return '(?:/.*)?';
      if (segment.startsWith(':')) return '/[^/]+';
      return `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
    })
    .join('');
  return new RegExp(`^${body}$`);
}

/**
 * Concrete shell route patterns, derived from the manifest so new pages are
 * deep-linkable without touching this module. Redirects, the catch-all, and
 * non-shell layouts are excluded.
 */
const SHELL_ROUTE_PATTERNS: readonly RegExp[] = APP_ROUTES.filter(
  (route) => route.layout === 'shell' && !route.redirect && !route.catchAll,
).map((route) => compileRoutePattern(route.path));

/**
 * Map a `teal://vestara-shell/<route>` deep link onto its in-app shell
 * route (query + hash preserved). Returns `null` for anything that is not
 * a well-formed Vestara shell link or does not match a canonical shell
 * route. Path matching is case-sensitive so dynamic params keep their case
 * (`/sessions/ABC123` must not be lowercased).
 */
export function parseDeepLinkToRoute(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return null;
  // Host comparison is case-insensitive (scheme/host are per RFC 3986);
  // the path below stays case-sensitive so dynamic params keep their case.
  if (url.hostname.toLowerCase() !== DEEP_LINK_HOST || url.port !== '') return null;
  const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  if (pathname === '/') return `${DEEP_LINK_DEFAULT_ROUTE}${url.search}${url.hash}`;
  if (!SHELL_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) return null;
  return `${pathname}${url.search}${url.hash}`;
}

export interface ColdStartDeps {
  readonly getCurrent: () => Promise<readonly string[] | null>;
}

/**
 * Cold-start case: resolve the first valid route from the URLs that launched
 * the app. Never throws — plugin absence/denial means "no deep link".
 */
export async function resolveColdStartRoute(deps: ColdStartDeps): Promise<string | null> {
  let urls: readonly string[] | null;
  try {
    urls = await deps.getCurrent();
  } catch {
    return null;
  }
  if (!urls) return null;
  for (const url of urls) {
    const route = parseDeepLinkToRoute(url);
    if (route) return route;
  }
  return null;
}

/**
 * Running-app case: navigate to the first valid route in an incoming batch.
 * Invalid URLs are ignored so a malformed link never disturbs the session.
 * Returns the route navigated to, or `null` when nothing matched.
 */
export function handleIncomingDeepLinks(urls: readonly string[], navigate: (route: string) => void): string | null {
  for (const url of urls) {
    const route = parseDeepLinkToRoute(url);
    if (route) {
      navigate(route);
      return route;
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
export async function getColdStartRoute(): Promise<string | null> {
  if (!isTauriShell()) return null;
  try {
    const { getCurrent } = await import('@tauri-apps/plugin-deep-link');
    return resolveColdStartRoute({ getCurrent });
  } catch {
    return null;
  }
}

/**
 * Running-app bridge: observe `deep-link://new-url` while the shell is
 * open and navigate to each valid incoming link. Resolves to a no-op
 * unlisten function outside the Tauri shell.
 */
export async function subscribeDeepLinks(navigate: (route: string) => void): Promise<() => void> {
  if (!isTauriShell()) return () => {};
  try {
    const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
    return await onOpenUrl((urls) => {
      handleIncomingDeepLinks(urls, navigate);
    });
  } catch {
    return () => {};
  }
}
