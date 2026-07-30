import { describe, expect, it } from 'vitest';

describe('@vestara/understanding', () => {
  it('can import the module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });

  it('exports UnderstandingAssembler', async () => {
    const mod = await import('../src/index.js');
    expect(mod.UnderstandingAssembler).toBeDefined();
  });

  it('exports UnderstandingProducer', async () => {
    const mod = await import('../src/index.js');
    expect(mod.UnderstandingProducer).toBeDefined();
  });
});
