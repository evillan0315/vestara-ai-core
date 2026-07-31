/**
 * Global teardown — aggregates per-worker results into the HTML/JSON/Markdown
 * reports after all workers finish.
 */

import type { FullConfig } from '@playwright/test';
import { loadConfig } from './config.js';
import { VisualTestEngine } from './engine.js';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  const config = loadConfig();
  const engine = new VisualTestEngine(config);
  const results = engine.loadResults();
  if (results.length === 0) return;
  engine.writeReport(results);
  const summary = engine.summary(results);
  console.log(
    `[visual-report] ${summary.passed}/${summary.total} passing · ${summary.failed} failed · ` +
      `${summary.missing} missing baselines · ${summary.fresh} new · ${summary.passRate}%`,
  );
}
