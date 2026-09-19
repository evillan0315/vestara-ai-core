/**
 * ROUTING-CONVERGENCE-001A — Activity Room complete-binding regression tests.
 *
 * Proves:
 *   1. triggerAssistantTurn propagates the COMPLETE live agent binding
 *      { agentId, provider, model } from a single AgentDefinition read —
 *      Developer {A,A} executes exactly A, Planner {B,B} exactly B.
 *   2. A partial binding for a non-assistant agent fails deterministically
 *      instead of silently falling through to the Assistant binding.
 *   3. The generic Assistant path still allows the canonical fallback
 *      (identity-only request governs genuinely model-less execution).
 */

import { describe, expect, it, vi } from 'vitest';
import { triggerAssistantTurn } from '../src/assistant-turn';
import type { AgentMessageActivity } from '../src/contracts';
import type { ActivityProjectionService } from '../src/service';

// ─── Stubs ───────────────────────────────────────────────────────

interface AgentDef {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
}

function humanRecord(agentId: string): AgentMessageActivity {
  return {
    id: 'activity:msg:human-1',
    sequence: 1,
    timestamp: new Date().toISOString(),
    actor: { type: 'human', id: 'user-1', displayName: 'User One' },
    kind: 'agent-message',
    agentId,
    messageKind: 'message',
    content: 'implement the thing',
    correlationId: 'corr-1',
    evidenceRefs: [],
  };
}

function harness(defs: Record<string, AgentDef>) {
  const sendMessage = vi.fn(async (_conversationId: string, content: string, options?: Record<string, unknown>) => ({
    message: { content },
    response: {
      content: 'done',
      provider: options?.provider as string | undefined,
      model: options?.model as string | undefined,
    },
    latency: 1,
  }));
  const createConversation = vi.fn(async (_userId: string, _options?: Record<string, unknown>) => ({ id: 'conv-1' }));
  const conversationService = { createConversation, sendMessage };
  const agentStorage = {
    getAgent: async (id: string): Promise<AgentDef | null> => defs[id] ?? null,
  };
  const appendActivity = vi.fn(async (record: { id: string }) => ({ ...record, id: 'appended-1' }));
  const service = { appendActivity } as unknown as ActivityProjectionService;
  return { conversationService, agentStorage, service, sendMessage, createConversation, appendActivity };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ROUTING-CONVERGENCE-001A: complete live agent binding', () => {
  it('Developer configured {Provider A, Model A} executes exactly A', async () => {
    const h = harness({
      'agent-developer': { id: 'agent-developer', name: 'Developer', provider: 'provider-a', model: 'model-a' },
    });

    const result = await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord('agent-developer'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('completed');
    expect(result.agentId).toBe('agent-developer');
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    const options = h.sendMessage.mock.calls[0][2] as Record<string, unknown>;
    expect(options.agentId).toBe('agent-developer');
    expect(options.provider).toBe('provider-a');
    expect(options.model).toBe('model-a');
    expect(JSON.stringify(options)).not.toContain('muse-spark');
  });

  it('Planner configured {Provider B, Model B} executes exactly B', async () => {
    const h = harness({
      'agent-planner': { id: 'agent-planner', name: 'Planner', provider: 'provider-b', model: 'model-b' },
    });

    const result = await triggerAssistantTurn({
      agentId: 'agent-planner',
      humanRecord: humanRecord('agent-planner'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('completed');
    const options = h.sendMessage.mock.calls[0][2] as Record<string, unknown>;
    expect(options).toMatchObject({ agentId: 'agent-planner', provider: 'provider-b', model: 'model-b' });
  });

  it('Assistant propagates its own complete binding (Telegram convergence anchor)', async () => {
    const h = harness({
      'agent-assistant': { id: 'agent-assistant', name: 'Assistant', provider: 'provider-a', model: 'model-a' },
    });

    const result = await triggerAssistantTurn({
      agentId: 'agent-assistant',
      humanRecord: humanRecord('agent-assistant'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('completed');
    const options = h.sendMessage.mock.calls[0][2] as Record<string, unknown>;
    expect(options).toMatchObject({ agentId: 'agent-assistant', provider: 'provider-a', model: 'model-a' });
  });
});

describe('ROUTING-CONVERGENCE-001A: no partial fall-through for non-assistant agents', () => {
  it('model-only Developer binding fails without executing', async () => {
    const h = harness({
      'agent-developer': { id: 'agent-developer', name: 'Developer', model: 'model-a' },
    });

    const result = await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord('agent-developer'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('failed');
    expect(result.failure).toContain('agent-developer');
    expect(result.failure).toContain('provider/model binding');
    expect(h.createConversation).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('unknown non-assistant agent fails without executing', async () => {
    const h = harness({});

    const result = await triggerAssistantTurn({
      agentId: 'agent-reviewer',
      humanRecord: humanRecord('agent-reviewer'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('failed');
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('provider-only Planner binding fails without executing', async () => {
    const h = harness({
      'agent-planner': { id: 'agent-planner', name: 'Planner', provider: 'provider-b' },
    });

    const result = await triggerAssistantTurn({
      agentId: 'agent-planner',
      humanRecord: humanRecord('agent-planner'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('failed');
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});

describe('ROUTING-CONVERGENCE-001A: generic Assistant fallback preserved', () => {
  it('assistant without a complete binding still executes (canonical fallback governs)', async () => {
    const h = harness({});

    const result = await triggerAssistantTurn({
      agentId: 'agent-assistant',
      humanRecord: humanRecord('agent-assistant'),
      service: h.service,
      conversationService: h.conversationService,
      agentStorage: h.agentStorage,
    });

    expect(result.status).toBe('completed');
    const options = h.sendMessage.mock.calls[0][2] as Record<string, unknown>;
    expect(options.agentId).toBe('agent-assistant');
    expect(options.provider).toBeUndefined();
    expect(options.model).toBeUndefined();
  });
});
