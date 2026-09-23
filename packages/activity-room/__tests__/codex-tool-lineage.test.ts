import { describe, expect, it } from 'vitest';
import { fromToolEvent } from '../src/m9-adapter';

describe('AR-TOOL-STATUS-002 Codex tool lineage', () => {
  it('preserves available conversation, execution, and runtime session lineage', () => {
    const event = fromToolEvent({
      lifecycleType: 'failed',
      callID: 'codex:thread-a:item_18',
      toolName: 'bash',
      agentId: 'vestara-assistant',
      conversationId: 'conv-codex',
      correlationId: 'conv-codex',
      executionId: 'exec-codex' as never,
      sessionId: 'codex:thread-a' as never,
    });

    expect(event).toMatchObject({
      eventId: 'tool.failed:codex:thread-a:item_18',
      executionId: 'exec-codex',
      runtimeSessionBindingId: 'codex:thread-a',
      payload: {
        data: { callID: 'codex:thread-a:item_18', conversationId: 'conv-codex', correlationId: 'conv-codex' },
      },
    });
  });

  it('does not fabricate absent lineage', () => {
    const event = fromToolEvent({ lifecycleType: 'succeeded', callID: 'call-hex', toolName: 'bash' });
    expect(event.executionId).toBeUndefined();
    expect(event.runtimeSessionBindingId).toBeUndefined();
    expect(event.payload.data).not.toHaveProperty('conversationId');
  });

  it('retains the same scoped operation identity for a successful Codex result', () => {
    const event = fromToolEvent({
      lifecycleType: 'succeeded',
      callID: 'codex:thread-b:item_18',
      toolName: 'bash',
      conversationId: 'conv-codex',
      sessionId: 'codex:thread-b' as never,
    });

    expect(event).toMatchObject({
      type: 'tool.succeeded',
      eventId: 'tool.succeeded:codex:thread-b:item_18',
      runtimeSessionBindingId: 'codex:thread-b',
      payload: { data: { callID: 'codex:thread-b:item_18', conversationId: 'conv-codex' } },
    });
  });
});
