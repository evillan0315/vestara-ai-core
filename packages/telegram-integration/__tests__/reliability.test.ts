/**
 * VES-TG-022: Reliability — tests
 */

import type { ChannelDelivery } from '@vestara/channel-types';
import { describe, expect, it } from 'vitest';
import {
  classifyDeliveryError,
  computeRetryDelayMs,
  TelegramDeliveryCoalescer,
  TokenBucketRateLimiter,
} from '../src/reliability';

describe('classifyDeliveryError', () => {
  it('classifies Telegram 429 as rate limited with server retry_after', () => {
    const failure = classifyDeliveryError({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: 5 },
    });
    expect(failure.kind).toBe('rate_limited');
    expect(failure.retryable).toBe(true);
    expect(failure.retryAfterMs).toBe(5000);
  });

  it('classifies 5xx as retryable server errors', () => {
    const failure = classifyDeliveryError({ ok: false, error_code: 502, description: 'Bad Gateway' });
    expect(failure.kind).toBe('server_error');
    expect(failure.retryable).toBe(true);
  });

  it('classifies 4xx as non-retryable client errors', () => {
    const failure = classifyDeliveryError({ ok: false, error_code: 400, description: 'Bad Request' });
    expect(failure.kind).toBe('client_error');
    expect(failure.retryable).toBe(false);
  });

  it('classifies network and timeout errors as retryable', () => {
    expect(classifyDeliveryError(new Error('ETIMEDOUT')).kind).toBe('timeout');
    expect(classifyDeliveryError(new Error('ECONNRESET')).kind).toBe('network');
    expect(classifyDeliveryError(new Error('fetch failed')).retryable).toBe(true);
  });
});

describe('computeRetryDelayMs', () => {
  it('grows exponentially and is bounded', () => {
    expect(computeRetryDelayMs(1, { baseDelayMs: 1000, maxDelayMs: 60000 })).toBe(1000);
    expect(computeRetryDelayMs(2, { baseDelayMs: 1000, maxDelayMs: 60000 })).toBe(2000);
    expect(computeRetryDelayMs(3, { baseDelayMs: 1000, maxDelayMs: 60000 })).toBe(4000);
    expect(computeRetryDelayMs(20, { baseDelayMs: 1000, maxDelayMs: 60000 })).toBe(60000);
  });

  it('honours a server-requested floor', () => {
    expect(computeRetryDelayMs(1, { baseDelayMs: 1000, maxDelayMs: 60000, retryAfterMs: 30000 })).toBe(30000);
  });
});

describe('TokenBucketRateLimiter', () => {
  it('consumes tokens then refuses until refill', () => {
    const limiter = new TokenBucketRateLimiter(2, 1, 0);
    expect(limiter.tryConsume(0).allowed).toBe(true);
    expect(limiter.tryConsume(0).allowed).toBe(true);
    const denied = limiter.tryConsume(0);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);
    expect(limiter.tryConsume(1000).allowed).toBe(true);
  });
});

function delivery(id: string): ChannelDelivery {
  return {
    id,
    channel: 'telegram',
    conversation: { channel: 'telegram', externalId: 'chat-1', type: 'direct' },
    content: { text: 'hello' },
    priority: 'normal',
  };
}

describe('TelegramDeliveryCoalescer', () => {
  it('sends the first delivery unchanged', () => {
    const coalescer = new TelegramDeliveryCoalescer();
    const first = coalescer.coalesce(delivery('d1'), 'execution:e1');
    expect(first.editMessageId).toBeUndefined();
  });

  it('edits the coalesced message for subsequent deliveries', () => {
    const coalescer = new TelegramDeliveryCoalescer();
    coalescer.register('execution:e1', 'msg-1');
    const next = coalescer.coalesce(delivery('d2'), 'execution:e1');
    expect(next.editMessageId).toBe('msg-1');
    expect(next.id).toBe('d2');
  });

  it('keeps keys isolated', () => {
    const coalescer = new TelegramDeliveryCoalescer();
    coalescer.register('execution:e1', 'msg-1');
    expect(coalescer.coalesce(delivery('d3'), 'execution:e2').editMessageId).toBeUndefined();
  });

  it('forgets cleared keys', () => {
    const coalescer = new TelegramDeliveryCoalescer();
    coalescer.register('execution:e1', 'msg-1');
    coalescer.clear('execution:e1');
    expect(coalescer.resolve('execution:e1')).toBeUndefined();
    expect(coalescer.size).toBe(0);
  });
});
