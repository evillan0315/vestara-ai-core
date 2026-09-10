import { describe, expect, it } from 'vitest';
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from '../src/telegram-types';
import {
  normalizeTelegramCallbackQuery,
  normalizeTelegramMessage,
  normalizeTelegramUpdate,
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
