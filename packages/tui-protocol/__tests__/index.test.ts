import { describe, expect, it } from 'vitest';
import { isStreamEnvelope } from '../src/index.js';

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
});
