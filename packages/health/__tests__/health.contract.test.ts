import { describe, expect, it } from 'vitest';
import { DefaultHealthManager } from '../src/index';

const emptyRegistry = {
  listServices: () => [],
  get: () => null,
} as never;

describe('DefaultHealthManager contract', () => {
  it('reports healthy when no services are registered', async () => {
    const manager = new DefaultHealthManager({ registry: emptyRegistry });
    const overall = await manager.checkAll();
    expect(overall.totalServices).toBe(0);
    expect(overall.status).toBe('healthy');
    expect(manager.getOverallHealth().totalServices).toBe(0);
  });

  it('marks services without health() as unhealthy, not crashed', async () => {
    const registry = {
      listServices: () => [{ id: 'legacy' }],
      get: () => ({}),
    } as never;
    const manager = new DefaultHealthManager({ registry });
    const overall = await manager.checkAll();
    expect(overall.unhealthyCount).toBe(1);
    expect(overall.status).toBe('unhealthy');
  });
});
