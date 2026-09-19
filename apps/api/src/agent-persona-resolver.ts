/**
 * ROUTING-CONVERGENCE-001C S1+S2 — Conversation Agent Persona Resolver.
 *
 * Server-authoritative per-turn execution persona for conversation turns.
 * Resolves the requested logical agent to its OpenCode runtime twin +
 * capability policy from the live AgentDefinition — the SAME authority the
 * Activity Room reads for provider/model:
 *
 *   requested Vestara agentId → AgentDefinition → runtimeAgent → prompt_async.agent
 *   requested Vestara agentId → AgentDefinition.opencodePermissions → turn capability policy
 *
 * Fail-closed contract:
 * - Generic execution (absent agentId) and `agent-assistant` explicitly
 *   resolve to `vestara-assistant` (default policy when the definition is
 *   unavailable — the generic path owns no stronger claim).
 * - Any other explicitly targeted agent WITHOUT a complete definition
 *   (missing runtimeAgent or grants) or with an unreadable store REJECTS —
 *   the turn never executes as another persona (never silent
 *   vestara-assistant substitution).
 */

import type { AgentStorage } from '@vestara/workspace';
import { createDefaultAssistantPolicy, createPolicyForAgent } from './assistant-capability-policy';
import { AgentPersonaError, type ResolvedAgentPersona } from './assistant-opencode-adapter';

/** Canonical generic-assistant identities (explicit resolution, never fallback). */
const GENERIC_ASSISTANT_ID = 'agent-assistant';
const GENERIC_RUNTIME_AGENT = 'vestara-assistant';

export async function resolveConversationPersona(
  agents: AgentStorage,
  repositoryDir: string,
  agentId?: string,
): Promise<ResolvedAgentPersona> {
  const normalized = agentId?.trim() ? agentId.trim() : GENERIC_ASSISTANT_ID;
  if (normalized === GENERIC_ASSISTANT_ID) {
    try {
      const def = await agents.getAgent(GENERIC_ASSISTANT_ID);
      if (def?.runtimeAgent && def?.opencodePermissions) {
        return {
          runtimeAgent: def.runtimeAgent,
          capabilityPolicy: createPolicyForAgent(repositoryDir, def.id, def.opencodePermissions),
        };
      }
    } catch {
      /* fall through to the explicit generic default below */
    }
    return { runtimeAgent: GENERIC_RUNTIME_AGENT, capabilityPolicy: createDefaultAssistantPolicy(repositoryDir) };
  }
  let def: Awaited<ReturnType<AgentStorage['getAgent']>>;
  try {
    def = await agents.getAgent(normalized);
  } catch (error) {
    throw new AgentPersonaError(
      `Cannot resolve execution persona for ${normalized} — agent store unreadable (${error instanceof Error ? error.message : 'unknown'})`,
      normalized,
    );
  }
  if (!def) {
    throw new AgentPersonaError(
      `Unknown target agent ${normalized} — refusing to execute as another persona`,
      normalized,
    );
  }
  if (!def.runtimeAgent || !def.opencodePermissions) {
    throw new AgentPersonaError(
      `Agent ${normalized} has no complete runtime persona (runtimeAgent + grants) — refusing to fall through to ${GENERIC_RUNTIME_AGENT}`,
      normalized,
    );
  }
  return {
    runtimeAgent: def.runtimeAgent,
    capabilityPolicy: createPolicyForAgent(repositoryDir, def.id, def.opencodePermissions),
  };
}
