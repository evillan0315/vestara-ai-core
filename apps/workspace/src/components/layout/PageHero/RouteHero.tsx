/**
 * RouteHero — workspace route binding for the canonical PageHero.
 *
 * Thin app-owned adapter: resolves the route ID from the current URL
 * (useLocation + APP_ROUTES) and the static defaults from
 * ROUTE_HERO_CONFIG, then renders @vestara/ui RouteHero. All presentation
 * lives in the canonical primitive; this file owns only application
 * navigation knowledge (route resolution + SPA navigation).
 *
 * When rendered outside a `<Router>` (e.g. in tests), route resolution
 * and SPA interception gracefully degrade to prop-only behavior.
 */

import { RouteHero as CanonicalRouteHero, type PageHeroProps } from '@vestara/ui';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_ROUTES } from '../../../routes';
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
  const exact = APP_ROUTES.find((r) => r.path === pathname && !r.redirect && !r.catchAll);
  if (exact) return exact.id;

  // Prefix match (longest wins) — for nested routes like /settings/appearance
  const prefix = APP_ROUTES.filter((r) => r.path !== '*' && !r.redirect && !r.catchAll)
    .filter((r) => pathname.startsWith(r.path.replace(/\/\*$/, '')))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.id;
}

/**
 * Safe router hooks — return null outside a Router (tests, storybook, etc.).
 */
function useSafePathname(): string | null {
  try {
    return useLocation().pathname;
  } catch {
    return null;
  }
}

function useSafeNavigate(): ((to: string) => void) | undefined {
  try {
    const navigate = useNavigate();
    return (to: string) => navigate(to);
  } catch {
    return undefined;
  }
}

/**
 * RouteHero renders the canonical PageHero with defaults resolved from the
 * route config registry. Dynamic overrides (stats, actions, meta, etc.)
 * spread on top.
 */
export function RouteHero({ routeId: explicitId, ...overrides }: RouteHeroProps) {
  const pathname = useSafePathname();
  const onNavigate = useSafeNavigate();
  const routeId = explicitId ?? (pathname ? resolveRouteId(pathname) : undefined);
  const defaults = routeId ? ROUTE_HERO_CONFIG[routeId] : undefined;

  return <CanonicalRouteHero defaults={defaults} onNavigate={onNavigate} {...overrides} />;
}
