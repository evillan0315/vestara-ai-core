/**
 * Regression guard for the CLI's ESM migration.
 *
 * `apps/cli` is `"type": "module"` and the root tsconfig emits native ESM
 * (`module: nodenext`), where the CommonJS-only globals `__dirname` and
 * `require` are undefined. Six sites previously used them, which made
 * `vestara open` crash with `ReferenceError: __dirname is not defined`
 * (the API child spawn hid a second defect: a one-level-too-shallow relative
 * path that resolved `apps/cli/api/dist/index.js` instead of the real entry).
 *
 * These tests prove:
 *   1. `spawnOwnedApi` resolves the real API entry and spawns it with the
 *      expected cwd/env, without touching `__dirname`.
 *   2. No source file under `apps/cli/src` (re)introduces `__dirname` or a bare
 *      `require(` call.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { spawnOwnedApi } from '../src/lib/owned-api';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, '..', 'src');
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const API_ENTRY = path.resolve(REPO_ROOT, 'apps', 'api', 'dist', 'index.js');

function fakeChild() {
  return {
    pid: 4242,
    exitCode: null,
    unref: vi.fn(),
    kill: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  };
}

describe('spawnOwnedApi (ESM path resolution)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('spawns the repository API entry without referencing __dirname', () => {
    spawnMock.mockReturnValue(fakeChild());

    const owned = spawnOwnedApi('/tmp/vestara-repo');
    try {
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [executable, args, options] = spawnMock.mock.calls[0] as [
        string,
        string[],
        { cwd?: string; env?: NodeJS.ProcessEnv },
      ];
      expect(executable).toBe(process.execPath);
      expect(args).toEqual([API_ENTRY]);
      expect(options.cwd).toBe('/tmp/vestara-repo');
      expect(options.env?.VESTARA_REPO).toBe('/tmp/vestara-repo');
    } finally {
      owned.detach();
      owned.kill();
    }
  });

  it('resolves the API entry that actually exists in the repo', () => {
    // Guards the relative-depth bug: the file lives at apps/api/dist/index.js,
    // NOT apps/cli/api/dist/index.js. Only asserted when dist is built.
    if (!fs.existsSync(API_ENTRY)) return;
    spawnMock.mockReturnValue(fakeChild());

    const owned = spawnOwnedApi('/tmp/vestara-repo');
    try {
      const args = spawnMock.mock.calls[0][1] as string[];
      expect(fs.existsSync(args[0])).toBe(true);
      expect(args[0].endsWith(path.join('apps', 'api', 'dist', 'index.js'))).toBe(true);
    } finally {
      owned.detach();
      owned.kill();
    }
  });
});

describe('apps/cli/src has no CommonJS-only globals', () => {
  function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  }

  function sourceFiles(dir: string): string[] {
    return fs
      .readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => path.join(entry.parentPath ?? dir, entry.name));
  }

  it('contains no __dirname and no bare require() call', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\b__dirname\b/.test(code)) offenders.push(`${file}: __dirname`);
      if (/\brequire\s*\(/.test(code)) offenders.push(`${file}: require(`);
    }
    expect(offenders).toEqual([]);
  });
});
