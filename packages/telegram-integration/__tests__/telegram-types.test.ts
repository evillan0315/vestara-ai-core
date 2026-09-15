import { describe, expect, it } from 'vitest';
import * as adapterIndex from '../src/index.js';
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from '../src/telegram-types';
import {
  buildTelegramEditPayload,
  buildTelegramSendPayload,
  normalizeTelegramCallbackQuery,
  normalizeTelegramCommand,
  normalizeTelegramMessage,
  normalizeTelegramUpdate,
  parseTelegramCommand,
} from '../src/telegram-types';

// ─── Helpers ───────────────────────────────────────────────────

function makeTelegramMessage(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 123,
    from: { id: 999, first_name: 'Alice', last_name: 'Smith', username: 'alice' },
    chat: { id: 100, type: 'private' },
    text: 'Hello world',
    date: 1700000000,
    ...overrides,
  };
}

function makeTelegramCallbackQuery(overrides: Partial<TelegramCallbackQuery> = {}): TelegramCallbackQuery {
  return {
    id: 'cb-1',
    from: { id: 999, first_name: 'Alice', username: 'alice' },
    message: makeTelegramMessage(),
    data: 'action:confirm',
    ...overrides,
  };
}

// ─── normalizeTelegramMessage ──────────────────────────────────

