/**
 * Regression guard for the CLI authentication credential store.
 *
 * The store backs "already authenticated" on the Vestara OS (session file
 * provisioned at login) and the standalone `vestara auth login` path.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authFilePath, clearAuth, readAuth, resolveAuthToken, writeAuth } from '../src/lib/auth-store';

const POSIX = process.platform !== 'win32';

describe('auth-store', () => {
  let dir: string;
  let file: string;
  const originalFile = process.env.VESTARA_AUTH_FILE;
  const originalKey = process.env.VESTARA_API_KEY;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-auth-'));
    file = path.join(dir, 'auth.json');
    process.env.VESTARA_AUTH_FILE = file;
    delete process.env.VESTARA_API_KEY;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (originalFile === undefined) delete process.env.VESTARA_AUTH_FILE;
    else process.env.VESTARA_AUTH_FILE = originalFile;
    if (originalKey === undefined) delete process.env.VESTARA_API_KEY;
    else process.env.VESTARA_API_KEY = originalKey;
  });

  it('round-trips stored credentials and normalizes the endpoint', () => {
    writeAuth({ endpoint: 'http://127.0.0.1:3001/', token: 'vst_test', username: 'operator', role: 'editor' });

    expect(authFilePath()).toBe(file);
    const stored = readAuth();
    expect(stored?.endpoint).toBe('http://127.0.0.1:3001');
    expect(stored?.token).toBe('vst_test');
    expect(stored?.username).toBe('operator');
    if (POSIX) expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('clearAuth removes the stored session', () => {
    writeAuth({ endpoint: 'http://127.0.0.1:3001', token: 'vst_test' });
    clearAuth();
    expect(readAuth()).toBeNull();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('resolveAuthToken prefers VESTARA_API_KEY over the stored token', () => {
    writeAuth({ endpoint: 'http://127.0.0.1:3001', token: 'stored' });
    process.env.VESTARA_API_KEY = 'envkey';
    expect(resolveAuthToken()).toBe('envkey');
  });

  it('resolveAuthToken uses the stored token only for the matching endpoint', () => {
    writeAuth({ endpoint: 'http://127.0.0.1:3001', token: 'stored' });
    expect(resolveAuthToken('http://127.0.0.1:3001')).toBe('stored');
    expect(resolveAuthToken('http://example.com:3001')).toBeUndefined();
  });

  it('returns null for a malformed credentials file', () => {
    fs.writeFileSync(file, '{ not json');
    expect(readAuth()).toBeNull();
  });
});
