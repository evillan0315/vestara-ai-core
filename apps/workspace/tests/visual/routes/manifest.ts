/**
 * Route manifest for the screenshot framework.
 *
 * Derived from the application's single source of truth (`src/routes.ts`),
 * so adding a route to the app automatically extends visual coverage.
 */

import type { AppRoute } from '../../../src/routes.js';
import { APP_ROUTES, resolveRouteUrl } from '../../../src/routes.js';

export interface RouteDefinition {
  id: string;
  path: string;
  url: string;
  title: string;
  requiresAuth: boolean;
  enabled: boolean;
  layout: 'public' | 'shell';
  group?: string;
  /** Route-specific mask selectors (see helpers/masks). */
  masks?: string[];
}

/** Convert the app route config into a screenshot route manifest. */
export function toRouteDefinition(route: AppRoute): RouteDefinition {
  return {
    id: route.id,
    path: route.path,
    url: resolveRouteUrl(route),
    title: route.title,
    requiresAuth: route.requiresAuth,
    enabled: route.enabled,
    layout: route.layout,
  };
}

/** All routes, including disabled ones (for inspection). */
export function allRoutes(): RouteDefinition[] {
  return APP_ROUTES.map(toRouteDefinition);
}

/** Routes eligible for screenshot capture. */
export function capturableRoutes(): RouteDefinition[] {
  return APP_ROUTES.filter((r) => r.enabled).map(toRouteDefinition);
}
