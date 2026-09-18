import { describe, expect, it } from 'vitest';
import { toFileEntries } from '../src/features/files/hooks/useFiles.js';

describe('toFileEntries (FILES-EDITOR-002 projection mapping)', () => {
  it('maps dirs recursively with path ids and file metadata', () => {
    const entries = toFileEntries([
      {
        name: 'docs',
        path: 'docs',
        kind: 'dir',
        children: [{ name: 'guide.md', path: 'docs/guide.md', kind: 'file', size: 7, mtime: '2026-09-18T00:00:00.000Z', mimeType: 'text/markdown' }],
      },
      { name: 'package.json', path: 'package.json', kind: 'file', size: 12, mimeType: 'application/json' },
    ]);
    expect(entries[0]).toMatchObject({ id: 'docs', kind: 'dir' });
    expect(entries[0].children).toEqual([
      expect.objectContaining({ id: 'docs/guide.md', language: 'markdown', size: 7, mtime: '2026-09-18T00:00:00.000Z' }),
    ]);
    expect(entries[1]).toMatchObject({ id: 'package.json', language: 'json' });
  });

  it('omits language for unknown binary types and directories', () => {
    const entries = toFileEntries([
      { name: 'blob.bin', path: 'blob.bin', kind: 'file', mimeType: 'application/octet-stream' },
      { name: 'empty', path: 'empty', kind: 'dir', children: [] },
    ]);
    expect(entries[0].language).toBeUndefined();
    expect(entries[1].language).toBeUndefined();
    expect(entries[1].children).toEqual([]);
  });
});
