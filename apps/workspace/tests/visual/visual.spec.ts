/**
 * Visual regression spec — the Playwright entry point.
 *
 * Discovers routes and generates one test per (route × viewport × theme).
 * Parallelism, sharding, and retries are handled by Playwright; the engine
 * orchestrates capture + comparison and records results for the report.
 */

import { expect, test } from '@playwright/test';
import { loadConfig } from './config.js';
import { VisualTestEngine } from './engine.js';

const config = loadConfig();
const engine = new VisualTestEngine(config);
const cases = engine.cases();

for (const tc of cases) {
  test(`visual: ${tc.title}`, async ({ browser }) => {
    const result = await engine.execute(browser, tc);

    if (config.mode === 'update') {
      // Baselines were (re)written; nothing to assert.
      return;
    }

    const location = `${tc.route.title} @ ${tc.viewport.name} / ${tc.theme.id}`;
    expect(
      result.status,
      result.status === 'missing'
        ? `No baseline for ${location}. Run \`pnpm screenshots:update\` to approve baselines first.`
        : `${location} changed by ${result.diffPercent}% (${result.error ?? 'regression detected'})`,
    ).toBe('pass');
  });
}
