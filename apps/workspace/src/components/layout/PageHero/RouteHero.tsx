/**
 * RouteHero — resolve PageHero defaults from the centralized route config.
 *
 * Reads the current route via `useLocation()` and merges the static
 * defaults from `ROUTE_HERO_CONFIG` with per-page overrides. Pages
 * only need to supply dynamic data (stats, actions, meta, etc.).
 *
 * When rendered outside a `<Router>` (e.g. in tests), RouteHero
 * gracefully falls back to no defaults — callers that supply all
 * props explicitly are unaffected.
 *
 * Ownership: apps/workspace (shared layout presentation)
 * Authority: None — pure presentation, no domain behavior.
 */

import { useLocation } from 'react-router-dom';
import { APP_ROUTES } from '../../../routes';
import { PageHero, type PageHeroProps } from './PageHero';
import { ROUTE_HERO_CONFIG } from './route-hero-config';

interface RouteHeroProps extends PageHeroProps {
  /** Explicit route ID override. When omitted, resolved from the current URL. */
  routeId?: string;
}

/**
 * Resolve a pathname to a route ID by matching against APP_ROUTES.
 * Exact matches first, then prefix matches (for nested routes).
 */
function resolveRouteId(pathname: string): string | undefined {
  // Exact match
  const exact = APP_ROUTES.find(
    (r) => r.path === pathname && !r.redirect && !r.catchAll,
  );
  if (exact) return exact.id;

  // Prefix match (longest wins) — for nested routes like /settings/appearance
  const prefix = APP_ROUTES
    .filter((r) => r.path !== '*' && !r.redirect && !r.catchAll)
    .filter((r) => pathname.startsWith(r.path.replace(/\/\*$/, '')))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.id;
}

/**
 * Safe useLocation wrapper — returns the current pathname or null
 * when rendered outside a Router (tests, storybook, etc.).
 */
function useSafePathname(): string | null {
  try {
    const location = useLocation();
    return location.pathname;
  } catch {
    // Outside <Router> — no route context available
    return null;
  }
}

/**
 * RouteHero renders a PageHero with defaults resolved from the route
 * config registry. Dynamic overrides (stats, actions, meta, search,
 * etc.) are spread on top.
 *
 * @example
 * // Minimal — all defaults from config:
 * <RouteHero />
 *
 * // With dynamic stats:
 * <RouteHero stats={[{ label: 'count', value: total }]} />
 *
 * // Explicit route ID:
 * <RouteHero routeId="dashboard" statusColor={color} />
 */
export function RouteHero({ routeId: explicitId, ...overrides }: RouteHeroProps) {
  const pathname = useSafePathname();
  const routeId = explicitId ?? (pathname ? resolveRouteId(pathname) : undefined);
  const defaults = routeId ? ROUTE_HERO_CONFIG[routeId] : undefined;

  return <PageHero {...defaults} {...overrides} />;
}
