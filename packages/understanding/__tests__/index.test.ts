import { describe, expect, expectTypeOf, it } from 'vitest';
import type { UnderstandingAssembler, UnderstandingProducer } from '../src/index.js';

describe('@vestara/understanding', () => {
  it('can import the module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });

  it('exports the UnderstandingAssembler contract', () => {
    expectTypeOf<UnderstandingAssembler>().toHaveProperty('assemble');
  });

  it('exports the UnderstandingProducer contract', () => {
    expectTypeOf<UnderstandingProducer>().toHaveProperty('produce');
  });
});
