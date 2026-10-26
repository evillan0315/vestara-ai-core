import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DefaultStateRuntime } from '../src/index';

describe('DefaultStateRuntime contract', () => {
  it('initializes stores against a fresh database file', async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-state-')), 'state.db');
    const runtime = new DefaultStateRuntime();
    await runtime.initialize(dbPath);
    try {
      expect(runtime.conversations).toBeDefined();
      expect(runtime.settings).toBeDefined();
      await expect(runtime.checkpoint()).resolves.toBeUndefined();
      expect(fs.existsSync(dbPath)).toBe(true);
    } finally {
      await runtime.shutdown();
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    }
  });
});
