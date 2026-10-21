import { describe, expect, it } from 'vitest';
import { createRng } from './random';

describe('createRng (mulberry32)', () => {
  it('reproduces the same sequence for a fixed seed', () => {
    const a = createRng(112);
    const b = createRng(112);
    expect(Array.from({ length: 32 }, () => a())).toEqual(Array.from({ length: 32 }, () => b()));
  });

  it('emits values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('diverges across seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
});
