/**
 * Deterministic screenshot naming.
 *
 * Name format: `Title.viewport.theme.png` (e.g. `Dashboard.desktop-1920.dark.png`).
 */

import type { Theme, Viewport } from '../config.js';
import type { RouteDefinition } from '../routes/manifest.js';

export interface NamingOptions {
  title?: string;
  viewportId?: string;
  themeId?: string;
  role?: string;
}

function slug(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Sanitized base name for a route (used in filenames). */
export function routeBaseName(route: RouteDefinition): string {
  return slug(route.title || route.id);
}

/** Build a screenshot filename: `Title.viewport.theme.png`. */
export function screenshotName(
  route: RouteDefinition,
  viewport: Viewport,
  theme: Theme,
  options: NamingOptions = {},
): string {
  const parts = [
    options.title ? slug(options.title) : routeBaseName(route),
    options.viewportId ? slug(options.viewportId) : viewport.id,
    options.themeId ? slug(options.themeId) : theme.id,
  ];
  if (options.role && options.role !== 'admin') parts.push(slug(options.role));
  return `${parts.join('.')}.png`;
}

/** Baseline filename (mode-stable: always the same so diffs are comparable). */
export function baselineName(
  route: RouteDefinition,
  viewport: Viewport,
  theme: Theme,
  options: NamingOptions = {},
): string {
  return screenshotName(route, viewport, theme, options);
}

export interface ShotKey {
  routeId: string;
  viewportId: string;
  themeId: string;
  role?: string;
}

/** Stable identifier used to group results. */
export function shotKey(route: RouteDefinition, viewport: Viewport, theme: Theme, role?: string): string {
  return [route.id, viewport.id, theme.id, role && role !== 'admin' ? role : undefined].filter(Boolean).join('@');
}
