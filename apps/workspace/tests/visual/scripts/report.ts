/**
 * `pnpm screenshots:report` — regenerate reports from previously recorded
 * results without re-running the browser.
 */

import { loadConfig } from '../config.js';
import { VisualTestEngine } from '../engine.js';

const engine = new VisualTestEngine(loadConfig());
const results = engine.loadResults();
if (results.length === 0) {
  console.log('No recorded results. Run `pnpm screenshots` first.');
  process.exit(1);
}
engine.writeReport(results);
const summary = engine.summary(results);
console.log(
  `Report regenerated: ${summary.passed}/${summary.total} passing · ${summary.failed} failed · ` +
    `${summary.missing} missing baselines · ${summary.fresh} new`,
);
