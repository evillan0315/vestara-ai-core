/**
 * Global setup — clears prior-run artifacts (current, diff, results) so the
 * report reflects only this run. Baselines are preserved.
 */

import * as fs from 'node:fs';
import { outputLayout } from './config.js';

export default async function globalSetup(): Promise<void> {
  const layout = outputLayout();
  // Report is regenerated in teardown; clear generated artifacts (not baselines).
  for (const dir of [layout.current, layout.diff, layout.results, layout.reports]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
