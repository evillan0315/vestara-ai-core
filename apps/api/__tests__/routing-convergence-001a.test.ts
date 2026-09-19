/**
 * ROUTING-CONVERGENCE-001A — API-level convergence regression tests.
 *
 * Proves:
 *   1. Telegram generic Assistant uses the canonical agent-assistant binding
 *      (live AgentDefinition read — resolveTelegramAgentBinding).
 *   2. Activity Room and Telegram targeting the same canonical Assistant
 *      converge on the same provider/model.
 *   3. Reusing the same OpenCode/Vestara conversation does not prevent a
 *      per-turn binding change (asserted at the prompt_async body level).
 *   4. Invalid/unavailable explicit bindings fail deterministically instead
 *      of silently switching to Muse.
 *   5. Explicit governed browser provider/model overrides remain functional.
 */

import type { CompletionRequest } from '@vestara/shared';
import { describe, expect, it, vi } from 'vitest';
import { AssistantBindingError, createAssistantBindingResolver } from '../src/assistant-binding-resolver';
import { createAssistantOpenCodeExecutor } from '../src/assistant-opencode-adapter';
import { resolveTelegramAgentBinding } from '../src/routes/telegram';

// ─── Stubs ───────────────────────────────────────────────────────

function agentStore(defs: Record<string, { provider?: string; model?: string }>) {
  return {
    getAgent: async (id: string) => {
      const def = defs[id];
      return def ? { id, ...def } : null;
    },
  };
}

function discoveryClient(providers: Array<{ id: string; models?: readonly string[] }>) {
  return {
    listProviders: async () => providers,
  };
}

function userRequest(model?: string, provider?: string): CompletionRequest {
  return {
    model: model ?? '',
    messages: [{ role: 'user' as const, content: 'hello' }],
    temperature: 0.7,
    maxTokens: 64,
    conversationId: 'conv-1',
    ...(provider ? { provider } : {}),
  } as CompletionRequest;
}

// ─── resolveTelegramAgentBinding ─────────────────────────────────

describe('ROUTING-CONVERGENCE-001A: Telegram canonical binding resolution', () => {
  it('uses the live agent-assistant binding (Provider A / Model A)', async () => {
    const binding = await resolveTelegramAgentBinding(
      agentStore({ 'agent-assistant': { provider: 'provider-a', model: 'model-a' } }) as never,
    );

    expect(binding).toEqual({ agentId: 'agent-assistant', provider: 'provider-a', model: 'model-a' });
    expect(JSON.stringify(binding)).not.toContain('muse-spark');
  });

  it('picks up a binding change with no restart (per-turn read)', async () => {
    const defs: Record<string, { provider?: string; model?: string }> = {
      'agent-assistant': { provider: 'provider-a', model: 'model-a' },
    };
    const first = await resolveTelegramAgentBinding(agentStore(defs) as never);
    defs['agent-assistant'] = { provider: 'provider-b', model: 'model-b' };
    const second = await resolveTelegramAgentBinding(agentStore(defs) as never);

    expect(first).toEqual({ agentId: 'agent-assistant', provider: 'provider-a', model: 'model-a' });
    expect(second).toEqual({ agentId: 'agent-assistant', provider: 'provider-b', model: 'model-b' });
  });

  it('falls back to identity-only when the definition is missing or incomplete', async () => {
    const missing = await resolveTelegramAgentBinding(agentStore({}) as never);
    expect(missing).toEqual({ agentId: 'agent-assistant' });

    const partial = await resolveTelegramAgentBinding(agentStore({ 'agent-assistant': { model: 'model-a' } }) as never);
    expect(partial).toEqual({ agentId: 'agent-assistant' });
  });

  it('falls back to identity-only when storage throws (canonical fallback governs)', async () => {
    const throwing = {
      getAgent: async () => {
        throw new Error('db unavailable');
      },
    };
    const binding = await resolveTelegramAgentBinding(throwing as never);
    expect(binding).toEqual({ agentId: 'agent-assistant' });
  });

  it('converges with the Activity Room triple for the same canonical Assistant', async () => {
    // packages/activity-room assistant-turn-binding.test.ts asserts the AR
    // side sends { agentId, provider, model } = assistant def values.
    const def = { provider: 'provider-a', model: 'model-a' };
    const binding = await resolveTelegramAgentBinding(
      agentStore({ 'agent-assistant': def }) as never,
      'agent-assistant',
    );
    expect(binding).toMatchObject({ agentId: 'agent-assistant', ...def });
  });
});

// ─── prompt_async-level binding ──────────────────────────────────

