/**
 * `pnpm screenshots:clean` — remove generated artifacts (current, diff,
 * results, reports) but never baselines.
 */

import * as fs from 'node:fs';
import { outputLayout } from '../config.js';

const layout = outputLayout();
for (const dir of [layout.current, layout.diff, layout.results, layout.reports]) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`removed ${dir}`);
}
console.log('Baselines left intact under', layout.baselines);
