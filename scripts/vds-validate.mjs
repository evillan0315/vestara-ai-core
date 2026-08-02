import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const core = resolve(import.meta.dirname, '..');
const blueprint = resolve(core, '..', 'vestara-blueprint', '13-design-system');
const errors = [];
const requiredDocs = [
  'README.md',
  '14-design-tokens.md',
  '15-accessibility.md',
  '17-terminal-console.md',
  '18-cross-surface-provider-ux.md',
];
for (const file of requiredDocs) if (!existsSync(join(blueprint, file))) errors.push(`missing VDS document: ${file}`);

const css = readFileSync(join(core, 'apps/workspace/src/styles/index.css'), 'utf8');
for (const token of [
  '--vestara-color-bg-app',
  '--vestara-color-surface-panel',
  '--vestara-color-border-default',
  '--vestara-color-focus-ring',
  '--vestara-status-healthy',
  '--vestara-status-authentication',
  '--vestara-status-conflict',
]) {
  if (!css.includes(token)) errors.push(`missing CSS semantic token: ${token}`);
}
const statusSource = readFileSync(join(core, 'apps/workspace/src/pages/Settings/settings-ui.tsx'), 'utf8');
if (!statusSource.includes('authentication-required') || !statusSource.includes('aria-label'))
  errors.push('Workspace Status must expose semantic provider states and accessible labels');
const tui = readFileSync(join(core, 'packages/tui/src/theme.ts'), 'utf8');
if (!tui.includes('VDS_STATUS') || !tui.includes('normalizeVdsStatus'))
  errors.push('TUI VDS status adapter is missing');
const cli = readFileSync(join(core, 'apps/cli/src/output/format.ts'), 'utf8');
if (!cli.includes('renderSemanticStatus')) errors.push('CLI VDS status adapter is missing');

if (errors.length) {
  console.error(`VDS validation failed (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('VDS validation passed (VDS 1.1 · Workspace/TUI/CLI aligned)');
}
