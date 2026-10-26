import { describe, expect, it } from 'vitest';
import { BROWSER_SESSION_CREATED, DEFAULT_BROWSER_PERMISSIONS, evaluateBrowserPermission } from '../src/index';

describe('browser permission governance contract', () => {
  it('publishes session lifecycle event names', () => {
    expect(typeof BROWSER_SESSION_CREATED).toBe('string');
    expect(BROWSER_SESSION_CREATED.length).toBeGreaterThan(0);
    expect(DEFAULT_BROWSER_PERMISSIONS.length).toBeGreaterThan(0);
  });

  it('defaults unknown actions to ask, never allow', () => {
    const decision = evaluateBrowserPermission('definitely.not.a.real.action');
    expect(decision.level).toBe('ask');
    for (const rule of DEFAULT_BROWSER_PERMISSIONS) {
      expect(['allow', 'ask', 'deny']).toContain(rule.level);
    }
  });
});
