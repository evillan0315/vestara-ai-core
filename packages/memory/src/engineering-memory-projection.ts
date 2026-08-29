/**
 * EngineeringMemoryProjection — durable engineering memory derived from
 * completed agent harness threads (Phase 4 / engineering-os-roadmap item 4).
 *
 * Subscribes to `harness.*` domain events and projects them into the
 * MemoryRuntime as durable memories:
 *
 *   harness.model.completed      → `decision` memory (agent reasoning/summary)
 *   harness.tool.completed       → `fact` memory (operation performed)
 *   harness.tool.failed          → `event` memory (operation failure)
 *   harness.outcome.completed    → `decision` memory (thread completed w/ summary)
 *   harness.outcome.failed       → `event` memory (thread failed w/ reason)
 *
 * Memories are tagged with the thread/task identity and stored in the
 * long-term layer with `source: 'engineering-thread'`. The projection is
 * decoupled — a failure to persist memory never breaks the harness run.
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { VestaraEvent } from '@vestara/shared';
import type { MemoryInput, MemoryLayer, MemoryRuntime, MemoryType } from './index';

export interface EngineeringMemoryProjectionOptions {
  readonly eventBus: EventBus;
  readonly memory: MemoryRuntime;
  readonly logger?: Logger;
  /** Default user id to attribute engineering memories to. */
  readonly userId?: string;
}

interface HarnessIdentityFields {
  readonly threadId?: string;
  readonly turnId?: string;
  readonly runId?: string;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly correlationId?: string;
}

type Derivation = {
  readonly type: MemoryType;
  readonly layer: MemoryLayer;
  readonly content: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly importance: number;
};

/**
 * Pure derivation of a memory from a harness event — exported for unit
 * testing. Returns undefined for events that do not produce a memory.
 */
export function deriveMemory(event: VestaraEvent): Derivation | undefined {
  const payload = (event.payload ?? {}) as HarnessIdentityFields & Record<string, unknown>;
  const threadId = typeof payload.threadId === 'string' ? payload.threadId : undefined;

  switch (event.type) {
    case 'harness.model.completed': {
      const content = typeof payload.content === 'string' ? payload.content : '';
      const count = typeof payload.toolCallCount === 'number' ? payload.toolCallCount : 0;
      if (!content && count === 0) return undefined;
      return {
        type: 'decision',
        layer: 'long-term',
        content: content || `Agent turn produced ${count} tool call(s).`,
        summary: `Agent decision${threadId ? ` (thread ${threadId})` : ''}`,
        tags: ['engineering', 'thread', 'decision'],
        importance: 7,
      };
    }
    case 'harness.tool.completed': {
      const toolName = typeof payload.toolName === 'string' ? payload.toolName : 'tool';
      const callId = typeof payload.callId === 'string' ? payload.callId : '';
      return {
        type: 'fact',
        layer: 'long-term',
        content: `Tool ${toolName} completed${callId ? ` (${callId})` : ''}.`,
        summary: `Operation performed: ${toolName}`,
        tags: ['engineering', 'tool', 'completed'],
        importance: 5,
      };
    }
    case 'harness.tool.failed': {
      const toolName = typeof payload.toolName === 'string' ? payload.toolName : 'tool';
      const error = typeof payload.error === 'string' ? payload.error : 'unknown error';
      return {
        type: 'event',
        layer: 'long-term',
        content: `Tool ${toolName} failed: ${error}.`,
        summary: `Operation failed: ${toolName}`,
        tags: ['engineering', 'tool', 'failed'],
        importance: 8,
      };
    }
    case 'harness.outcome.completed': {
      const summary = typeof payload.summary === 'string' ? payload.summary : 'completed';
      return {
        type: 'decision',
        layer: 'long-term',
        content: `Thread${threadId ? ` ${threadId}` : ''} completed: ${summary}.`,
        summary: 'Engineering thread completed',
        tags: ['engineering', 'thread', 'completed'],
        importance: 9,
      };
    }
    case 'harness.outcome.failed': {
      const summary = typeof payload.summary === 'string' ? payload.summary : 'failed';
      const reasonCode = typeof payload.reasonCode === 'string' ? payload.reasonCode : undefined;
      return {
        type: 'event',
        layer: 'long-term',
        content: `Thread${threadId ? ` ${threadId}` : ''} failed: ${summary}${reasonCode ? ` (${reasonCode})` : ''}.`,
        summary: 'Engineering thread failed',
        tags: ['engineering', 'thread', 'failed'],
        importance: 9,
      };
    }
    default:
      return undefined;
  }
}

/**
 * Subscribes to `harness.*` events and projects durable memories. Returns a
 * disposer that unsubscribes.
 */
export function createEngineeringMemoryProjection(options: EngineeringMemoryProjectionOptions): () => void {
  const userId = options.userId ?? 'engineering';
  const logger = options.logger?.child({ component: 'engineering-memory-projection' });

  const handler = async (event: VestaraEvent): Promise<void> => {
    const derivation = deriveMemory(event);
    if (!derivation) return;
    try {
      const input: MemoryInput = {
        type: derivation.type,
        content: derivation.content,
        tags: [...derivation.tags],
        source: 'engineering-thread',
        metadata: {
          eventType: event.type,
          threadId: (event.payload as HarnessIdentityFields)?.threadId,
          taskId: (event.payload as HarnessIdentityFields)?.taskId,
          agentId: (event.payload as HarnessIdentityFields)?.agentId,
          correlationId: event.metadata?.correlationId,
        },
      };
      await options.memory.store(userId, input);
      logger?.debug('Projected engineering memory', {
        type: derivation.type,
        eventType: event.type,
        threadId: input.metadata?.threadId,
      });
    } catch (error) {
      // A memory-projection failure must never break the harness run.
      logger?.warn('Engineering memory projection failed', {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return options.eventBus.subscribe('harness.*', handler);
}
