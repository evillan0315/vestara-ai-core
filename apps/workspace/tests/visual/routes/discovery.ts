/**
 * RouteDiscovery — produces the typed, filtered route manifest.
 *
 * Small, composable, and dependency-injected: feed it the source routes and a
 * set of policy filters; it returns the routes to capture. Future discovery
 * strategies (file-based routing, Storybook, component routes) can be added
 * as additional sources without touching the pipeline.
 */

import type { RouteDefinition } from './manifest.js';
import { allRoutes } from './manifest.js';

export interface DiscoveryOptions {
  /** Extra routes to register manually. */
  extra?: RouteDefinition[];
  /** Route ids to exclude (hidden / admin-only / dev pages). */
  exclude?: string[];
  /** Only run routes matching this id prefix/suffix. */
  filter?: string;
}

/** Default route policies. */
export const HIDDEN_ROUTES = ['not-found', 'redirect-root'];
export const ADMIN_ROUTES = ['ops', 'api-builder'];
export const DEV_ROUTES: string[] = [];

export class RouteDiscovery {
  constructor(private readonly options: DiscoveryOptions = {}) {}

  /** Register routes not discovered from the app config. */
  static withExtra(routes: RouteDefinition[]): RouteDiscovery {
    return new RouteDiscovery({ extra: routes });
  }

  discover(): RouteDefinition[] {
    const exclude = new Set([...HIDDEN_ROUTES, ...ADMIN_ROUTES, ...DEV_ROUTES, ...(this.options.exclude ?? [])]);

    let routes = [...allRoutes(), ...(this.options.extra ?? [])];
    routes = routes.filter((r) => r.enabled && !exclude.has(r.id));

    const filter = this.options.filter?.trim() ?? process.env.SCREENSHOT_ROUTES?.trim();
    if (filter) {
      const wanted = new Set(
        filter
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      routes = routes.filter(
        (r) =>
          wanted.has(r.id) ||
          wanted.has(r.title.toLowerCase()) ||
          r.id.includes(filter) ||
          r.title.toLowerCase().includes(filter.toLowerCase()),
      );
    }

    return routes;
  }
}

/** Convenience default discovery with the standard policy set. */
export function discoverRoutes(options?: DiscoveryOptions): RouteDefinition[] {
  return new RouteDiscovery(options).discover();
}
