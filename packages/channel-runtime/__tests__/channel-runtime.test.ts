/**
 * @vestara/channel-runtime — Unit Tests (TG-004)
 *
 * Covers routing, unknown channel rejection, canonical envelope
 * validation, and correlation propagation without owning
 * conversation or execution state.
 */

import type {
  ChannelAction,
  ChannelDelivery,
  ChannelDeliveryResult,
  ChannelEvent,
  ChannelMessage,
} from '@vestara/channel-types';
import { describe, expect, it } from 'vitest';
import { type ChannelAdapter, ChannelGateway, DeliveryQueue } from '../src/index.js';

// ─── Fake Adapter ──────────────────────────────────────────────

function createFakeAdapter(kind: 'telegram' | 'web' = 'telegram'): ChannelAdapter & {
  messages: ChannelMessage[];
  actions: ChannelAction[];
  deliveries: ChannelDelivery[];
} {
  const messages: ChannelMessage[] = [];
  const actions: ChannelAction[] = [];
  const deliveries: ChannelDelivery[] = [];
  return {
    kind,
    messages,
    actions,
    deliveries,
    async processMessage(message: ChannelMessage): Promise<ChannelEvent> {
      messages.push(message);
      return {
        id: `evt-${message.id}`,
        channel: message.channel,
        type: 'message.received',
        payload: { messageId: message.id, conversationId: message.conversation.externalId },
        timestamp: new Date().toISOString(),
      };
    },
    async processAction(action: ChannelAction): Promise<ChannelEvent> {
      actions.push(action);
      return {
        id: `evt-${action.id}`,
        channel: action.channel,
        type: 'action.received',
        payload: { actionId: action.id, conversationId: action.conversation.externalId },
        timestamp: new Date().toISOString(),
      };
    },
    async sendDelivery(delivery: ChannelDelivery): Promise<ChannelDeliveryResult> {
      deliveries.push(delivery);
      return {
        deliveryId: delivery.id,
        success: true,
        externalMessageId: `ext-${delivery.id}`,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channel: 'telegram',
    sender: { channel: 'telegram', externalId: 'user-1' },
    conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
    text: 'hello',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeDelivery(overrides: Partial<ChannelDelivery> = {}): ChannelDelivery {
  return {
    id: 'del-1',
    channel: 'telegram',
    conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
    content: { text: 'response' },
    priority: 'normal',
    ...overrides,
  };
}

// ─── Routing ───────────────────────────────────────────────────

describe('@vestara/channel-runtime — routing', () => {
  it('routes inbound messages to the registered adapter', async () => {
    const adapter = createFakeAdapter();
    const gateway = new ChannelGateway({ adapters: [adapter], handlers: {} });
    const event = await gateway.processMessage(makeMessage());

    expect(event.type).toBe('message.received');
    expect(adapter.messages).toHaveLength(1);
  });

  it('routes inbound actions to the registered adapter', async () => {
    const adapter = createFakeAdapter();
    const gateway = new ChannelGateway({ adapters: [adapter], handlers: {} });
    const action: ChannelAction = {
      id: 'act-1',
      channel: 'telegram',
      type: 'button',
      payload: { type: 'button', label: 'Approve', data: 'approve' },
      sender: { channel: 'telegram', externalId: 'user-1' },
      conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
      timestamp: new Date().toISOString(),
    };
    const event = await gateway.processAction(action);

    expect(event.type).toBe('action.received');
    expect(adapter.actions).toHaveLength(1);
  });

  it('emits outbound deliveries through the canonical contract', async () => {
    const adapter = createFakeAdapter();
    const seen: ChannelDeliveryResult[] = [];
    const gateway = new ChannelGateway({
      adapters: [adapter],
      handlers: { onDeliveryResult: async (r) => void seen.push(r) },
    });
    const result = await gateway.sendDelivery(makeDelivery());

    expect(result.success).toBe(true);
    expect(adapter.deliveries).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(gateway.getDeliveryResult('del-1')?.deliveryId).toBe('del-1');
  });

  it('does not retain conversation or execution state', async () => {
    const adapter = createFakeAdapter();
    const gateway = new ChannelGateway({ adapters: [adapter], handlers: {} });
    await gateway.processMessage(makeMessage({ id: 'm-1', text: 'first' }));
    await gateway.processMessage(makeMessage({ id: 'm-2', text: 'second' }));

    expect(adapter.messages.map((m) => m.id)).toEqual(['m-1', 'm-2']);
    expect(gateway.getPendingDeliveries()).toHaveLength(0);
  });
});

// ─── Unknown Channel Rejection ─────────────────────────────────

describe('@vestara/channel-runtime — unknown channel rejection', () => {
  it('rejects messages for unregistered channels', async () => {
    const gateway = new ChannelGateway({ adapters: [createFakeAdapter('telegram')], handlers: {} });
    await expect(gateway.processMessage(makeMessage({ channel: 'slack' }))).rejects.toThrow(
      'No adapter registered for channel: slack',
    );
  });

  it('rejects actions for unregistered channels', async () => {
    const gateway = new ChannelGateway({ adapters: [createFakeAdapter('telegram')], handlers: {} });
    const action: ChannelAction = {
      id: 'act-x',
      channel: 'discord',
      type: 'button',
      payload: { type: 'button', label: 'Ok', data: 'ok' },
      sender: { channel: 'discord', externalId: 'u' },
      conversation: { channel: 'discord', externalId: 'c', type: 'direct' },
      timestamp: new Date().toISOString(),
    };
    await expect(gateway.processAction(action)).rejects.toThrow('No adapter registered for channel: discord');
  });

  it('rejects deliveries for unregistered channels', async () => {
    const gateway = new ChannelGateway({ adapters: [], handlers: {} });
    await expect(gateway.sendDelivery(makeDelivery({ channel: 'web' }))).rejects.toThrow(
      'No adapter registered for channel: web',
    );
  });
});

// ─── Envelope Validation ───────────────────────────────────────

describe('@vestara/channel-runtime — envelope validation', () => {
  it('rejects malformed inbound messages', async () => {
    const gateway = new ChannelGateway({ adapters: [createFakeAdapter()], handlers: {} });
    await expect(gateway.processMessage({} as ChannelMessage)).rejects.toThrow('Invalid ChannelMessage envelope');
  });

  it('rejects malformed actions', async () => {
    const gateway = new ChannelGateway({ adapters: [createFakeAdapter()], handlers: {} });
    await expect(gateway.processAction({} as ChannelAction)).rejects.toThrow('Invalid ChannelAction envelope');
  });

  it('rejects malformed deliveries', async () => {
    const gateway = new ChannelGateway({ adapters: [createFakeAdapter()], handlers: {} });
    await expect(gateway.sendDelivery({ id: 'bad' } as ChannelDelivery)).rejects.toThrow(
      'Invalid ChannelDelivery envelope',
    );
  });
});

// ─── Correlation Propagation ───────────────────────────────────

describe('@vestara/channel-runtime — correlation propagation', () => {
  it('propagates message and conversation ids to handlers', async () => {
    const seenMessages: ChannelMessage[] = [];
    const seenEvents: ChannelEvent[] = [];
    const gateway = new ChannelGateway({
      adapters: [createFakeAdapter()],
      handlers: {
        onMessage: async (m) => void seenMessages.push(m),
        onEvent: async (e) => void seenEvents.push(e),
      },
    });
    await gateway.processMessage(makeMessage({ id: 'corr-1' }));

    expect(seenMessages[0]?.id).toBe('corr-1');
    expect(seenEvents[0]?.payload).toMatchObject({ messageId: 'corr-1', conversationId: 'chat-1' });
  });

  it('propagates action correlation to handlers', async () => {
    const seenActions: ChannelAction[] = [];
    const gateway = new ChannelGateway({
      adapters: [createFakeAdapter()],
      handlers: { onAction: async (a) => void seenActions.push(a) },
    });
    const action: ChannelAction = {
      id: 'corr-act-1',
      channel: 'telegram',
      type: 'callback',
      payload: { type: 'callback', data: 'approve:1' },
      sender: { channel: 'telegram', externalId: 'user-1' },
      conversation: { channel: 'telegram', externalId: 'chat-9', type: 'direct' },
      timestamp: new Date().toISOString(),
    };
    const event = await gateway.processAction(action);

    expect(seenActions[0]?.id).toBe('corr-act-1');
    expect(event.payload).toMatchObject({ actionId: 'corr-act-1', conversationId: 'chat-9' });
  });
});

// ─── Delivery Queue ────────────────────────────────────────────

describe('@vestara/channel-runtime — delivery queue', () => {
  it('retries then dead-letters after max retries', () => {
    const queue = new DeliveryQueue(2, 10);
    queue.enqueue(makeDelivery({ id: 'q-1' }));
    const entry = queue.dequeue();
    expect(entry?.status).toBe('delivering');

    queue.fail('q-1');
    expect(queue.pendingCount).toBe(0);
    queue.fail('q-1');
    // Second failure reaches maxRetries=2 → dead-letter
    expect(queue.size).toBe(1);
  });

  it('marks deliveries completed', () => {
    const queue = new DeliveryQueue();
    queue.enqueue(makeDelivery({ id: 'q-2' }));
    queue.dequeue();
    queue.complete('q-2');
    expect(queue.pendingCount).toBe(0);
  });
});
