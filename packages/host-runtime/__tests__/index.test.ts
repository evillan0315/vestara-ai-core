import { describe, expect, it, vi } from 'vitest';
import { HostRuntime, type HostSnapshot } from '../src/index.js';

const snapshot: HostSnapshot = {
  capturedAt: '2026-08-01T00:00:00.000Z',
  hostname: 'vestara-test',
  platform: 'linux',
  architecture: 'x64',
  kernelRelease: '6.0.0',
  distribution: 'Test Linux',
  cpu: { model: 'Test CPU', logicalCores: 4, loadAverage: [0, 0, 0] },
  memory: { totalBytes: 1024, freeBytes: 512 },
  uptimeSeconds: 10,
  devices: [],
  mounts: [],
  network: [],
  systemdAvailable: true,
};

describe('HostRuntime', () => {
  it('captures a read-only host snapshot during initialization', async () => {
    const runtime = new HostRuntime({ inspector: { inspect: async () => snapshot } });
    await runtime.initialize();
    expect(runtime.state).toBe('running');
    expect(runtime.currentSnapshot()).toEqual(snapshot);
    expect(runtime.capabilities).not.toContain('host:power');
  });

  it('denies power operations by default', async () => {
    const execute = vi.fn();
    const runtime = new HostRuntime({ inspector: { inspect: async () => snapshot }, commandExecutor: { execute } });
    await expect(runtime.reboot()).rejects.toThrow('disabled');
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires explicit authorization even when power operations are enabled', async () => {
    const execute = vi.fn();
    const runtime = new HostRuntime({
      inspector: { inspect: async () => snapshot },
      commandExecutor: { execute },
      allowPowerOperations: true,
      authorizePowerOperation: async () => false,
    });
    await expect(runtime.shutdown()).rejects.toThrow('not authorized');
    expect(execute).not.toHaveBeenCalled();
  });
});
