import { describe, it, expect, vi } from 'vitest';
import { InProcessEventBus } from '../src/index';

describe('InProcessEventBus', () => {
  it('delivers events to exact-match subscribers', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: { value: 42 } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'test.event', payload: { value: 42 } }));
  });

  it('does not deliver events to non-matching subscribers', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('other.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers events to wildcard subscribers', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('*', handler);
    await bus.emit({ type: 'any.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('delivers events to prefix-wildcard subscribers', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.*', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not deliver to prefix-wildcard for non-matching prefix', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.*', handler);
    await bus.emit({ type: 'other.event', source: 'test', payload: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  it('once() delivers only one event then auto-removes', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.once('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe callback removes the subscription', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });
    unsub();
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribeAll(pattern) removes only matching subscriptions', async () => {
    const bus = new InProcessEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    bus.subscribe('test.a', handlerA);
    bus.subscribe('test.b', handlerB);
    bus.unsubscribeAll('test.a');

    await bus.emit({ type: 'test.a', source: 'test', payload: {} });
    await bus.emit({ type: 'test.b', source: 'test', payload: {} });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it('unsubscribeAll() with no arg removes all subscriptions', async () => {
    const bus = new InProcessEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    bus.subscribe('test.a', handlerA);
    bus.subscribe('test.b', handlerB);
    bus.unsubscribeAll();

    await bus.emit({ type: 'test.a', source: 'test', payload: {} });
    await bus.emit({ type: 'test.b', source: 'test', payload: {} });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });

  it('tracks metrics correctly', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    const metrics = bus.getMetrics();
    expect(metrics.totalEmitted).toBe(1);
    expect(metrics.totalProcessed).toBe(1);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.activeSubscribers).toBe(1);
  });

  it('tracks failed metrics when handler throws', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn(() => {
      throw new Error('fail');
    });

    bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    const metrics = bus.getMetrics();
    expect(metrics.totalEmitted).toBe(1);
    expect(metrics.totalProcessed).toBe(0);
    expect(metrics.totalFailed).toBe(1);
  });

  it('retries on failure when retry option is set', async () => {
    const bus = new InProcessEventBus();
    let callCount = 0;
    const handler = vi.fn(() => {
      callCount++;
      if (callCount < 3) throw new Error('transient');
    });

    bus.subscribe('test.event', handler, { retry: true, maxRetries: 3 });
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(bus.getMetrics().totalFailed).toBeGreaterThanOrEqual(2);
  });

  it('does not retry when retry is false', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn(() => {
      throw new Error('fail');
    });

    bus.subscribe('test.event', handler, { retry: false });
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('generates unique event IDs', async () => {
    const bus = new InProcessEventBus();
    const ids: string[] = [];
    const handler = vi.fn((event: { id: string }) => {
      ids.push(event.id);
    });

    bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(ids[0]).not.toBe(ids[1]);
  });

  it('defaults version to 1 when not provided', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it('preserves actor and metadata fields', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.event', handler);
    await bus.emit({
      type: 'test.event',
      source: 'test',
      payload: {},
      actor: { id: 'user-1', role: 'user' },
      metadata: { correlationId: 'corr-123', traceId: 'trace-456' },
    });

    const event = handler.mock.calls[0][0];
    expect(event.actor).toEqual({ id: 'user-1', role: 'user' });
    expect(event.metadata.correlationId).toBe('corr-123');
    expect(event.metadata.traceId).toBe('trace-456');
  });

  it('delivers to multiple subscribers of the same pattern', async () => {
    const bus = new InProcessEventBus();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    bus.subscribe('test.event', handlerA);
    bus.subscribe('test.event', handlerB);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it('returns a copy of metrics (mutation-safe)', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();

    bus.subscribe('test.event', handler);
    await bus.emit({ type: 'test.event', source: 'test', payload: {} });

    const metrics = bus.getMetrics();
    (metrics as { totalEmitted: number }).totalEmitted = 999;

    expect(bus.getMetrics().totalEmitted).toBe(1);
  });
});
