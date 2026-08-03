import { describe, expect, it } from 'vitest';
import { isConversationChunk, isStreamEnvelope } from '../src/index.js';

describe('TUI protocol', () => {
  it('validates replay envelopes', () => {
    expect(
      isStreamEnvelope({
        schemaVersion: 1,
        eventId: 'e',
        sequence: 1,
        timestamp: 'now',
        threadId: 't',
        correlationId: 'c',
        event: { type: 'thread.updated', thread: {} },
      }),
    ).toBe(true);
    expect(isStreamEnvelope({ schemaVersion: 2 })).toBe(false);
  });

  it('validates conversation chunks', () => {
    expect(
      isConversationChunk({
        schemaVersion: 1,
        conversationId: 'conv-1',
        messageId: 'msg-1',
        sequence: 0,
        timestamp: 'now',
        event: { type: 'delta', content: 'hi' },
      }),
    ).toBe(true);
    expect(isConversationChunk({ schemaVersion: 1, conversationId: 'conv-1' })).toBe(false);
  });
});
