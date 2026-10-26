import { describe, expect, it } from 'vitest';
import { FindingLifecycleManager, getAllowedTransitions, isTransitionAllowed } from '../src/findings-lifecycle';

describe('observer findings lifecycle contract', () => {
  it('allows observation → hypothesis and rejects observation → diagnosis', () => {
    expect(isTransitionAllowed('observation', 'hypothesis')).toBe(true);
    expect(isTransitionAllowed('observation', 'diagnosis')).toBe(false);
    expect(getAllowedTransitions('rejected')).toEqual([]);
  });

  it('transitions a finding without triggering execution', () => {
    const manager = new FindingLifecycleManager();
    const finding = { id: 'f1', status: 'observation' } as never;
    const ok = manager.transition(finding, 'hypothesis', 'evidence gathered');
    expect(ok.success).toBe(true);
    const bad = manager.transition(finding, 'merged');
    expect(bad.success).toBe(false);
  });
});
