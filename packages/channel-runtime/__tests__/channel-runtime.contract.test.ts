import { describe, expect, it } from 'vitest';
import { ChannelGateway } from '../src/index';

const message = {
  id: 'm1',
  channel: 'telegram',
  sender: { channel: 'telegram', externalId: 'u1' },
  conversation: { channel: 'telegram', externalId: 'c1', type: 'direct' },
  timestamp: new Date().toISOString(),
  text: 'hello',
};

const adapter = {
  kind: 'telegram',
  processMessage: async () => ({ type: 'message.received', messageId: 'm1' }),
  processAction: async () => ({ type: 'action.received' }),
  sendDelivery: async () => ({ status: 'delivered' }),
} as never;

describe('ChannelGateway contract', () => {
  it('routes valid messages to the registered adapter', async () => {
    const gateway = new ChannelGateway({ adapters: [adapter], handlers: {} });
    expect(gateway.getAdapter('telegram')).toBe(adapter);
    expect(gateway.getAdapter('slack')).toBeUndefined();
    const event = await gateway.processMessage(message as never);
    expect(event).toMatchObject({ type: 'message.received' });
  });

  it('rejects malformed envelopes without touching adapters', async () => {
    const gateway = new ChannelGateway({ adapters: [adapter], handlers: {} });
    await expect(gateway.processMessage({ id: '', channel: 'nope' } as never)).rejects.toThrow();
  });
});
