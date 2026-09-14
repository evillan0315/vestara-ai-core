/**
 * @vestara/channel-types — Unit Tests
 *
 * Validates that canonical channel contracts:
 * 1. Export all required types
 * 2. Contain no Telegram-specific types (TelegramUpdate, TelegramChat, etc.)
 * 3. Accept valid envelopes
 * 4. Reject malformed/unsupported input
 */

import { describe, expect, it } from 'vitest';

// ─── Type Exports ──────────────────────────────────────────────

// If these imports compile, the types are exported correctly.
import type {
  ChannelAction,
  ChannelAttachment,
  ChannelButton,
  ChannelConfig,
  ChannelConversationRef,
  ChannelDelivery,
  ChannelDeliveryResult,
  ChannelEvent,
  ChannelEventType,
  ChannelIdentity,
  ChannelKind,
  ChannelMessage,
} from '../src/index.js';
import * as channelTypes from '../src/index.js';
import { isChannelDelivery, isChannelMessage } from '../src/index.js';

// ─── Type Compilation Tests ────────────────────────────────────

describe('@vestara/channel-types — Type Exports', () => {
  it('exports ChannelKind', () => {
    // Type-level check: assignability
    const kind: ChannelKind = 'telegram';
    expect(kind).toBe('telegram');
  });

  it('exports ChannelIdentity', () => {
    const identity: ChannelIdentity = {
      channel: 'web',
      externalId: 'user-123',
      displayName: 'Test User',
      username: 'testuser',
    };
    expect(identity.channel).toBe('web');
    expect(identity.externalId).toBe('user-123');
  });

  it('exports ChannelConversationRef', () => {
    const ref: ChannelConversationRef = {
      channel: 'telegram',
      externalId: 'chat-456',
      type: 'direct',
      title: 'Test Chat',
    };
    expect(ref.type).toBe('direct');
  });

  it('exports ChannelMessage', () => {
    const message: ChannelMessage = {
      id: 'msg-001',
      channel: 'telegram',
      externalMessageId: 'ext-001',
      sender: { channel: 'telegram', externalId: 'user-1' },
      conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
      text: 'Hello',
      timestamp: new Date().toISOString(),
    };
    expect(message.text).toBe('Hello');
  });

  it('exports ChannelAttachment', () => {
    const attachment: ChannelAttachment = {
      id: 'att-001',
      type: 'image',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 1024,
      url: 'https://example.com/photo.jpg',
    };
    expect(attachment.type).toBe('image');
  });

  it('exports ChannelAction', () => {
    const action: ChannelAction = {
      id: 'act-001',
      channel: 'telegram',
      type: 'button',
      payload: { type: 'button', label: 'Approve', data: 'approve-123' },
      sender: { channel: 'telegram', externalId: 'user-1' },
      conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
      timestamp: new Date().toISOString(),
    };
    expect(action.type).toBe('button');
  });

  it('exports ChannelDelivery', () => {
    const delivery: ChannelDelivery = {
      id: 'del-001',
      channel: 'telegram',
      conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
      content: { text: 'Response' },
      priority: 'normal',
    };
    expect(delivery.content.text).toBe('Response');
  });

  it('exports ChannelDeliveryResult', () => {
    const result: ChannelDeliveryResult = {
      deliveryId: 'del-001',
      success: true,
      externalMessageId: 'tg-msg-123',
      timestamp: new Date().toISOString(),
    };
    expect(result.success).toBe(true);
  });

  it('exports ChannelEvent', () => {
    const event: ChannelEvent = {
      id: 'evt-001',
      channel: 'telegram',
      type: 'message.received',
      payload: {},
      timestamp: new Date().toISOString(),
    };
    expect(event.type).toBe('message.received');
  });

  it('exports ChannelConfig', () => {
    const config: ChannelConfig = {
      channel: 'telegram',
      enabled: true,
      config: { botToken: 'xxx' },
    };
    expect(config.enabled).toBe(true);
  });

  it('exports ChannelButton', () => {
    const button: ChannelButton = {
      text: 'Click me',
      callbackData: 'action:approve',
    };
    expect(button.text).toBe('Click me');
  });
});

// ─── No Telegram-Specific Types ────────────────────────────────

describe('@vestara/channel-types — Boundary Purity', () => {
  it('does not export TelegramUpdate', () => {
    const mod = channelTypes as Record<string, unknown>;
    expect(mod.TelegramUpdate).toBeUndefined();
  });

  it('does not export TelegramChat', () => {
    const mod = channelTypes as Record<string, unknown>;
    expect(mod.TelegramChat).toBeUndefined();
  });

  it('does not export TelegramCallbackQuery', () => {
    const mod = channelTypes as Record<string, unknown>;
    expect(mod.TelegramCallbackQuery).toBeUndefined();
  });

  it('does not export TelegramMessage', () => {
    const mod = channelTypes as Record<string, unknown>;
    expect(mod.TelegramMessage).toBeUndefined();
  });

  it('does not export TelegramUser', () => {
    const mod = channelTypes as Record<string, unknown>;
    expect(mod.TelegramUser).toBeUndefined();
  });
});

// ─── Valid Envelope Construction ───────────────────────────────

