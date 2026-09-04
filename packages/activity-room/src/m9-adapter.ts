/**
 * ARX-015 M9: Activity Event Adapter
 *
 * Converts authoritative platform events (M8 WorkflowEvents, human messages,
 * agent lifecycle) into canonical ActivityEvents for durable storage.
 *
 * This adapter normalizes events to Vestara concepts. It never leaks
 * OpenCode internals or provider-specific response formats.
 */

import type {
  ActivityActor,
  BindingId,
  ExecutionId,
  RepositoryBindingId,
  RuntimeSessionId,
  TraceId,
  WorkflowEvent,
  WorkflowRunId,
  WorkflowTaskId,
} from '@vestara/types';
import type { ActivityEvent, ActivityPayload, ActivitySource, ActivityType } from './m9-types';

// ─── M8 WorkflowEvent → ActivityEvent ──────────────────────

/** Adapter ID counter for unique event IDs. */
let adapterEventCounter = 0;

/**
 * Convert an M8 WorkflowEvent into a durable ActivityEvent.
 * The ActivityEvent carries all M1/M2 lineage from the WorkflowEvent.
 */
export function fromWorkflowEvent(event: WorkflowEvent): ActivityEvent {
  const eventType = mapWorkflowEventType(event.type);

  const payload: ActivityPayload = {
    message: buildWorkflowMessage(event),
    ...(event.output !== undefined ? { output: event.output } : {}),
    ...(event.error !== undefined ? { error: { message: event.error } } : {}),
  };

  return {
    eventId: `we-${event.workflowRunId}-${event.type}-${event.timestamp}-${++adapterEventCounter}`,
    type: eventType,
    timestamp: event.timestamp,
    executionId: event.executionId,
    traceId: event.traceId,
    requestId: event.requestId,
    workflowRunId: event.workflowRunId,
    taskId: event.taskInstanceId,
    agentAssignmentId: event.agentAssignmentId,
    actor: mapWorkflowActor(event),
    source: 'workflow-engine',
    payload,
  };
}

/**
 * Map M8 WorkflowEventType to canonical ActivityType.
 * 1:1 mapping — no normalization loss.
 */
function mapWorkflowEventType(type: WorkflowEvent['type']): ActivityType {
  // The WorkflowEvent types already match ActivityType 1:1
  return type as ActivityType;
}

/**
 * Determine actor from WorkflowEvent.
 * Workflow events are system-originated.
 */
function mapWorkflowActor(event: WorkflowEvent): ActivityActor {
  if (event.agentAssignmentId) {
    return { type: 'agent', id: event.agentAssignmentId, displayName: event.agentAssignmentId };
  }
  return { type: 'system', id: 'workflow-engine', displayName: 'Workflow Engine' };
}

/**
 * Build human-readable message from WorkflowEvent.
 * Normalized to Vestara concepts — no OpenCode leakage.
 */
function buildWorkflowMessage(event: WorkflowEvent): string {
  switch (event.type) {
    case 'workflow.started':
      return 'Workflow started';
    case 'workflow.completed':
      return 'Workflow completed';
    case 'workflow.failed':
      return `Workflow failed${event.error ? `: ${event.error}` : ''}`;
    case 'workflow.cancelled':
      return 'Workflow cancelled';
    case 'task.runnable':
      return `Task "${event.taskId}" is runnable`;
    case 'task.started':
      return `Task "${event.taskId}" started by agent ${event.agentAssignmentId ?? 'unknown'}`;
    case 'task.completed':
      return `Task "${event.taskId}" completed`;
    case 'task.failed':
      return `Task "${event.taskId}" failed${event.error ? `: ${event.error}` : ''}`;
    case 'task.cancelled':
      return `Task "${event.taskId}" cancelled`;
    default:
      return `Workflow event: ${event.type}`;
  }
}

// ─── Human Message → ActivityEvent ─────────────────────────

export interface HumanMessageInput {
  /** Message content. */
  readonly message: string;

  /** User identity. */
  readonly userId: string;

  /** Display name. */
  readonly displayName: string;

  /** Workflow run context. */
  readonly workflowRunId?: WorkflowRunId;

  /** Execution context. */
  readonly executionId?: ExecutionId;

  /** Trace context. */
  readonly traceId?: TraceId;

  /** Task context. */
  readonly taskId?: WorkflowTaskId;

  /** Repository context. */
  readonly repositoryBindingId?: RepositoryBindingId;

  /** Runtime session context. */
  readonly runtimeSessionBindingId?: RuntimeSessionId;

  /** AI binding context. */
  readonly aiBindingId?: BindingId;
}

/**
 * Convert a human message into a durable ActivityEvent.
 * Human messages are first-class durable facts that survive restart/reconnect.
 */
export function fromHumanMessage(input: HumanMessageInput): ActivityEvent {
  const now = new Date().toISOString();

  return {
    eventId: `hm-${input.userId}-${now}-${++adapterEventCounter}`,
    type: 'human.message',
    timestamp: now,
    executionId: input.executionId,
    traceId: input.traceId,
    workflowRunId: input.workflowRunId,
    taskId: input.taskId,
    repositoryBindingId: input.repositoryBindingId,
    runtimeSessionBindingId: input.runtimeSessionBindingId,
    aiBindingId: input.aiBindingId,
    actor: {
      type: 'human',
      id: input.userId,
      displayName: input.displayName,
    },
    source: 'human-input',
    payload: {
      message: input.message,
    },
    visibility: 'all',
  };
}

