import { describe, expect, it } from 'vitest';
import { BOOT_STAGES, BootRuntime, MemoryBootStateStore } from '../src/index.js';

describe('BootRuntime', () => {
  it('persists an ordered boot through workspace-ready', async () => {
    const store = new MemoryBootStateStore();
    const runtime = new BootRuntime({ store, bootId: 'boot-test' });
    await runtime.initialize();
    for (const stage of BOOT_STAGES.slice(1)) await runtime.advance(stage);
    expect(runtime.current().status).toBe('ready');
    expect(runtime.current().transitions.map((transition) => transition.stage)).toEqual(BOOT_STAGES);
    expect((await store.load())?.bootId).toBe('boot-test');
  });

  it('rejects skipped and backward stages', async () => {
    const runtime = new BootRuntime({ store: new MemoryBootStateStore() });
    await runtime.initialize();
    await expect(runtime.advance('storage-mounted')).rejects.toThrow('Invalid boot transition');
    await runtime.advance('host-started');
    await expect(runtime.advance('host-started')).rejects.toThrow('Invalid boot transition');
  });

  it('records recovery evidence without erasing history', async () => {
    const runtime = new BootRuntime({ store: new MemoryBootStateStore() });
    await runtime.initialize();
    await runtime.advance('host-started');
    await runtime.enterRecovery('Host health verification failed');
    expect(runtime.current().status).toBe('recovery');
    expect(runtime.current().failure).toContain('health verification');
    expect(runtime.health.status).toBe('degraded');
  });
});
