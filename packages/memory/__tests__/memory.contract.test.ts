import { describe, expect, it } from 'vitest';
import { DefaultMemoryRuntime } from '../src/index';

describe('DefaultMemoryRuntime contract', () => {
  it('stores, searches, contextualizes, and deletes memories', async () => {
    const runtime = new DefaultMemoryRuntime();
    await runtime.initialize();
    try {
      const stored = await runtime.store('user-1', {
        type: 'fact',
        content: 'prefers dark mode',
      });
      expect(stored.id).toBeDefined();
      const found = await runtime.search('user-1', 'dark mode');
      expect(found.total).toBeGreaterThanOrEqual(1);
      const context = await runtime.getContext('user-1');
      expect(context.length).toBeGreaterThanOrEqual(1);
      const stats = await runtime.stats('user-1');
      expect(stats.total).toBeGreaterThanOrEqual(1);
      await runtime.delete(stored.id);
      expect((await runtime.search('user-1', 'dark mode')).total).toBe(0);
    } finally {
      await runtime.shutdown?.();
    }
  });
});
