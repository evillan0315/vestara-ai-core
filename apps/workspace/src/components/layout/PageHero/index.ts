/**
 * PageHero barrel export.
 *
 * Canonical presentation lives in @vestara/ui. This barrel re-exports the
 * canonical primitive alongside the app-owned route registry and the
 * workspace route-binding adapter.
 */

export { PageHero, RouteHero as CanonicalRouteHero } from '@vestara/ui';
export type {
  PageHeroAction,
  PageHeroDensity,
  PageHeroProps,
  PageHeroRegistry,
  PageHeroSearch,
  PageHeroStat,
  PageHeroStatusTone,
  RouteHeroProps,
} from '@vestara/ui';
export { RouteHero } from './RouteHero';
export { ROUTE_HERO_CONFIG } from './route-hero-config';
export type { RouteHeroConfig } from './route-hero-config';
