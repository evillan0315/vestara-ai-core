/**
 * ROUTING-CONVERGENCE-001C — Agent persona & capability-policy regression tests.
 *
 * Proves at the OpenCode request boundary:
 *   1. Every supported turn-capable agent resolves its canonical runtime
 *      agent (assistant→vestara-assistant, developer→vestara-developer,
 *      planner→vestara-planner, reviewer→vestara-reviewer, …) from the live
 *      AgentDefinition — no parallel map (uses real CANONICAL_AGENTS).
 *   2. Unknown/missing runtime persona fails closed and never executes as
 *      vestara-assistant (no session, no prompt_async).
 *   3. Developer retains its 001A provider/model while using vestara-developer
 *      (identity and binding proven independently).
 *   4. Developer receives the Developer tool/capability policy, not the
 *      Assistant policy (derived from declared grants, same enforcement
 *      machinery — unknown tools still denied).
 *   5. Telegram generic Assistant still resolves agent-assistant →
 *      vestara-assistant with its 001A canonical provider/model.
 */

import type { CompletionRequest } from '@vestara/shared';
import { type AgentDefinition, type AgentStorage, CANONICAL_AGENTS } from '@vestara/workspace';
import { describe, expect, it, vi } from 'vitest';
import { resolveConversationPersona } from '../src/agent-persona-resolver';
import { buildToolsMap, createPolicyForAgent, evaluatePermission } from '../src/assistant-capability-policy';
import { AgentPersonaError, createAssistantOpenCodeExecutor } from '../src/assistant-opencode-adapter';
import { resolveTelegramAgentBinding } from '../src/routes/telegram';

// ─── Stubs ───────────────────────────────────────────────────────

function agentStore(defs: Record<string, Partial<AgentDefinition>>): AgentStorage {
  return {
    getAgent: async (id: string) => {
      const def = defs[id];
      return def ? ({ id, ...def } as AgentDefinition) : null;
    },
  } as unknown as AgentStorage;
}

function canonicalStore(): AgentStorage {
  const defs: Record<string, Partial<AgentDefinition>> = {};
  for (const agent of CANONICAL_AGENTS) defs[agent.id] = agent;
  return agentStore(defs);
}

const TURN_CAPABLE: Readonly<Record<string, string>> = {
  'agent-assistant': 'vestara-assistant',
  'agent-context': 'vestara-context',
  'agent-planner': 'vestara-planner',
  'agent-developer': 'vestara-developer',
  'agent-reviewer': 'vestara-reviewer',
  'agent-verifier': 'vestara-verifier',
};

function userRequest(agentId?: string, model = 'model-a', provider = 'provider-a'): CompletionRequest {
  return {
    model,
    messages: [{ role: 'user' as const, content: 'hello' }],
    temperature: 0.7,
    maxTokens: 64,
    conversationId: 'conv-1',
    provider,
    ...(agentId ? { agentId } : {}),
  } as CompletionRequest;
}

