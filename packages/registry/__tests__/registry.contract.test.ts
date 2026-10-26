import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../src/index';

describe('runtime registry contract', () => {
  it('defines core runtime entries with lifecycle configs', () => {
    expect(REGISTRY.runtime.type).toBe('runtime');
    expect(REGISTRY.system.lifecycle.maxRecoveryAttempts).toBeGreaterThan(0);
    for (const definition of Object.values(REGISTRY)) {
      expect(definition.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(definition.lifecycle.healthCheckIntervalMs).toBeGreaterThan(0);
    }
  });
});
