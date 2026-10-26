import { describe, expect, it } from 'vitest';
import { DefaultPolicyEngine } from '../src/default-policy-engine';

describe('DefaultPolicyEngine contract', () => {
  it('evaluates empty policies to a well-formed decision', async () => {
    const engine = new DefaultPolicyEngine();
    const decision = await engine.evaluate({ context: {}, policies: [] });
    expect(['allow', 'deny', 'modify']).toContain(decision.result);
    expect(typeof decision.reason).toBe('string');
    expect(Array.isArray(decision.matchedPolicies)).toBe(true);
  });
});
