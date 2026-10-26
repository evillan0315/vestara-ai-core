import { describe, expect, it } from 'vitest';
import { DefaultStrategySelector, FastResponseStrategy } from '../src/index';

function context(input: string) {
  return { input, availableProviders: [] } as never;
}

describe('reasoning strategy contract', () => {
  it('routes short inputs to fast response with a usable result', async () => {
    const fast = new FastResponseStrategy();
    expect(fast.id).toBe('fast-response');
    expect(fast.supports(context('hi'))).toBe(true);
    const result = await fast.execute(context('hi'));
    expect(result.strategy).toBe('fast-response');
    expect(result.requiresAction).toBe(false);
  });

  it('always selects a strategy, falling back to fast response', () => {
    const selector = new DefaultStrategySelector();
    const selected = selector.select(context('a'.repeat(5000)));
    expect(selected.id).toBeDefined();
    expect(typeof selected.execute).toBe('function');
  });
});
