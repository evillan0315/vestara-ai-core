import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

const DDL = /CREATE TABLE IF NOT EXISTS|ALTER TABLE/g;

/**
 * Files allowed to contain schema DDL. Registered migration modules own the
 * schema; the runner owns the ALTER mechanism. Everything else must be a
 * deferred/standalone store awaiting migration (authoring tracked in
 * MIGRATION-INVENTORY.md) — adding new DDL outside these is a drift-guard
 * failure.
 */
const MIGRATION_FILE = /(?:migrations|migration)\.ts$/;
const RUNNER = /packages\/sqlite-migrations\/src\/runner\.ts$/;
const ALLOWLIST = new Set([
  'packages/settings-framework/src/settings-store.ts',
  'packages/workspace/src/desktop-service.ts',
  'packages/workspace/src/engineering-memory.ts',
  'packages/knowledge/src/storage/index.ts',
  'packages/memory/src/index.ts',
  'apps/cli/src/commands/config.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__' || entry.name === 'tests')
      continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(target);
  }
  return out;
}

describe('repo-wide drift guard (Track 3, Step 3)', () => {
  it('allows schema DDL only inside registered migration files, the runner, or the deferred allowlist', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'packages')).concat(walk(path.join(ROOT, 'apps')))) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (MIGRATION_FILE.test(file) || RUNNER.test(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (DDL.test(src) && !ALLOWLIST.has(rel)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
