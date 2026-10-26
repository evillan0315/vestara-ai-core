import { describe, expect, it } from 'vitest';
import { isConversationChunk, isStreamEnvelope, TUI_PROTOCOL_VERSION } from '../src/index';

const envelope = {
  schemaVersion: 1,
  eventId: 'e1',
  sequence: 7,
  threadId: 't1',
  correlationId: 'c1',
  event: { type: 'activity.updated', activity: {} },
};

describe('TUI protocol contract', () => {
  it('pins the protocol version', () => {
    expect(TUI_PROTOCOL_VERSION).toBe(1);
  });

  it('validates stream envelopes structurally', () => {
    expect(isStreamEnvelope(envelope)).toBe(true);
    expect(isStreamEnvelope({ ...envelope, sequence: 1.5 })).toBe(false);
    expect(isStreamEnvelope({ ...envelope, schemaVersion: 2 })).toBe(false);
    expect(isStreamEnvelope(null)).toBe(false);
    expect(isConversationChunk({})).toBe(false);
  });
});