describe('normalizeTelegramMessage', () => {
  it('converts a basic text message to ChannelMessage', () => {
    const msg = makeTelegramMessage();
    const result = normalizeTelegramMessage(msg);

    expect(result.id).toBe('tg-msg-123');
    expect(result.channel).toBe('telegram');
    expect(result.externalMessageId).toBe('123');
    expect(result.text).toBe('Hello world');
    expect(result.sender.channel).toBe('telegram');
    expect(result.sender.externalId).toBe('999');
    expect(result.sender.displayName).toBe('Alice Smith');
    expect(result.sender.username).toBe('alice');
    expect(result.conversation.channel).toBe('telegram');
    expect(result.conversation.externalId).toBe('100');
    expect(result.conversation.type).toBe('direct');
  });

  it('handles missing from field gracefully', () => {
    const msg = makeTelegramMessage({ from: undefined });
    const result = normalizeTelegramMessage(msg);

    expect(result.sender.externalId).toBe('0');
    expect(result.sender.displayName).toBeUndefined();
  });

  it('handles group chat type', () => {
    const msg = makeTelegramMessage({
      chat: { id: 200, type: 'group', title: 'Dev Team' },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.conversation.type).toBe('group');
    expect(result.conversation.title).toBe('Dev Team');
  });

  it('handles supergroup chat type as group', () => {
    const msg = makeTelegramMessage({
      chat: { id: 300, type: 'supergroup', title: 'Big Group' },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.conversation.type).toBe('group');
  });

  it('uses caption as text fallback', () => {
    const msg = makeTelegramMessage({ text: undefined, caption: 'Image caption' });
    const result = normalizeTelegramMessage(msg);

    expect(result.text).toBe('Image caption');
  });

  it('normalizes photo attachments', () => {
    const msg = makeTelegramMessage({
      photo: [
        { file_id: 'small', file_size: 1000 },
        { file_id: 'large', file_size: 5000 },
      ],
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].id).toBe('large');
    expect(result.attachments![0].type).toBe('image');
    expect(result.attachments![0].size).toBe(5000);
  });

  it('normalizes document attachments', () => {
    const msg = makeTelegramMessage({
      document: {
        file_id: 'doc-1',
        file_name: 'report.pdf',
        mime_type: 'application/pdf',
        file_size: 102400,
      },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].id).toBe('doc-1');
    expect(result.attachments![0].type).toBe('document');
    expect(result.attachments![0].fileName).toBe('report.pdf');
    expect(result.attachments![0].mimeType).toBe('application/pdf');
    expect(result.attachments![0].size).toBe(102400);
  });

  it('normalizes voice attachments', () => {
    const msg = makeTelegramMessage({
      voice: { file_id: 'voice-1', duration: 5, mime_type: 'audio/ogg' },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].id).toBe('voice-1');
    expect(result.attachments![0].type).toBe('voice');
    expect(result.attachments![0].mimeType).toBe('audio/ogg');
  });

  it('returns undefined attachments when none present', () => {
    const msg = makeTelegramMessage();
    const result = normalizeTelegramMessage(msg);

    expect(result.attachments).toBeUndefined();
  });

  it('handles reply_to_message', () => {
    const msg = makeTelegramMessage({
      reply_to_message: { message_id: 100 },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.replyTo).toBe('100');
  });

  it('handles missing reply_to_message', () => {
    const msg = makeTelegramMessage();
    const result = normalizeTelegramMessage(msg);

    expect(result.replyTo).toBeUndefined();
  });

  it('generates valid ISO timestamp from epoch seconds', () => {
    const msg = makeTelegramMessage({ date: 1700000000 });
    const result = normalizeTelegramMessage(msg);

    expect(result.timestamp).toBe('2023-11-14T22:13:20.000Z');
  });

  it('handles missing document file_name', () => {
    const msg = makeTelegramMessage({
      document: { file_id: 'doc-2', mime_type: 'text/plain', file_size: 100 },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.attachments![0].fileName).toBe('document');
  });

  it('handles missing document mime_type', () => {
    const msg = makeTelegramMessage({
      document: { file_id: 'doc-3', file_name: 'data.bin', file_size: 200 },
    });
    const result = normalizeTelegramMessage(msg);

    expect(result.attachments![0].mimeType).toBe('application/octet-stream');
  });
});

// ─── normalizeTelegramCallbackQuery ────────────────────────────

describe('normalizeTelegramCallbackQuery', () => {
  it('converts a callback query to ChannelAction', () => {
    const cb = makeTelegramCallbackQuery();
    const result = normalizeTelegramCallbackQuery(cb);

    expect(result.id).toBe('tg-action-cb-1');
    expect(result.channel).toBe('telegram');
    expect(result.type).toBe('callback');
    expect(result.callbackData).toBe('action:confirm');
    expect(result.payload).toEqual({ type: 'callback', data: 'action:confirm' });
    expect(result.sender.externalId).toBe('999');
    expect(result.conversation.externalId).toBe('100');
  });

  it('handles callback query without message', () => {
    const cb = makeTelegramCallbackQuery({ message: undefined });
    const result = normalizeTelegramCallbackQuery(cb);

    expect(result.conversation.externalId).toBe('');
    expect(result.externalMessageId).toBeUndefined();
  });

  it('handles missing callback data', () => {
    const cb = makeTelegramCallbackQuery({ data: undefined });
    const result = normalizeTelegramCallbackQuery(cb);

    expect(result.callbackData).toBeUndefined();
    expect(result.payload).toEqual({ type: 'callback', data: '' });
  });

  it('preserves external message ID from callback message', () => {
    const cb = makeTelegramCallbackQuery();
    const result = normalizeTelegramCallbackQuery(cb);

    expect(result.externalMessageId).toBe('123');
  });
});

// ─── normalizeTelegramUpdate ───────────────────────────────────

describe('normalizeTelegramUpdate', () => {
  it('normalizes a message update', () => {
    const update: TelegramUpdate = {
      update_id: 1,
      message: makeTelegramMessage(),
    };
    const result = normalizeTelegramUpdate(update);

    expect(result).not.toBeNull();
    expect(result!.channel).toBe('telegram');
    if (result && 'text' in result) {
      expect(result.text).toBe('Hello world');
    }
  });

  it('normalizes a callback_query update', () => {
    const update: TelegramUpdate = {
      update_id: 2,
      callback_query: makeTelegramCallbackQuery(),
    };
    const result = normalizeTelegramUpdate(update);

    expect(result).not.toBeNull();
    expect(result!.channel).toBe('telegram');
    if (result && 'callbackData' in result) {
      expect(result.callbackData).toBe('action:confirm');
    }
  });

  it('returns null for unknown update type', () => {
    const update: TelegramUpdate = {
      update_id: 3,
    };
    const result = normalizeTelegramUpdate(update);

    expect(result).toBeNull();
  });
});

// ─── Command Parsing ───────────────────────────────────────────

describe('parseTelegramCommand', () => {
  it('parses a bare command', () => {
    expect(parseTelegramCommand('/status')).toEqual({ command: 'status', args: [] });
  });

  it('parses a command with args', () => {
    expect(parseTelegramCommand('/model mimo-v2.5-free')).toEqual({
      command: 'model',
      args: ['mimo-v2.5-free'],
    });
  });

  it('strips @botname suffix', () => {
    expect(parseTelegramCommand('/status@mybot --verbose')).toEqual({
      command: 'status',
      args: ['--verbose'],
    });
  });

  it('returns null for non-command text', () => {
    expect(parseTelegramCommand('hello world')).toBeNull();
    expect(parseTelegramCommand('')).toBeNull();
    expect(parseTelegramCommand(undefined)).toBeNull();
    expect(parseTelegramCommand('/')).toBeNull();
  });
});

describe('normalizeTelegramCommand', () => {
  it('converts /start to a canonical command action', () => {
    const action = normalizeTelegramCommand(makeTelegramMessage({ text: '/start' }));
    expect(action).not.toBeNull();
    expect(action!.type).toBe('command');
    expect(action!.payload).toEqual({ type: 'command', command: '/start', args: [] });
    expect(action!.channel).toBe('telegram');
  });

  it('converts /model with args to a canonical command action', () => {
    const action = normalizeTelegramCommand(makeTelegramMessage({ text: '/model foo bar' }));
    expect(action!.payload).toEqual({ type: 'command', command: '/model', args: ['foo', 'bar'] });
  });

  it('returns null for plain text', () => {
    expect(normalizeTelegramCommand(makeTelegramMessage({ text: 'hi' }))).toBeNull();
  });
});

// ─── Additional Attachments ────────────────────────────────────

describe('normalizeTelegramMessage attachments', () => {
  it('normalizes audio attachments', () => {
    const result = normalizeTelegramMessage(
      makeTelegramMessage({ audio: { file_id: 'aud-1', file_name: 'song.mp3' } }),
    );
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('audio');
  });

  it('normalizes video attachments', () => {
    const result = normalizeTelegramMessage(
      makeTelegramMessage({ video: { file_id: 'vid-1', file_name: 'clip.mp4' } }),
    );
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('video');
  });

  it('normalizes sticker attachments', () => {
    const result = normalizeTelegramMessage(makeTelegramMessage({ sticker: { file_id: 'stk-1' } }));
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('sticker');
  });
});

// ─── Delivery Payload Builders ─────────────────────────────────

describe('telegram delivery payload builders', () => {
  it('builds a sendMessage payload from a canonical delivery', () => {
    const payload = buildTelegramSendPayload({
      id: 'd-1',
      channel: 'telegram',
      conversation: { channel: 'telegram', externalId: '42', type: 'direct' },
      content: {
        text: 'hi',
        inlineKeyboard: [[{ text: 'Approve', callbackData: 'approve:1' }]],
      },
      priority: 'normal',
    });
    expect(payload).toMatchObject({
      chat_id: '42',
      text: 'hi',
      reply_markup: { inline_keyboard: [[{ text: 'Approve', callback_data: 'approve:1' }]] },
    });
  });

  it('builds an editMessageText payload from a canonical delivery', () => {
    const payload = buildTelegramEditPayload({
      id: 'd-2',
      channel: 'telegram',
      conversation: { channel: 'telegram', externalId: '42', type: 'direct' },
      content: { text: 'updated' },
      editMessageId: '777',
      priority: 'normal',
    });
    expect(payload).toMatchObject({ chat_id: '42', message_id: '777', text: 'updated' });
  });
});

// ─── Boundary Confinement ──────────────────────────────────────

describe('telegram adapter boundary confinement', () => {
  it('does not re-export raw Telegram Bot API types', () => {
    const mod = adapterIndex as Record<string, unknown>;
    expect(mod.TelegramUpdate).toBeUndefined();
    expect(mod.TelegramChat).toBeUndefined();
    expect(mod.TelegramMessage).toBeUndefined();
    expect(mod.TelegramCallbackQuery).toBeUndefined();
    expect(mod.TelegramUser).toBeUndefined();
  });
});