function stubClient(
  sessionId: string,
  sent: Array<{ sessionId: string; body: Record<string, unknown> }>,
  calls: { createSession: number },
) {
  return {
    createSession: async () => {
      calls.createSession += 1;
      return { id: `${sessionId}-fresh` };
    },
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

// ─── S1: canonical persona resolution ────────────────────────────

describe('ROUTING-CONVERGENCE-001C S1: canonical runtime-agent mapping', () => {
  it.each(Object.entries(TURN_CAPABLE))('%s resolves %s from the live definition', async (agentId, runtimeAgent) => {
    const persona = await resolveConversationPersona(canonicalStore(), '/repo', agentId);
    expect(persona.runtimeAgent).toBe(runtimeAgent);
    expect(persona.capabilityPolicy).toBeDefined();
  });

  it('generic execution (no agentId) explicitly resolves vestara-assistant', async () => {
    const persona = await resolveConversationPersona(canonicalStore(), '/repo', undefined);
    expect(persona.runtimeAgent).toBe('vestara-assistant');
  });

  it('carries no provider/model authority (identity only)', async () => {
    const persona = await resolveConversationPersona(canonicalStore(), '/repo', 'agent-developer');
    expect('provider' in persona).toBe(false);
    expect('model' in persona).toBe(false);
  });
});

describe('ROUTING-CONVERGENCE-001C S1: fail-closed persona', () => {
  it('unknown non-assistant agent rejects (never substitutes vestara-assistant)', async () => {
    await expect(resolveConversationPersona(agentStore({}), '/repo', 'agent-developer')).rejects.toBeInstanceOf(
      AgentPersonaError,
    );
  });

  it('definition without runtimeAgent/grants rejects', async () => {
    const store = agentStore({ 'agent-planner': { name: 'Planner', provider: 'p', model: 'm' } });
    await expect(resolveConversationPersona(store, '/repo', 'agent-planner')).rejects.toBeInstanceOf(AgentPersonaError);
  });

  it('unreadable store rejects for targeted agents, defaults for generic assistant', async () => {
    const throwing = {
      getAgent: async () => {
        throw new Error('db unavailable');
      },
    } as unknown as AgentStorage;
    await expect(resolveConversationPersona(throwing, '/repo', 'agent-developer')).rejects.toBeInstanceOf(
      AgentPersonaError,
    );
    const generic = await resolveConversationPersona(throwing, '/repo', undefined);
    expect(generic.runtimeAgent).toBe('vestara-assistant');
  });
});

// ─── S1+S4: prompt_async boundary ────────────────────────────────

describe('ROUTING-CONVERGENCE-001C S1+S4: prompt_async.agent boundary', () => {
  function executorWithPersona(
    sent: Array<{ sessionId: string; body: Record<string, unknown> }>,
    calls: { createSession: number },
    logs: Array<{ message: string; context?: Record<string, unknown> }>,
  ) {
    const registry = {
      set: () => undefined,
      acquire: async () => ({
        session: { sessionId: 'oc-reused', repositoryDir: '/repo', createdAt: new Date().toISOString() },
        created: false,
      }),
    };
    return createAssistantOpenCodeExecutor({
      client: stubClient('oc-reused', sent, calls) as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
      resolveAgentPersona: (agentId) => resolveConversationPersona(canonicalStore(), '/repo', agentId),
      // Production wires the AssistantBindingResolver here; the stub echoes
      // a complete explicit binding (validation itself is covered in 001A).
      resolveProviderModel: async (model, provider) =>
        model && provider ? { providerID: provider, modelID: model } : undefined,
      sessionRegistry: registry as never,
      logger: {
        info: (message, context) => {
          logs.push({ message, context });
        },
        warn: () => undefined,
      },
    });
  }

  it.each(Object.entries(TURN_CAPABLE))('prompt_async.agent = %s for %s', async (agentId, runtimeAgent) => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const calls = { createSession: 0 };
    const executor = executorWithPersona(sent, calls, []);
    await executor.complete(userRequest(agentId));
    expect(sent).toHaveLength(1);
    expect(sent[0].body.agent).toBe(runtimeAgent);
  });

  it('persona rejection fails before any session or message exists', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const calls = { createSession: 0 };
    const registry = {
      set: () => undefined,
      acquire: async () => {
        throw new Error('must not acquire when persona fails');
      },
    };
    const executor = createAssistantOpenCodeExecutor({
      client: stubClient('oc-reused', sent, calls) as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
      resolveAgentPersona: () => Promise.reject(new AgentPersonaError('Unknown target agent agent-ghost')),
      sessionRegistry: registry as never,
    });

    await expect(executor.complete(userRequest('agent-ghost'))).rejects.toBeInstanceOf(AgentPersonaError);
    expect(sent).toHaveLength(0);
    expect(calls.createSession).toBe(0);
  });

  it('resolution + turn log carry requestedAgentId and runtimeAgent', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const calls = { createSession: 0 };
    const logs: Array<{ message: string; context?: Record<string, unknown> }> = [];
    const executor = executorWithPersona(sent, calls, logs);

    const result = await executor.complete(userRequest('agent-developer'));
    expect(result.resolution?.requestedAgentId).toBe('agent-developer');
    expect(result.resolution?.runtimeAgent).toBe('vestara-developer');
    const started = logs.find((l) => l.message === 'assistant.turn.started');
    expect(started?.context?.requestedAgent).toBe('agent-developer');
    expect(started?.context?.runtimeAgent).toBe('vestara-developer');
  });

  it('Developer keeps its 001A provider/model binding while using vestara-developer', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const calls = { createSession: 0 };
    const logs: Array<{ message: string; context?: Record<string, unknown> }> = [];
    const executor = executorWithPersona(sent, calls, logs);

    const result = await executor.complete(userRequest('agent-developer', 'model-a', 'provider-a'));
    // Identity = Developer persona …
    expect(sent[0].body.agent).toBe('vestara-developer');
    // … while provider/model = Developer configured binding (001A intact).
    expect(sent[0].body.model).toEqual({ providerId: 'provider-a', modelId: 'model-a' });
    expect(result.provider).toBe('provider-a');
    expect(result.model).toBe('model-a');
  });

  it('legacy executors without a persona resolver keep construction behavior', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const calls = { createSession: 0 };
    const executor = createAssistantOpenCodeExecutor({
      client: stubClient('oc-legacy', sent, calls) as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
    });
    await executor.complete(userRequest(undefined));
    expect(sent[0].body.agent).toBe('vestara-assistant');
  });
});

// ─── S2: per-agent capability policy ─────────────────────────────

