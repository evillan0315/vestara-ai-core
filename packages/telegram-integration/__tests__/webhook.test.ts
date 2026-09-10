import { afterEach, describe, expect, it } from 'vitest';
import { TelegramWebhookHandler } from '../src/webhook';

// ─── Helpers ───────────────────────────────────────────────────

function makeTelegramUpdate(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    update_id: 1,
    message: {
      message_id: 100,
      from: { id: 999, first_name: 'Alice', username: 'alice' },
      chat: { id: 100, type: 'private' },
      text: 'Hello',
      date: 1700000000,
    },
    ...overrides,
  });
}

// ─── Webhook Handler ───────────────────────────────────────────

describe('TelegramWebhookHandler', () => {
  let handler: TelegramWebhookHandler;

  afterEach(() => {
    handler?.destroy();
  });

  describe('handleWebhook', () => {
    it('processes a valid message update', async () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      const body = makeTelegramUpdate();
      const result = await handler.handleWebhook(body);

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message!.text).toBe('Hello');
      expect(result.event).toBeDefined();
      expect(result.event!.type).toBe('message.received');
    });

    it('processes a valid callback_query update', async () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      const body = makeTelegramUpdate({
        message: undefined,
        callback_query: {
          id: 'cb-1',
          from: { id: 999, first_name: 'Alice' },
          message: {
            message_id: 100,
            chat: { id: 100, type: 'private' },
            date: 1700000000,
          },
          data: 'confirm',
        },
      });
      const result = await handler.handleWebhook(body);

      expect(result.processed).toBe(true);
      expect(result.action).toBeDefined();
      expect(result.action!.callbackData).toBe('confirm');
      expect(result.event!.type).toBe('action.received');
    });

    it('rejects invalid JSON', async () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      const result = await handler.handleWebhook('not-json');

      expect(result.processed).toBe(false);
      expect(result.error).toBe('Invalid JSON');
    });

    it('detects duplicate updates', async () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      const body = makeTelegramUpdate({ update_id: 42 });

      const first = await handler.handleWebhook(body);
      const second = await handler.handleWebhook(body);

      expect(first.processed).toBe(true);
      expect(first.duplicate).toBe(false);
      expect(second.processed).toBe(false);
      expect(second.duplicate).toBe(true);
    });

    it('processes unknown update types without error', async () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      const body = JSON.stringify({ update_id: 99 });
      const result = await handler.handleWebhook(body);

      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
    });
  });

  describe('webhook secret validation', () => {
    it('accepts valid secret token', async () => {
      handler = new TelegramWebhookHandler({
        botToken: 'test-token',
        webhookSecret: 'my-secret',
      });
      const body = makeTelegramUpdate();
      const result = await handler.handleWebhook(body, {
        'x-telegram-bot-api-secret-token': 'my-secret',
      });

      expect(result.processed).toBe(true);
    });

    it('rejects invalid secret token', async () => {
      handler = new TelegramWebhookHandler({
        botToken: 'test-token',
        webhookSecret: 'my-secret',
      });
      const body = makeTelegramUpdate();
      const result = await handler.handleWebhook(body, {
        'x-telegram-bot-api-secret-token': 'wrong-secret',
      });

      expect(result.processed).toBe(false);
      expect(result.error).toBe('Invalid webhook secret');
    });

    it('rejects missing secret token', async () => {
      handler = new TelegramWebhookHandler({
        botToken: 'test-token',
        webhookSecret: 'my-secret',
      });
      const body = makeTelegramUpdate();
      const result = await handler.handleWebhook(body);

      expect(result.processed).toBe(false);
      expect(result.error).toBe('Invalid webhook secret');
    });

    it('accepts requests without secret when none configured', async () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      const body = makeTelegramUpdate();
      const result = await handler.handleWebhook(body);

      expect(result.processed).toBe(true);
    });
  });

  describe('deduplication cache', () => {
    it('evicts oldest entry when cache is full', async () => {
      handler = new TelegramWebhookHandler({
        botToken: 'test-token',
        maxDedupSize: 3,
      });

      // Fill cache to capacity
      await handler.handleWebhook(makeTelegramUpdate({ update_id: 1 }));
      await handler.handleWebhook(makeTelegramUpdate({ update_id: 2 }));
      await handler.handleWebhook(makeTelegramUpdate({ update_id: 3 }));

      // This should evict update_id 1
      await handler.handleWebhook(makeTelegramUpdate({ update_id: 4 }));

      // update_id 1 should now be processable (evicted from cache)
      const result = await handler.handleWebhook(makeTelegramUpdate({ update_id: 1 }));
      expect(result.processed).toBe(true);
      expect(result.duplicate).toBe(false);
    });
  });

  describe('destroy', () => {
    it('cleans up resources', () => {
      handler = new TelegramWebhookHandler({ botToken: 'test-token' });
      // Should not throw
      handler.destroy();
      handler.destroy(); // double destroy should be safe
    });
  });
});