describe('@vestara/channel-types — Valid Envelopes', () => {
  it('constructs a minimal ChannelMessage', () => {
    const msg: ChannelMessage = {
      id: '1',
      channel: 'web',
      sender: { channel: 'web', externalId: 'u1' },
      conversation: { channel: 'web', externalId: 'c1', type: 'direct' },
      timestamp: '2026-09-14T00:00:00Z',
    };
    expect(msg.id).toBe('1');
    expect(msg.text).toBeUndefined();
    expect(msg.attachments).toBeUndefined();
  });

  it('constructs a ChannelMessage with all optional fields', () => {
    const msg: ChannelMessage = {
      id: '2',
      channel: 'slack',
      externalMessageId: 'slack-msg-1',
      sender: { channel: 'slack', externalId: 'u2', displayName: 'User', username: 'user' },
      conversation: { channel: 'slack', externalId: 'c2', type: 'group', title: 'General' },
      text: 'Hello world',
      attachments: [
        {
          id: 'a1',
          type: 'document',
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          url: 'https://example.com/doc.pdf',
        },
      ],
      replyTo: 'msg-0',
      timestamp: '2026-09-14T00:00:00Z',
      metadata: { source: 'import' },
    };
    expect(msg.attachments).toHaveLength(1);
    expect(msg.replyTo).toBe('msg-0');
  });

  it('constructs a ChannelDelivery with inline keyboard', () => {
    const delivery: ChannelDelivery = {
      id: 'del-1',
      channel: 'telegram',
      conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
      content: {
        text: 'Choose:',
        inlineKeyboard: [
          [
            { text: 'Yes', callbackData: 'yes' },
            { text: 'No', callbackData: 'no' },
          ],
        ],
      },
      priority: 'high',
    };
    expect(delivery.content.inlineKeyboard).toHaveLength(1);
    expect(delivery.content.inlineKeyboard![0]).toHaveLength(2);
  });

  it('constructs a ChannelAction with command payload', () => {
    const action: ChannelAction = {
      id: 'act-1',
      channel: 'cli',
      type: 'command',
      payload: { type: 'command', command: '/status', args: ['--verbose'] },
      sender: { channel: 'cli', externalId: 'u1' },
      conversation: { channel: 'cli', externalId: 'c1', type: 'direct' },
      timestamp: '2026-09-14T00:00:00Z',
    };
    expect(action.payload.type).toBe('command');
  });

  it('constructs a ChannelEvent with all event types', () => {
    const eventTypes: ChannelEventType[] = [
      'message.received',
      'message.edited',
      'message.deleted',
      'action.received',
      'delivery.completed',
      'delivery.failed',
      'typing.started',
      'typing.stopped',
      'member.joined',
      'member.left',
    ];
    for (const type of eventTypes) {
      const event: ChannelEvent = {
        id: `evt-${type}`,
        channel: 'telegram',
        type,
        payload: {},
        timestamp: '2026-09-14T00:00:00Z',
      };
      expect(event.type).toBe(type);
    }
  });
});

// ─── ChannelKind Coverage ──────────────────────────────────────

describe('@vestara/channel-types — ChannelKind', () => {
  it('supports all channel kinds', () => {
    const kinds: ChannelKind[] = ['web', 'telegram', 'mobile', 'desktop', 'cli', 'slack', 'discord', 'other'];
    expect(kinds).toHaveLength(8);
    for (const kind of kinds) {
      const identity: ChannelIdentity = { channel: kind, externalId: '1' };
      expect(identity.channel).toBe(kind);
    }
  });
});

// ─── Malformed / Unsupported Input Rejection ─────────────────────

describe('@vestara/channel-types — Malformed Input Rejection', () => {
  it('rejects malformed ChannelMessage envelopes', () => {
    expect(isChannelMessage(undefined)).toBe(false);
    expect(isChannelMessage({})).toBe(false);
    expect(
      isChannelMessage({
        id: '1',
        channel: 'telegram',
        sender: { channel: 'telegram', externalId: '' },
        conversation: { channel: 'telegram', externalId: 'c1', type: 'direct' },
        timestamp: '2026-09-14T00:00:00Z',
      }),
    ).toBe(false);
    expect(
      isChannelMessage({
        id: '1',
        channel: 'telegram',
        sender: { channel: 'telegram', externalId: 'u1' },
        conversation: { channel: 'telegram', externalId: 'c1', type: 'direct' },
        timestamp: '2026-09-14T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('rejects unsupported channel kinds', () => {
    expect(
      isChannelMessage({
        id: '1',
        channel: 'carrier-pigeon',
        sender: { channel: 'carrier-pigeon', externalId: 'u1' },
        conversation: { channel: 'carrier-pigeon', externalId: 'c1', type: 'direct' },
        timestamp: '2026-09-14T00:00:00Z',
      }),
    ).toBe(false);
  });

  it('rejects malformed ChannelDelivery envelopes', () => {
    expect(isChannelDelivery(undefined)).toBe(false);
    expect(isChannelDelivery({ id: 'd1' })).toBe(false);
    expect(
      isChannelDelivery({
        id: 'd1',
        channel: 'telegram',
        conversation: { channel: 'telegram', externalId: 'c1', type: 'direct' },
        content: { text: 'hi' },
        priority: 'urgent',
      }),
    ).toBe(false);
    expect(
      isChannelDelivery({
        id: 'd1',
        channel: 'telegram',
        conversation: { channel: 'telegram', externalId: 'c1', type: 'direct' },
        content: { text: 'hi' },
        priority: 'normal',
      }),
    ).toBe(true);
  });
});

// ─── Attachment Type Coverage ──────────────────────────────────

describe('@vestara/channel-types — Attachment Types', () => {
  it('supports all attachment types', () => {
    const types = ['image', 'document', 'audio', 'video', 'voice', 'sticker', 'other'] as const;
    for (const type of types) {
      const att: ChannelAttachment = {
        id: `att-${type}`,
        type,
        fileName: `file.${type}`,
        mimeType: 'application/octet-stream',
        size: 100,
        url: `https://example.com/${type}`,
      };
      expect(att.type).toBe(type);
    }
  });
});
