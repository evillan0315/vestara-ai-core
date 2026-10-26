import { describe, expect, it } from 'vitest';
import { DefaultObservationEngine } from '../src/index';

describe('DefaultObservationEngine contract', () => {
  it('records observations with identity and confidence', async () => {
    const engine = new DefaultObservationEngine();
    const first = await engine.observe('perception', 'anomaly', { value: 1 });
    const second = await engine.observe('perception', 'anomaly', { value: 2 }, 0.5);
    expect(first.id).toBeDefined();
    expect(first.id).not.toBe(second.id);
    expect(first.confidence).toBe(1.0);
    expect(second.confidence).toBe(0.5);
    expect(engine.getRecent()).toHaveLength(2);
    expect(engine.getRecent(1)).toHaveLength(1);
  });
});