describe('ROUTING-CONVERGENCE-001C S2: declared-grant policies', () => {
  function grantsFor(agentId: string) {
    const def = CANONICAL_AGENTS.find((a) => a.id === agentId);
    if (!def?.opencodePermissions) throw new Error(`no grants for ${agentId}`);
    return def.opencodePermissions;
  }

  it('Developer policy differs from Assistant policy (no inheritance)', () => {
    const developer = buildToolsMap(createPolicyForAgent('/repo', 'agent-developer', grantsFor('agent-developer')));
    const assistant = buildToolsMap(createPolicyForAgent('/repo', 'agent-assistant', grantsFor('agent-assistant')));
    // Developer FULL_GRANT: task allowed, external_directory denied.
    expect(developer.task).toBe(true);
    expect(developer.external_directory).toBe(false);
    // Assistant grant: task/webfetch/websearch ask-mediated (not direct).
    expect(assistant.task).toBe(false);
    expect(assistant.webfetch).toBe(false);
    expect(assistant.websearch).toBe(false);
    // Shared safe core stays allowed for both.
    expect(developer.read).toBe(true);
    expect(assistant.read).toBe(true);
    // Unbounded loops denied for both.
    expect(developer.doom_loop).toBe(false);
    expect(assistant.doom_loop).toBe(false);
  });

  it('write gates on edit (canonical grant quirk)', () => {
    const reviewer = buildToolsMap(createPolicyForAgent('/repo', 'agent-reviewer', grantsFor('agent-reviewer')));
    expect(reviewer.edit).toBe(false);
    expect(reviewer.write).toBe(false);
    expect(reviewer.bash).toBe(true);
    const developer = buildToolsMap(createPolicyForAgent('/repo', 'agent-developer', grantsFor('agent-developer')));
    expect(developer.edit).toBe(true);
    expect(developer.write).toBe(true);
  });

  it('unknown tools fall through to DENY under every agent policy', () => {
    for (const agentId of Object.keys(TURN_CAPABLE)) {
      const policy = createPolicyForAgent('/repo', agentId, grantsFor(agentId));
      const evaluation = evaluatePermission(policy, 'other', ['brand-new-tool-xyz']);
      expect(evaluation.decision).toBe('deny');
    }
  });

  it('enforcement machinery is shared (ask still mediates, never bypasses)', async () => {
    const policy = createPolicyForAgent('/repo', 'agent-assistant', grantsFor('agent-assistant'));
    // webfetch is ask in the assistant grant → tools map false, evaluation ask.
    expect(evaluatePermission(policy, 'webfetch', ['webfetch']).decision).toBe('ask');
    // Same evaluator answers for the developer grant set.
    const devPolicy = createPolicyForAgent('/repo', 'agent-developer', grantsFor('agent-developer'));
    expect(evaluatePermission(devPolicy, 'read', ['read']).decision).toBe('allow');
    expect(evaluatePermission(devPolicy, 'other', ['external_directory']).decision).toBe('deny');
  });

  it('executor sends the persona policy tools map (not a global assistant map)', async () => {
    const sent: Array<{ sessionId: string; body: Record<string, unknown> }> = [];
    const calls = { createSession: 0 };
    const registry = {
      set: () => undefined,
      acquire: async () => ({
        session: { sessionId: 'oc-reused', repositoryDir: '/repo', createdAt: new Date().toISOString() },
        created: false,
      }),
    };
    const executor = createAssistantOpenCodeExecutor({
      client: stubClient('oc-reused', sent, calls) as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
      resolveAgentPersona: (agentId) => resolveConversationPersona(canonicalStore(), '/repo', agentId),
      sessionRegistry: registry as never,
    });
    await executor.complete(userRequest('agent-developer'));
    const tools = sent[0].body.tools as Record<string, boolean>;
    expect(tools.task).toBe(true);
    expect(tools.external_directory).toBe(false);
  });
});

// ─── Telegram convergence ────────────────────────────────────────

describe('ROUTING-CONVERGENCE-001C: Telegram generic Assistant convergence', () => {
  it('agent-assistant → vestara-assistant with the 001A canonical binding', async () => {
    const defs: Record<string, Partial<AgentDefinition>> = {
      'agent-assistant': { provider: 'provider-a', model: 'model-a' },
    };
    // 001A layer: live canonical provider/model binding.
    const binding = await resolveTelegramAgentBinding(agentStore(defs) as never);
    expect(binding).toEqual({ agentId: 'agent-assistant', provider: 'provider-a', model: 'model-a' });
    // 001C layer: same target resolves the assistant runtime persona.
    const persona = await resolveConversationPersona(agentStore(defs) as never, '/repo', binding.agentId);
    expect(persona.runtimeAgent).toBe('vestara-assistant');
  });

  it('persona resolver is spyable (vi) at the AgentStorage boundary', async () => {
    const getAgent = vi.fn(async (id: string) => ({ id, runtimeAgent: 'vestara-developer', opencodePermissions: {} }));
    const persona = await resolveConversationPersona({ getAgent } as unknown as AgentStorage, '/repo', 'agent-x');
    expect(getAgent).toHaveBeenCalledWith('agent-x');
    expect(persona.runtimeAgent).toBe('vestara-developer');
  });
});