describe('ROUTING-CONVERGENCE-001A: binding reaches prompt_async', () => {
  function stubClient(sessionId: string, sent: Array<{ sessionId: string; body: Record<string, unknown> }>) {
    return {
      createSession: async () => ({ id: `${sessionId}-fresh` }),
      getSession: async (id: string) => ({ id }),
      sendMessageAsync: async (sid: string, body: Record<string, unknown>) => {
        sent.push({ sessionId: sid, body });
      },
      openEventStream: async function* () {
        yield { type: 'session.status', payload: { sessionID: sessionId, status: { type: 'idle' } } };
      },
      abortSession: async () => true,
    };
  }

  function executorWith(
    sent: Array<{ sessionId: string; body: Record<string, unknown> }>,
    resolveProviderModel: (model?: string, provider?: string) => Promise<{ providerID: string; modelID: string }>,
  ) {
    // Fixed session across turns: reuse must not pin the binding.
    const registry = {
      set: () => undefined,
      acquire: async () => ({
        session: { sessionId: 'oc-reused', repositoryDir: '/repo', createdAt: new Date().toISOString() },
        created: false,
      }),
    };
    return createAssistantOpenCodeExecutor({
      client: stubClient('oc-reused', sent) as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
      model: { providerID: 'provider-a', modelID: 'model-a' },
      resolveProviderModel,
      sessionRegistry: registry as never,
    });
  }

  it('session reuse does not prevent a per-turn binding change', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    let current = { providerID: 'provider-a', modelID: 'model-a' };
    const executor = executorWith(sent, async () => ({ ...current }));

    await executor.complete(userRequest('model-a', 'provider-a'));
    current = { providerID: 'provider-b', modelID: 'model-b' };
    const second = await executor.complete(userRequest('model-b', 'provider-b'));

    expect(sent).toHaveLength(2);
    // Same reused OpenCode session both turns …
    expect(sent[0].sessionId).toBe('oc-reused');
    expect(sent[1].sessionId).toBe('oc-reused');
    // … but each turn carries its own resolved binding.
    // (prompt_async body shape is lowercase { providerId, modelId } —
    // adapter sendMessageAsync mapping, distinct from resolver casing.)
    expect(sent[0].body.model).toEqual({ providerId: 'provider-a', modelId: 'model-a' });
    expect(sent[1].body.model).toEqual({ providerId: 'provider-b', modelId: 'model-b' });
    expect(second.provider).toBe('provider-b');
    expect(second.model).toBe('model-b');
  });

  it('production wiring (resolver + fallback) resolves explicit bindings to prompt_async', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const resolver = createAssistantBindingResolver(
      discoveryClient([
        { id: 'provider-a', models: ['model-a'] },
        { id: 'opencode-go', models: ['muse-spark-1.3-contributor'] },
      ]) as never,
      { providerID: 'provider-a', modelID: 'model-a' },
    );
    const executor = executorWith(sent, (model, provider) =>
      resolver.resolve({ providerId: provider, modelId: model }),
    );

    await executor.complete(userRequest('model-a', 'provider-a'));

    expect(sent).toHaveLength(1);
    expect(sent[0].body.model).toEqual({ providerId: 'provider-a', modelId: 'model-a' });
  });
});

// ─── Deterministic failure ───────────────────────────────────────

describe('ROUTING-CONVERGENCE-001A: governed binding failures', () => {
  it('unavailable explicit binding throws instead of silently switching to Muse', async () => {
    const resolver = createAssistantBindingResolver(
      discoveryClient([{ id: 'provider-a', models: ['model-a'] }]) as never,
      { providerID: 'provider-a', modelID: 'model-a' },
    );

    await expect(resolver.resolve({ providerId: 'provider-a', modelId: 'model-gone' })).rejects.toBeInstanceOf(
      AssistantBindingError,
    );
    await expect(resolver.resolve({ providerId: 'provider-gone', modelId: 'model-a' })).rejects.toBeInstanceOf(
      AssistantBindingError,
    );
  });

  it('explicit governed browser override still resolves when valid', async () => {
    const resolver = createAssistantBindingResolver(
      discoveryClient([{ id: 'provider-b', models: ['model-b'] }]) as never,
      { providerID: 'provider-a', modelID: 'model-a' },
    );

    const binding = await resolver.resolve({ providerId: 'provider-b', modelId: 'model-b' });
    expect(binding).toEqual({ providerID: 'provider-b', modelID: 'model-b' });
  });

  it('genuinely model-less execution still uses the canonical fallback', async () => {
    const resolver = createAssistantBindingResolver(discoveryClient([]) as never, {
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    // No discovery call, no validation — the configured default governs.
    const binding = await resolver.resolve(undefined);
    expect(binding).toEqual({ providerID: 'provider-a', modelID: 'model-a' });
  });

  it('resolver is spyable (vi) at the discovery boundary', async () => {
    const listProviders = vi.fn(async () => [{ id: 'provider-a', models: ['model-a'] }]);
    const resolver = createAssistantBindingResolver({ listProviders } as never, undefined);

    await expect(resolver.resolve({ providerId: 'provider-a', modelId: 'model-a' })).resolves.toEqual({
      providerID: 'provider-a',
      modelID: 'model-a',
    });
    expect(listProviders).toHaveBeenCalled();
  });
});
