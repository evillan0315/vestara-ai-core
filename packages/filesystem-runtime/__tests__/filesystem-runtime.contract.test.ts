import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilesystemRuntime } from '../src/index';

function sandbox(): { runtime: FilesystemRuntime; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-fs-'));
  return { runtime: new FilesystemRuntime({ rootDir: dir }), dir };
}

describe('FilesystemRuntime sandbox contract', () => {
  it('writes, reads, stats, and lists inside the root', async () => {
    const { runtime, dir } = sandbox();
    try {
      const written = await runtime.write('notes/hi.txt', 'hello');
      expect(written.ok).toBe(true);
      const read = await runtime.read('notes/hi.txt');
      expect(read.ok).toBe(true);
      expect(read.data).toBe('hello');
      expect((await runtime.exists('notes/hi.txt')).data).toBe(true);
      expect((await runtime.stat('notes/hi.txt')).ok).toBe(true);
      expect((await runtime.list('notes')).data).toContain('hi.txt');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects escapes above the root', async () => {
    const { runtime, dir } = sandbox();
    try {
      const escaped = await runtime.read('../outside.txt');
      expect(escaped.ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
