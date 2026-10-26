import { describe, expect, it } from 'vitest';
import { compactContext } from '../src/index';

function item(kind: string, payload: unknown) {
  return { kind, payload } as never;
}

describe('compactContext contract', () => {
  it('passes short threads through untouched', () => {
    const items = [item('user-message', { content: 'do it' })];
    const compacted = compactContext(items, 10);
    expect(compacted.recent).toHaveLength(1);
    expect(compacted.summary).toBeUndefined();
  });

  it('preserves instruction, tool calls, and failures in the summary', () => {
    const items = [
      item('user-message', { content: 'ship it' }),
      item('tool-call', { toolName: 'fs.read', callId: 'c1', input: { path: 'a.ts' } }),
      item('tool-result', { toolName: 'fs.read', status: 'failed', error: 'enoent' }),
      item('user-message', { content: 'retry' }),
      item('user-message', { content: 'now' }),
    ];
    const compacted = compactContext(items, 2);
    expect(compacted.recent).toHaveLength(2);
    expect(compacted.summary).toContain('ship it');
    expect(compacted.summary).toContain('c1');
  });
});
