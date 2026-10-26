import { describe, expect, it } from 'vitest';
import { IntentManager } from '../src/intent-manager';

describe('IntentManager contract', () => {
  it('submits, plans, approves, and completes an intent', () => {
    const manager = new IntentManager();
    const intent = manager.submit({ goal: 'ship feature', owner: 'alice' });
    expect(intent.id.startsWith('intent-')).toBe(true);
    expect(manager.plan(intent.id)).not.toBeNull();
    expect(() => manager.approve(intent.id)).not.toThrow();
    expect(() => manager.complete(intent.id, true)).not.toThrow();
  });
});
