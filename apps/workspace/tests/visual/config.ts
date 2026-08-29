/**
 * Screenshot framework configuration.
 *
 * All knobs live here or in environment variables so the framework needs no
 * code changes to target new viewports, themes, or tolerance levels.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Config lives at tests/visual/config; root is tests/visual.
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ─── Viewports ─────────────────────────────────────────────────

export interface Viewport {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

export const VIEWPORT_GROUPS: Record<string, Viewport[]> = {
  desktop: [
    { id: 'desktop-1920', name: 'Desktop 1920x1080', width: 1920, height: 1080 },
    { id: 'desktop-1600', name: 'Desktop 1600x900', width: 1600, height: 900 },
    { id: 'desktop-1440', name: 'Desktop 1440x900', width: 1440, height: 900 },
    { id: 'laptop-1366', name: 'Laptop 1366x768', width: 1366, height: 768 },
  ],
  tablet: [
    { id: 'tablet-ipad-pro', name: 'iPad Pro 12.9"', width: 1024, height: 1366, isMobile: true, hasTouch: true },
    { id: 'tablet-ipad-air', name: 'iPad Air 10.9"', width: 820, height: 1180, isMobile: true, hasTouch: true },
    { id: 'tablet-surface-pro', name: 'Surface Pro 7', width: 912, height: 1368, isMobile: true, hasTouch: true },
  ],
  mobile: [
    {
      id: 'mobile-iphone-se',
      name: 'iPhone SE',
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    {
      id: 'mobile-iphone-15',
      name: 'iPhone 15',
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
    {
      id: 'mobile-pixel-8',
      name: 'Pixel 8',
      width: 412,
      height: 915,
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true,
    },
    {
      id: 'mobile-galaxy-s24',
      name: 'Galaxy S24',
      width: 360,
      height: 780,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  ],
};

export const ALL_VIEWPORTS: Viewport[] = [
  ...VIEWPORT_GROUPS.desktop,
  ...VIEWPORT_GROUPS.tablet,
  ...VIEWPORT_GROUPS.mobile,
];

// ─── Themes ────────────────────────────────────────────────────

export interface Theme {
  id: string;
  label: string;
  /** Value written to the `vestara-theme` localStorage key. */
  storageValue: string;
}

export const THEMES: Theme[] = [
  { id: 'dark', label: 'Dark', storageValue: 'dark' },
  { id: 'light', label: 'Light', storageValue: 'light' },
];

// ─── Output layout ─────────────────────────────────────────────

export interface OutputLayout {
  root: string;
  baselines: string;
  current: string;
  diff: string;
  reports: string;
  results: string;
  storage: string;
  routes: string;
}

export function outputLayout(): OutputLayout {
  // Generated artifacts live under `.artifacts` so they never collide with the
  // framework source directories (diff/, reports/). Baselines are committed.
  const root = process.env.SCREENSHOT_ROOT ?? path.resolve(HERE, '.artifacts');
  return {
    root,
    baselines: path.join(root, 'baselines'),
    current: path.join(root, 'current'),
    diff: path.join(root, 'diff'),
    reports: path.join(root, 'reports'),
    results: path.join(root, 'reports', 'results'),
    storage: path.join(root, 'auth', 'state'),
    routes: path.join(root, 'routes'),
  };
}

// ─── Test controls ─────────────────────────────────────────────

export type RunMode = 'compare' | 'update';

export interface Config {
  /** Viewports to capture for this run. */
  viewports: Viewport[];
  themes: Theme[];
  /** Pixel-match threshold (0..1). */
  tolerance: number;
  /** Max acceptable diff percent before failing. */
  maxDiffPercent: number;
  baseURL: string;
  mode: RunMode;
  /** Wait for network idle before capturing (opt-in: dev websockets/HMR block it). */
  waitForNetworkIdle: boolean;
  /** Extra settle time after stability heuristics. */
  stabilityTimeoutMs: number;
  /** Role used for authenticated routes (default 'admin'). */
  role: string;
  output: OutputLayout;
}

function envGroup(): keyof typeof VIEWPORT_GROUPS {
  const group = (process.env.SCREENSHOT_VIEWPORT ?? 'desktop').toLowerCase();
  return (group in VIEWPORT_GROUPS ? group : 'desktop') as keyof typeof VIEWPORT_GROUPS;
}

export function loadConfig(): Config {
  const group = envGroup();
  return {
    viewports: VIEWPORT_GROUPS[group],
    themes: THEMES,
    tolerance: Number(process.env.SCREENSHOT_TOLERANCE ?? 0.1),
    maxDiffPercent: Number(process.env.SCREENSHOT_MAX_DIFF ?? 0.5),
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    mode: process.env.SCREENSHOT_MODE === 'update' ? 'update' : 'compare',
    waitForNetworkIdle: process.env.SCREENSHOT_WAIT_NETWORK === '1',
    stabilityTimeoutMs: Number(process.env.SCREENSHOT_STABILITY_MS ?? 800),
    role: process.env.SCREENSHOT_ROLE ?? 'admin',
    output: outputLayout(),
  };
}
