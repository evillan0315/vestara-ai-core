/**
 * PCS-026 §4, §9 — visual scenario matrix resolution.
 *
 * The visual evidence leg is enabled by VESTARA_SCREENSHOT_URL. A full matrix
 * (routes × viewports × themes) is configured through VESTARA_SCREENSHOT_MATRIX
 * as a JSON array; without it a single legacy scenario is derived from
 * VESTARA_SCREENSHOT_ROUTE / VESTARA_SCREENSHOT_THEME. Each scenario maps to one
 * VisualEvidenceCollector, so baseline governance stays per scenario key.
 */

import type { VisualScenario } from '@vestara/evidence';

export interface MatrixScenarioEntry {
  readonly route?: string;
  readonly url?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly theme?: string;
  readonly tolerance?: number;
}

export interface VisualMatrixResult {
  readonly scenarios: readonly VisualScenario[];
  /** Present when the matrix diverged from a clean multi-scenario config. */
  readonly note?: string;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_THEME = 'dark';

export function resolveVisualScenarios(env: NodeJS.ProcessEnv): VisualMatrixResult {
  const baseUrl = env.VESTARA_SCREENSHOT_URL;
  if (!baseUrl) return { scenarios: [] };

  const matrixRaw = env.VESTARA_SCREENSHOT_MATRIX;
  if (matrixRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(matrixRaw) as unknown;
    } catch {
      return { scenarios: [], note: 'VESTARA_SCREENSHOT_MATRIX is not valid JSON — visual leg disabled' };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { scenarios: [], note: 'VESTARA_SCREENSHOT_MATRIX must be a non-empty array — visual leg disabled' };
    }
    const scenarios = parsed
      .map((entry) => normalizeMatrixEntry(entry))
      .filter((scenario): scenario is VisualScenario => scenario !== null);
    if (scenarios.length === 0) {
      return { scenarios: [], note: 'VESTARA_SCREENSHOT_MATRIX entries need route/url — visual leg disabled' };
    }
    return { scenarios };
  }

  return {
    scenarios: [
      {
        url: env.VESTARA_SCREENSHOT_ROUTE ?? '/dashboard',
        viewport: DEFAULT_VIEWPORT,
        theme: env.VESTARA_SCREENSHOT_THEME ?? DEFAULT_THEME,
      },
    ],
  };
}

function normalizeMatrixEntry(entry: unknown): VisualScenario | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const { route, url, viewport, theme, tolerance } = entry as MatrixScenarioEntry;
  const target = typeof url === 'string' ? url : route;
  if (typeof target !== 'string') return null;
  return {
    url: target,
    ...(isViewport(viewport) ? { viewport } : {}),
    ...(typeof theme === 'string' ? { theme } : {}),
    ...(typeof tolerance === 'number' && tolerance >= 0 && tolerance <= 1 ? { tolerance } : {}),
  };
}

function isViewport(value: unknown): value is { readonly width: number; readonly height: number } {
  if (typeof value !== 'object' || value === null) return false;
  const { width, height } = value as { width?: unknown; height?: unknown };
  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0;
}
