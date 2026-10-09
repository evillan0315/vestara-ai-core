import { describe, expect, it } from 'vitest';
import { TelegramWebhookHandler } from '../src/webhook';

const update = JSON.stringify({
  update_id: 901,
  message: {
    message_id: 12,
    date: 1_700_000_000,
    text: 'hello',
    from: { id: 44, first_name: 'Telegram User' },
    chat: { id: 55, type: 'private' },
  },
});

describe('Telegram webhook authentication', () => {
  it('accepts Telegram secret-token authentication without a Vestara bearer token', async () => {
    const handler = new TelegramWebhookHandler({ botToken: 'test-bot-token', webhookSecret: 'telegram-secret' });
    try {
      await expect(
        handler.handleWebhook(update, { 'x-telegram-bot-api-secret-token': 'telegram-secret' }),
      ).resolves.toMatchObject({ processed: true, duplicate: false });
    } finally {
      handler.destroy();
    }
  });

  it('rejects webhook requests with an invalid Telegram secret', async () => {
    const handler = new TelegramWebhookHandler({ botToken: 'test-bot-token', webhookSecret: 'telegram-secret' });
    try {
      await expect(
        handler.handleWebhook(update, { 'x-telegram-bot-api-secret-token': 'wrong-secret' }),
      ).resolves.toEqual(
        expect.objectContaining({ processed: false, duplicate: false, error: 'Invalid webhook secret' }),
      );
    } finally {
      handler.destroy();
    }
  });
});
