/**
 * Regression guard for the CLI's executable-availability probe.
 *
 * The probe gates the in-repo Bun TUI launch. When it wrongly reports a binary
 * as available, the CLI attempts `spawn` and crashes with a raw ENOENT; when it
 * correctly reports unavailable, the CLI degrades with an actionable message.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isCommandAvailable } from '../src/lib/executable';

const POSIX = process.platform !== 'win32';

describe('isCommandAvailable', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function makeDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-path-'));
    dirs.push(dir);
    return dir;
  }

  it('returns false for a command that is not on PATH', () => {
    expect(
      isCommandAvailable('definitely-not-a-real-binary-xyz', { pathEnv: os.tmpdir(), delimiter: path.delimiter }),
    ).toBe(false);
  });

  it('returns false for an empty PATH', () => {
    expect(isCommandAvailable('bun', { pathEnv: '', delimiter: path.delimiter })).toBe(false);
  });

  it('returns false for an empty command name', () => {
    expect(isCommandAvailable('', { pathEnv: os.tmpdir(), delimiter: path.delimiter })).toBe(false);
  });

  it('returns true for an executable file on PATH (POSIX)', () => {
    if (!POSIX) return;
    const dir = makeDir();
    const bin = path.join(dir, 'vestara-fake-bin');
    fs.writeFileSync(bin, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(bin, 0o755);

    expect(isCommandAvailable('vestara-fake-bin', { pathEnv: dir, delimiter: path.delimiter })).toBe(true);
  });

  it('does not treat a non-executable file as available (POSIX)', () => {
    if (!POSIX) return;
    const dir = makeDir();
    const bin = path.join(dir, 'vestara-fake-bin');
    fs.writeFileSync(bin, 'not executable');
    fs.chmodSync(bin, 0o644);

    expect(isCommandAvailable('vestara-fake-bin', { pathEnv: dir, delimiter: path.delimiter })).toBe(false);
  });
});
