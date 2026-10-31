/**
 * Assistant Agent Persona — per-turn resolved execution persona.
 *
 * Split from `assistant-opencode-adapter.ts` (pure move, no behavior change).
 * Maps the requested logical `agentId` to the OpenCode runtime agent +
 * capability policy that actually execute the turn, both sourced from the
 * canonical AgentDefinition. The prompt_async request carries `runtimeAgent`;
 * the Vestara side retains the requested id for attribution, so a mismatch
 * can never silently pass as the requested agent.
 */

import type { CompletionRequest } from '@vestara/shared';
import type { AssistantCapabilityPolicy } from './assistant-capability-policy';

export interface ResolvedAgentPersona {
  /** OpenCode runtime agent for prompt_async.agent (e.g. 'vestara-developer'). */
  readonly runtimeAgent: string;
  /** Capability policy for this turn's tools map + permission evaluation. */
  readonly capabilityPolicy?: AssistantCapabilityPolicy;
}

/**
 * Thrown when the per-turn persona cannot be resolved authoritatively.
 * The turn fails BEFORE any OpenCode session/message is created — an
 * explicitly targeted agent never executes as another persona.
 */
export class AgentPersonaError extends Error {
  readonly agentId?: string;

  constructor(message: string, agentId?: string) {
    super(message);
    this.name = 'AgentPersonaError';
    this.agentId = agentId;
  }
}

/** Minimal structural options for persona resolution (satisfied by the adapter options). */
export interface TurnPersonaOptions {
  readonly agent: string;
  readonly capabilityPolicy?: AssistantCapabilityPolicy;
  readonly resolveAgentPersona?: (agentId?: string) => Promise<ResolvedAgentPersona>;
}

/**
 * Resolve the turn persona: per-turn resolver wins; otherwise the
 * construction-time fallback agent governs generic execution only.
 */
export async function resolveTurnPersona(
  options: TurnPersonaOptions,
  request: CompletionRequest,
): Promise<ResolvedAgentPersona> {
  if (options.resolveAgentPersona) {
    return options.resolveAgentPersona(request.agentId);
  }
  return {
    runtimeAgent: options.agent,
    ...(options.capabilityPolicy ? { capabilityPolicy: options.capabilityPolicy } : {}),
  };
}
