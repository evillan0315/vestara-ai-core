/**
 * VES-TG-024: Telemetry — tests
 */

import { describe, expect, it } from 'vitest';
import {
  createCorrelationContext,
  redactTelemetryData,
  TELEGRAM_TELEMETRY_EVENTS,
  TelegramTelemetry,
  withCorrelation,
} from '../src/telemetry';

describe('correlation context', () => {
  it('generates a correlation id when absent and keeps optional fields', () => {
    const context = createCorrelationContext({ principalId: 'p-1', channel: 'telegram' });
    expect(context.correlationId.length).toBeGreaterThan(0);
    expect(context.principalId).toBe('p-1');
    expect(context.workspaceId).toBeUndefined();
  });

  it('preserves the trace id in child contexts', () => {
    const parent = createCorrelationContext({ correlationId: 'trace-1' });
    const child = withCorrelation(parent, { executionId: 'exec-1' });
    expect(child.correlationId).toBe('trace-1');
    expect(child.executionId).toBe('exec-1');
  });
});

describe('redactTelemetryData', () => {
  it('drops token- and secret-shaped keys', () => {
    const redacted = redactTelemetryData({
      botToken: 'abc',
      webhookSecret: 'xyz',
      apiKey: 'k',
      nested: { authorization: 'Bearer x', safe: 'ok' },
    });
    expect(redacted?.botToken).toBe('[redacted]');
    expect(redacted?.webhookSecret).toBe('[redacted]');
    expect(redacted?.apiKey).toBe('[redacted]');
    const nested = redacted?.nested as Record<string, unknown>;
    expect(nested.authorization).toBe('[redacted]');
    expect(nested.safe).toBe('ok');
  });

  it('summarizes arrays instead of leaking contents', () => {
    const redacted = redactTelemetryData({ items: [1, 2, 3] });
    expect(redacted?.items).toBe(3);
  });

  it('returns undefined for non-objects', () => {
    expect(redactTelemetryData('text')).toBeUndefined();
    expect(redactTelemetryData(null)).toBeUndefined();
  });
});

describe('TelegramTelemetry', () => {
  it('exposes the canonical event names', () => {
    expect(TELEGRAM_TELEMETRY_EVENTS).toContain('telegram.webhook.received');
    expect(TELEGRAM_TELEMETRY_EVENTS).toContain('telegram.delivery.failed');
    expect(TELEGRAM_TELEMETRY_EVENTS).toContain('channel.delivery.completed');
  });

  it('records events with injected clock and redacted data', () => {
    const telemetry = new TelegramTelemetry({ now: () => new Date('2026-09-16T10:00:00.000Z') });
    telemetry.emit('telegram.delivery.sent', createCorrelationContext({ channel: 'telegram' }), {
      token: 'should-not-appear',
      chatId: 'chat-1',
    });

    const records = telemetry.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].timestamp).toBe('2026-09-16T10:00:00.000Z');
    expect(records[0].data?.token).toBe('[redacted]');
    expect(records[0].data?.chatId).toBe('chat-1');
  });

  it('survives a throwing sink', () => {
    const telemetry = new TelegramTelemetry({
      sink: {
        emit: () => {
          throw new Error('sink down');
        },
      },
    });
    expect(() => telemetry.emit('telegram.webhook.received', createCorrelationContext())).not.toThrow();
  });

  it('bounds the in-memory buffer', () => {
    const telemetry = new TelegramTelemetry({ bufferLimit: 2 });
    for (let i = 0; i < 5; i++) telemetry.emit('telegram.webhook.received', createCorrelationContext());
    expect(telemetry.getRecords()).toHaveLength(2);
    telemetry.clear();
    expect(telemetry.getRecords()).toHaveLength(0);
  });
});
