import { describe, expect, it } from 'vitest';
import { Runtime } from '../src/index';

describe('Runtime lifecycle contract', () => {
  it('walks created → running → stopped', async () => {
    const runtime = new Runtime({ id: 'rt-1', type: 'runtime' } as never);
    expect(runtime.id).toBe('rt-1');
    expect(runtime.state).toBe('created');
    await runtime.start();
    expect(runtime.state).toBe('running');
    await runtime.stop();
    expect(runtime.state).toBe('stopped');
  });

  it('rejects lifecycle violations without corrupting state', async () => {
    const runtime = new Runtime({ id: 'rt-2', type: 'runtime' } as never);
    await expect(runtime.suspend()).rejects.toThrow();
    expect(runtime.state).toBe('created');
  });
});
