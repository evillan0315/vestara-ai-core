import { describe, expect, it } from 'vitest';
import { EngineeringEventStore } from '../src/events';
import { entityId } from '../src/ids';

describe('engineering graph contract', () => {
  it('builds stable entity ids', () => {
    expect(entityId('runtime', 'r1')).toBe('runtime://r1');
  });

  it('appends sequenced events and queries history', () => {
    const store = new EngineeringEventStore();
    const [created] = store.append([
      { at: new Date().toISOString(), type: 'entity-created', entityId: 'runtime://r1' } as never,
    ]);
    expect(created.seq).toBe(1);
    expect(store.eventCount).toBe(1);
    expect(store.all()).toHaveLength(1);
    expect(store.since(0)).toHaveLength(1);
    expect(store.since(1)).toHaveLength(0);
    expect(store.history('runtime://r1')).toHaveLength(1);
    expect(store.history('runtime://other')).toHaveLength(0);
  });
});
