/**
 * AR-006C: Assistant Turn Trigger
 *
 * Triggers an Assistant turn after a human message is persisted.
 * Resolves agent-assistant configuration through the canonical AgentDefinition
 * authority and delegates execution to Conversation Runtime.
 *
 * Authority flow:
 *   AgentDefinition (agent-assistant)
 *       ↓ provider/model
 *   Conversation Runtime (DefaultConversationService)
 *       ↓ execution
 *   ProviderExecutor.complete()
 *       ↓ response
 *   Activity Room (projection)
 *
 * Ownership:
 *   - triggerAssistantTurn() = thin application adapter (ingress)
 *   - AgentDefinition = configuration source (provider/model)
 *   - Conversation Runtime = execution authority
 *   - Activity Room = projection surface
 *
 * Invariants:
 *   - Human message survives provider failure
 *   - No fabricated successful response on failure
 *   - Assistant response persists through existing Activity pipeline
 *   - No engineering mutation authority
 *   - Provider/model derived from canonical agent configuration
 */

import { randomUUID } from 'node:crypto';
import type { AssistantTurnResult } from './assistant-types';
import type { AgentMessageActivity } from './contracts';
import type { ActivityProjectionService } from './service';

/** Minimal logger interface. */
interface AssistantLogger {
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  info: (msg: string, ctx?: Record<string, unknown>) => void;
}

/** Canonical agent definition interface (subset). */
interface AssistantAgentDefinition {
  readonly id: string;
  readonly name?: string;
  readonly provider?: string;
  readonly model?: string;
}

/** Agent storage interface for resolving agent definitions. */
interface AssistantAgentStorage {
  /** Get an agent definition by ID. */
  getAgent(id: string): Promise<AssistantAgentDefinition | null>;
}

/** Minimal conversation service interface for Assistant execution. */
interface AssistantConversationService {
  /** Create a conversation. */
  createConversation(userId: string, options?: Record<string, unknown>): Promise<{ id: string }>;
  /** Send a message and get assistant response. */
  sendMessage(
    conversationId: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<{
    message: { content: string };
    response: { content: string; provider?: string; model?: string };
    latency: number;
  }>;
}

/** Options for triggering an Assistant turn. */
export interface TriggerAssistantTurnOptions {
  /**
   * The agent taking the turn. Defaults to 'agent-assistant' (legacy AR-006
   * behavior). The route allowlists turn-capable ids (assistant, context,
   * planner, developer, reviewer, verifier); config/display resolve from
   * AgentDefinition.
   */
  readonly agentId?: string;
  /** The persisted human message record. */
  readonly humanRecord: AgentMessageActivity;
  /** The Activity Projection Service for response persistence. */
  readonly service: ActivityProjectionService;
  /** The conversation service for provider execution. */
  readonly conversationService?: AssistantConversationService;
  /** The agent storage for resolving agent definitions. */
  readonly agentStorage?: AssistantAgentStorage;
  /** Logger for diagnostics. */
  readonly logger?: AssistantLogger;
  /** Per-turn execution config (Vestara-owned limits, e.g. maxToolCalls). */
  readonly executionConfig?: { readonly maxToolCalls?: number; readonly turnTimeoutMs?: number };
}

/** Resolved execution configuration from agent definition. */
interface AssistantExecutionConfig {
  readonly provider?: string;
  readonly model?: string;
  readonly displayName?: string;
}

/** Fallback display names when AgentDefinition carries none. */
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'agent-assistant': 'Assistant',
  'agent-context': 'Context',
  'agent-developer': 'Developer',
  'agent-reviewer': 'Reviewer',
  'agent-planner': 'Planner',
  'agent-verifier': 'Verifier',
};

/**
 * Resolve agent configuration from the canonical AgentDefinition.
 *
 * Provider/model resolution follows Vestara precedence:
 *   1. Agent-level configuration (from AgentDefinition)
 *   2. Global/default configuration (from Conversation Runtime)
 *
 * This ensures the agent's identity influences execution configuration.
 */
