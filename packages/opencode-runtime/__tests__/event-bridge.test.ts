import { describe, expect, it, vi } from 'vitest';
import { OpenCodeEventBridge } from '../src/events/event-bridge';
import { normalizeOpenCodeEvent } from '../src/events/event-types';

function rawEvent(type: string, properties: Record<string, unknown>, id = 'evt-1') {
  return { id, type, payload: properties };
}

function fakeBus() {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const bus = {
    emitted,
    emit: vi.fn(async (event: { type: string; payload: Record<string, unknown> }) => {
      emitted.push(event);
    }),
  };
  return { bus, emitted };
}

function fakeClient(events: unknown[], { errorOnFirst = false, holdOpen = false } = {}) {
  let reads = 0;
  return {
    openEventStream: vi.fn(async function* (_context: unknown, signal?: AbortSignal) {
      if (errorOnFirst && reads === 0) {
        reads += 1;
        throw new Error('upstream down');
      }
      reads += 1;
      for (const event of events) {
        if (signal?.aborted) return;
        yield event;
      }
      if (holdOpen) {
        await new Promise((resolve) => {
          const timer = setInterval(() => {
            if (signal?.aborted) {
              clearInterval(timer);
              resolve(undefined);
            }
          }, 10);
        });
      }
    }),
  };
}

describe('normalizeOpenCodeEvent', () => {
  it('extracts session, message, and part ids from properties', () => {
    const event = normalizeOpenCodeEvent(
      rawEvent('message.part.delta', {
        sessionID: 'ses-1',
        messageID: 'msg-1',
        partID: 'prt-1',
        field: 'text',
        delta: 'The',
      }),
    );
    expect(event).toMatchObject({
      type: 'message.part.delta',
      category: 'message',
      sessionId: 'ses-1',
      messageId: 'msg-1',
      partId: 'prt-1',
      delta: 'The',
    });
  });

  it('reads message id from nested info', () => {
    const event = normalizeOpenCodeEvent(
      rawEvent('message.updated', {
        sessionID: 'ses-1',
        info: { id: 'msg-9' },
      }),
    );
    expect(event?.messageId).toBe('msg-9');
    expect(event?.category).toBe('message');
  });

  it('categorizes permission, session, server, and unknown types', () => {
    expect(normalizeOpenCodeEvent(rawEvent('permission.request', {}))?.category).toBe('permission');
    expect(normalizeOpenCodeEvent(rawEvent('session.status', {}))?.category).toBe('session');
    expect(normalizeOpenCodeEvent(rawEvent('server.connected', {}))?.category).toBe('server');
    expect(normalizeOpenCodeEvent(rawEvent('widget.wobble', {}))?.category).toBe('unknown');
  });

  it('drops malformed frames', () => {
    expect(normalizeOpenCodeEvent(undefined)).toBeUndefined();
    expect(normalizeOpenCodeEvent({ id: 'x', type: '', payload: {} })).toBeUndefined();
  });
});

describe('OpenCodeEventBridge', () => {
  it('publishes normalized non-delta events to the bus', async () => {
    const { bus, emitted } = fakeBus();
    const client = fakeClient([
      rawEvent('server.connected', {}),
      rawEvent('session.status', { sessionID: 'ses-1', status: { type: 'busy' } }),
    ]);
    const bridge = new OpenCodeEventBridge({
      client: client as never,
      eventBus: bus as never,
      context: { workspaceId: 'ws-1' },
    });
    await bridge.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await bridge.stop();
    expect(emitted.map((e) => e.type)).toEqual(['opencode.server.connected', 'opencode.session.status']);
    expect(emitted[1].payload).toMatchObject({ sessionId: 'ses-1' });
  });

  it('coalesces message.part.delta frames into one bus event', async () => {
    const { bus, emitted } = fakeBus();
    const deltas = ['The', ' user', ' said', ' hi'];
    const client = fakeClient(
      deltas.map((d) =>
        rawEvent('message.part.delta', {
          sessionID: 'ses-1',
          messageID: 'msg-1',
          partID: 'prt-1',
          field: 'text',
          delta: d,
        }),
      ),
    );
    const bridge = new OpenCodeEventBridge({
      client: client as never,
      eventBus: bus as never,
      context: { workspaceId: 'ws-1' },
    });
    await bridge.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await bridge.stop();
    const deltaEvents = emitted.filter((e) => e.type === 'opencode.message.part.delta');
    expect(deltaEvents).toHaveLength(1);
    expect(deltaEvents[0].payload).toMatchObject({ delta: 'The user said hi' });
  });

  it('reconnects with backoff after the stream ends', async () => {
    const { bus, emitted } = fakeBus();
    const client = fakeClient([rawEvent('server.connected', {})]);
    const states: string[] = [];
    const bridge = new OpenCodeEventBridge({
      client: client as never,
      eventBus: bus as never,
      context: { workspaceId: 'ws-1' },
      reconnectDelayMs: 5,
      maxReconnectDelayMs: 10,
      onConnectionState: (state) => states.push(state),
    });
    await bridge.start();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(client.openEventStream.mock.calls.length).toBeGreaterThan(1);
    expect(states).toContain('reconnecting');
    expect(emitted.length).toBeGreaterThanOrEqual(1);
    await bridge.stop();
  });

  it('recovers from an initial upstream error', async () => {
    const { bus } = fakeBus();
    const client = fakeClient([rawEvent('server.connected', {})], { errorOnFirst: true, holdOpen: true });
    const bridge = new OpenCodeEventBridge({
      client: client as never,
      eventBus: bus as never,
      context: { workspaceId: 'ws-1' },
      reconnectDelayMs: 5,
      maxReconnectDelayMs: 10,
    });
    await bridge.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(client.openEventStream.mock.calls.length).toBeGreaterThan(1);
    expect(bridge.connected).toBe(true);
    await bridge.stop();
  });
});
