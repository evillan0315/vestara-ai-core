/**
 * ROUTING-CONVERGENCE-001C S3 — projection honesty regression tests.
 *
 * Proves:
 *   1. Lifecycle Started/Completed rows are system-authored runtime
 *      telemetry (actor conversation-runtime), never agent-authored —
 *      one Developer execution cannot appear as Assistant + Developer.
 *   2. The Completed lifecycle row carries status/usage only, never response
 *      content — the full reply keeps exactly one conversational authorship
 *      projection (the turn-owner mirror path).
 *   3. Provenance (conversationId/responseMessageId) survives for navigation.
 *   4. fromAgentLifecycle defaults are unchanged for genuine agent rows.
 */

import { describe, expect, it } from 'vitest';
import { fromAgentLifecycle } from '../src/m9-adapter';
import { M9IngestionBridge } from '../src/m9-ingestion-bridge';

// ─── Harness ─────────────────────────────────────────────────────

interface CapturedHandler {
  pattern: string;
  handler: (event: Record<string, unknown>) => Promise<void>;
}

function harness() {
  const handlers: CapturedHandler[] = [];
  const appended: Array<Record<string, unknown>> = [];
  const eventBus = {
    subscribe: (pattern: string, handler: (event: Record<string, unknown>) => Promise<void>) => {
      handlers.push({ pattern, handler });
      return () => undefined;
    },
  };
  const store = {
    append: async (event: Record<string, unknown>) => {
      appended.push(event);
      return { ...event, sequenceNumber: appended.length };
    },
  };
  const bridge = new M9IngestionBridge({ store: store as never, eventBus: eventBus as never });
  bridge.start();
  const fire = async (pattern: string, event: Record<string, unknown>) => {
    const entry = handlers.find((h) => h.pattern === pattern);
    if (!entry) throw new Error(`no subscription for ${pattern}`);
    await entry.handler(event);
  };
  return { appended, fire };
}

function busEvent(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  return { id: `evt-${Math.random().toString(36).slice(2)}`, type, payload, metadata: {} };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ROUTING-CONVERGENCE-001C S3: lifecycle rows are system-authored', () => {
  it('provider.request.started projects a system actor, never vestara/Assistant', async () => {
    const h = harness();
    await h.fire(
      'conversation:provider.request.started',
      busEvent('conversation:provider.request.started', { conversationId: 'conv-1', model: 'model-a' }),
    );

    expect(h.appended).toHaveLength(1);
    const row = h.appended[0];
    const actor = row.actor as Record<string, unknown>;
    expect(actor.type).toBe('system');
    expect(actor.id).toBe('conversation-runtime');
    expect(JSON.stringify(row)).not.toContain('vestara');
    expect(JSON.stringify(row)).not.toContain('Vestara');
    expect(row.type).toBe('agent.started');
  });

  it('response.completed projects status-only system telemetry with provenance', async () => {
    const h = harness();
    await h.fire(
      'conversation:response.completed',
      busEvent('conversation:response.completed', {
        conversationId: 'conv-1',
        messageId: 'msg-9',
        contentPreview: 'Since I am the assistant, here is the secret plan…',
        tokens: 42,
      }),
    );

    expect(h.appended).toHaveLength(1);
    const row = h.appended[0];
    const actor = row.actor as Record<string, unknown>;
    expect(actor.type).toBe('system');
    expect(actor.id).toBe('conversation-runtime');
    // Lifecycle telemetry: status + usage only — never response content, so
    // this row cannot masquerade as a second agent-authored reply.
    const payload = row.payload as { message: string; data: Record<string, unknown> };
    expect(payload.message).toBe('Completed (42 tokens)');
    expect(payload.message).not.toContain('secret plan');
    expect(JSON.stringify(row)).not.toContain('secret plan');
    // Provenance survives for navigation to the authoritative projection.
    expect(payload.data.conversationId).toBe('conv-1');
    expect(payload.data.responseMessageId).toBe('msg-9');
  });

  it('one Developer execution yields no agent-authored Assistant row', async () => {
    const h = harness();
    // The two bridge emissions of a single turn:
    await h.fire(
      'conversation:provider.request.started',
      busEvent('conversation:provider.request.started', { conversationId: 'conv-1', model: 'model-a' }),
    );
    await h.fire(
      'conversation:response.completed',
      busEvent('conversation:response.completed', {
        conversationId: 'conv-1',
        messageId: 'msg-9',
        contentPreview: 'implemented the thing',
        tokens: 7,
      }),
    );

    expect(h.appended).toHaveLength(2);
    for (const row of h.appended) {
      const actor = row.actor as Record<string, unknown>;
      expect(actor.type).not.toBe('agent');
      expect(actor.displayName).not.toBe('Assistant');
      expect(actor.displayName).not.toBe('Vestara');
    }
    // The turn-owner mirror path (not the bridge) owns conversational
    // authorship — the bridge contributes zero agent-authored rows.
    const agentAuthored = h.appended.filter((row) => (row.actor as Record<string, unknown>).type === 'agent');
    expect(agentAuthored).toHaveLength(0);
  });
});

describe('ROUTING-CONVERGENCE-001C S3: fromAgentLifecycle compatibility', () => {
  it('defaults to agent authorship for genuine agent rows', () => {
    const event = fromAgentLifecycle({
      agentId: 'agent-developer',
      displayName: 'Developer',
      lifecycleType: 'completed',
      message: 'done',
    });
    expect(event.actor.type).toBe('agent');
    expect(event.actor.id).toBe('agent-developer');
  });

  it('supports explicit system authorship for runtime lifecycle', () => {
    const event = fromAgentLifecycle({
      agentId: 'conversation-runtime',
      displayName: 'Conversation Runtime',
      actorType: 'system',
      lifecycleType: 'started',
      message: 'Started work',
    });
    expect(event.actor.type).toBe('system');
    expect(event.type).toBe('agent.started');
  });
});