// ─── Agent Lifecycle → ActivityEvent ───────────────────────

export interface AgentLifecycleInput {
  /** Agent identity. */
  readonly agentId: string;

  /** Display name (used as participant display name). */
  readonly displayName: string;

  /** Lifecycle type. */
  readonly lifecycleType: 'assigned' | 'started' | 'progress' | 'waiting' | 'completed' | 'failed' | 'cancelled';

  /** Optional message. */
  readonly message?: string;

  /** Agent role (e.g. 'developer', 'reviewer'). */
  readonly role?: string;

  /** Resolved model ID (e.g. 'mimo-v2.5-free'). */
  readonly modelId?: string;

  /** Presentation-only model display name (e.g. 'Mimo'). Separate from canonical displayName. */
  readonly modelDisplayName?: string;

  /** Resolved provider ID. */
  readonly providerId?: string;

  /** Workflow run context. */
  readonly workflowRunId?: WorkflowRunId;

  /** Task context. */
  readonly taskId?: WorkflowTaskId;

  /** Agent assignment identity. */
  readonly agentAssignmentId?: string;

  /** Execution context. */
  readonly executionId?: ExecutionId;

  /** Trace context. */
  readonly traceId?: TraceId;

  /** Repository context. */
  readonly repositoryBindingId?: RepositoryBindingId;

  /** Runtime session context. */
  readonly runtimeSessionBindingId?: RuntimeSessionId;

  /** AI binding context. */
  readonly aiBindingId?: BindingId;
}

/**
 * Convert agent lifecycle activity into a durable ActivityEvent.
 * Normalized to Vestara concepts — no OpenCode/provider leakage.
 */
export function fromAgentLifecycle(input: AgentLifecycleInput): ActivityEvent {
  const now = new Date().toISOString();
  const type = `agent.${input.lifecycleType}` as ActivityType;

  const payload: ActivityPayload = {
    message: input.message ?? `Agent ${input.agentId} ${input.lifecycleType}`,
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.modelDisplayName ? { modelDisplayName: input.modelDisplayName } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
    },
  };

  return {
    eventId: `al-${input.agentId}-${input.lifecycleType}-${now}-${++adapterEventCounter}`,
    type,
    timestamp: now,
    executionId: input.executionId,
    traceId: input.traceId,
    workflowRunId: input.workflowRunId,
    taskId: input.taskId,
    agentAssignmentId: input.agentAssignmentId,
    repositoryBindingId: input.repositoryBindingId,
    runtimeSessionBindingId: input.runtimeSessionBindingId,
    aiBindingId: input.aiBindingId,
    actor: {
      type: 'agent',
      id: input.agentId,
      displayName: input.displayName,
    },
    source: 'agent-harness',
    payload,
  };
}

// ─── Interaction → ActivityEvent (AR-REC-C2 I1-7) ──────────

export interface InteractionPresentedInput {
  readonly eventId: string;
  readonly interactionId: string;
  readonly conversationId?: string;
  readonly presentingParticipantId: string;
  readonly presentingParticipantName: string;
  readonly createdAt: string;
  readonly content: string;
  readonly choices: readonly { readonly choiceId: string; readonly label: string; readonly description?: string }[];
}

/**
 * Convert an interaction:presented event into a durable ActivityEvent.
 * Normalized to Vestara concepts — no producer-specific leakage.
 */
export function fromInteractionPresented(input: InteractionPresentedInput): ActivityEvent {
  return {
    eventId: input.eventId,
    type: 'interaction.presented',
    timestamp: input.createdAt,
    actor: {
      type: 'system',
      id: input.presentingParticipantId,
      displayName: input.presentingParticipantName,
    },
    source: 'interaction-app',
    payload: {
      message: input.content,
      data: {
        interactionId: input.interactionId,
        conversationId: input.conversationId,
        choices: input.choices,
      },
    },
  };
}

export interface InteractionRespondedInput {
  readonly eventId: string;
  readonly interactionId: string;
  readonly responseId: string;
  readonly selectedChoiceId: string;
  readonly respondingParticipantId: string;
  readonly respondingParticipantName: string;
  readonly respondedAt: string;
  readonly correlationId?: string;
}

/**
 * Convert an interaction:responded event into a durable ActivityEvent.
 * Normalized to Vestara concepts — no producer-specific leakage.
 */
export function fromInteractionResponded(input: InteractionRespondedInput): ActivityEvent {
  return {
    eventId: input.eventId,
    type: 'interaction.responded',
    timestamp: input.respondedAt,
    actor: {
      type: 'human',
      id: input.respondingParticipantId,
      displayName: input.respondingParticipantName,
    },
    source: 'interaction-app',
    payload: {
      message: `Responded to interaction with choice ${input.selectedChoiceId}`,
      data: {
        interactionId: input.interactionId,
        responseId: input.responseId,
        selectedChoiceId: input.selectedChoiceId,
        correlationId: input.correlationId,
      },
    },
  };
}