async function resolveAssistantConfig(
  agentId: string,
  agentStorage?: AssistantAgentStorage,
): Promise<AssistantExecutionConfig> {
  if (!agentStorage) return { displayName: AGENT_DISPLAY_NAMES[agentId] };

  const agent = await agentStorage.getAgent(agentId);
  if (!agent) return { displayName: AGENT_DISPLAY_NAMES[agentId] };

  return {
    provider: agent.provider,
    model: agent.model,
    displayName: agent.name ?? AGENT_DISPLAY_NAMES[agentId],
  };
}

/**
 * Trigger an Assistant turn after a human message is persisted.
 *
 * Flow:
 *   1. Resolve agent-assistant configuration from AgentDefinition
 *   2. Create conversation
 *   3. Send message through conversation service (provider execution)
 *   4. Persist Assistant response in Activity Room
 *   5. Return AssistantTurnResult
 */
export async function triggerAssistantTurn(options: TriggerAssistantTurnOptions): Promise<AssistantTurnResult> {
  const {
    agentId = 'agent-assistant',
    humanRecord,
    service,
    conversationService,
    agentStorage,
    logger,
    executionConfig,
  } = options;
  const correlationId = humanRecord.correlationId ?? `corr-${randomUUID()}`;
  const completedAt = new Date().toISOString();

  // If no conversation service available, return failure immediately
  if (!conversationService) {
    return {
      conversationId: humanRecord.sessionId ?? 'unknown',
      humanMessageId: humanRecord.id,
      agentId,
      correlationId,
      status: 'failed',
      failure: 'Conversation service not available',
      completedAt,
    };
  }

  try {
    // 1. Resolve agent configuration from canonical AgentDefinition
    const agentConfig = await resolveAssistantConfig(agentId, agentStorage);
    const displayName = agentConfig.displayName ?? 'Assistant';

    // 2. Create conversation
    const conversation = await conversationService.createConversation(agentId, {
      agentId,
      correlationId,
    });

    // 3. Send message through conversation service (provider execution)
    //    Pass the agent's model via SendOptions to override default
    const sendOptions: Record<string, unknown> = {
      agentId,
    };
    if (agentConfig.model) {
      sendOptions.model = agentConfig.model;
    }
    if (executionConfig) {
      sendOptions.executionConfig = executionConfig;
    }

    const response = await conversationService.sendMessage(conversation.id, humanRecord.content, sendOptions);

    // 4. Persist agent response in Activity Room
    if (response.response.content) {
      const assistantRecord: AgentMessageActivity = {
        id: `activity:msg:${randomUUID()}`,
        sequence: 0,
        timestamp: new Date().toISOString(),
        actor: {
          type: 'agent',
          id: agentId,
          displayName,
        },
        kind: 'agent-message',
        agentId,
        messageKind: 'message',
        content: response.response.content,
        correlationId,
        evidenceRefs: [],
      };

      const appended = await service.appendActivity(assistantRecord);

      return {
        conversationId: conversation.id,
        humanMessageId: humanRecord.id,
        assistantMessageId: appended.id,
        agentId,
        correlationId,
        status: 'completed',
        content: response.response.content,
        completedAt,
      };
    }

    // 5. No content returned — failure
    return {
      conversationId: conversation.id,
      humanMessageId: humanRecord.id,
      agentId,
      correlationId,
      status: 'failed',
      failure: 'No response content',
      completedAt,
    };
  } catch (error) {
    // 6. Execution failure — log and return failure
    logger?.warn('Assistant turn failed', {
      humanMessageId: humanRecord.id,
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      conversationId: humanRecord.sessionId ?? 'unknown',
      humanMessageId: humanRecord.id,
      agentId,
      correlationId,
      status: 'failed',
      failure: error instanceof Error ? error.message : String(error),
      completedAt,
    };
  }
}
