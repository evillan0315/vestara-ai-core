/**
 * @vestara/stream — Reusable Streaming Pipeline
 *
 * Normalizes provider output into canonical StreamChunks with typed
 * content types (text, reasoning, tool_call, tool_result, citation,
 * status, error, complete, meta). Emits stream events through the
 * Event Bus for observability.
 *
 * Engineering Rule 6: Everything streams.
 * This pipeline is reusable for LLM tokens, filesystem reads, mission
 * progress, workflow execution, downloads, uploads, knowledge indexing,
 * tool output, and voice synthesis.
 *
 * Architecture Traceability:
 *   Specification: CAP-001 → Streaming
 *   Provider SDK: PROVIDER-SDK.md → StreamChunk
 *   Runtime: LOGGING-ARCHITECTURE.md
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ChunkMetadata, ChunkType, StreamChunk, StreamEvent } from '@vestara/shared';

let chunkCounter = 0;

export interface StreamProcessor {
  /** Normalize a raw provider token into a canonical StreamChunk */
  text(content: string, options?: ChunkOptions): StreamChunk;
  reasoning(content: string, options?: ChunkOptions): StreamChunk;
  toolCall(name: string, args: string, options?: ChunkOptions): StreamChunk;
  toolResult(name: string, content: string, options?: ChunkOptions): StreamChunk;
  citation(source: string, content: string, options?: ChunkOptions): StreamChunk;
  status(message: string, options?: ChunkOptions): StreamChunk;
  error(message: string, options?: ChunkOptions): StreamChunk;
  complete(options?: ChunkOptions): StreamChunk;
  meta(usage?: ChunkMetadata['usage'], latency?: number, options?: ChunkOptions): StreamChunk;

  /** Create a logger that emits stream events */
  withEvents(options: StreamOptions): StreamProcessor;
  /** Consume an async iterable of raw strings (for simple providers) */
  fromProvider(provider: AsyncIterable<string>, options: StreamOptions): AsyncIterable<StreamChunk>;
}

export interface StreamOptions {
  conversationId: string;
  provider: string;
  model: string;
  emitEvents?: boolean;
}

export interface ChunkOptions {
  sequence?: number;
  conversationId?: string;
  provider?: string;
  model?: string;
}

export class DefaultStreamProcessor implements StreamProcessor {
  private eventBus?: EventBus;
  private logger?: Logger;

  constructor(options?: { eventBus?: EventBus; logger?: Logger }) {
    this.eventBus = options?.eventBus;
    this.logger = options?.logger?.child({ component: 'stream' });
  }

  withEvents(options: StreamOptions): StreamProcessor {
    return new EventEmittingProcessor(this, this.eventBus, this.logger, options);
  }

  private createChunk(type: ChunkType, content?: string, name?: string, options?: ChunkOptions): StreamChunk {
    return {
      id: `chunk-${Date.now()}-${++chunkCounter}`,
      type,
      content,
      name,
      metadata: {
        sequence: options?.sequence ?? 0,
        timestamp: new Date().toISOString(),
        provider: options?.provider,
        model: options?.model,
        conversationId: options?.conversationId,
      },
    };
  }

  text(content: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('text', content, undefined, options);
  }

  reasoning(content: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('reasoning', content, undefined, options);
  }

  toolCall(name: string, args: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('tool_call', args, name, options);
  }

  toolResult(name: string, content: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('tool_result', content, name, options);
  }

  citation(source: string, content: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('citation', content, source, options);
  }

  status(message: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('status', message, undefined, options);
  }

  error(message: string, options?: ChunkOptions): StreamChunk {
    return this.createChunk('error', message, undefined, options);
  }

  complete(options?: ChunkOptions): StreamChunk {
    return this.createChunk('complete', undefined, undefined, options);
  }

  meta(usage?: ChunkMetadata['usage'], latency?: number, options?: ChunkOptions): StreamChunk {
    return {
      id: `chunk-${Date.now()}-${++chunkCounter}`,
      type: 'meta',
      metadata: {
        sequence: options?.sequence ?? 0,
        timestamp: new Date().toISOString(),
        provider: options?.provider,
        model: options?.model,
        conversationId: options?.conversationId,
        usage,
        latency,
      },
    };
  }

  async *fromProvider(provider: AsyncIterable<string>, options: StreamOptions): AsyncIterable<StreamChunk> {
    let seq = 0;

    // Emit started event
    if (this.eventBus) {
      await this.eventBus.emit({
        type: 'provider:stream.started',
        source: 'stream-runtime',
        payload: {
          conversationId: options.conversationId,
          provider: options.provider,
          model: options.model,
        },
        metadata: {},
      });
    }

    try {
      for await (const token of provider) {
        const chunk = this.text(token, {
          sequence: seq++,
          conversationId: options.conversationId,
          provider: options.provider,
          model: options.model,
        });

        // Emit chunk event
        if (this.eventBus) {
          await this.eventBus.emit({
            type: 'provider:stream.chunk',
            source: 'stream-runtime',
            payload: {
              conversationId: options.conversationId,
              chunk,
            },
            metadata: {},
          });
        }

        yield chunk;
      }

      // Emit completed event
      if (this.eventBus) {
        await this.eventBus.emit({
          type: 'provider:stream.completed',
          source: 'stream-runtime',
          payload: {
            conversationId: options.conversationId,
            chunks: seq,
          },
          metadata: {},
        });
      }

      yield this.complete({
        sequence: seq,
        conversationId: options.conversationId,
        provider: options.provider,
        model: options.model,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Stream error';

      if (this.eventBus) {
        await this.eventBus.emit({
          type: 'provider:stream.error',
          source: 'stream-runtime',
          payload: {
            conversationId: options.conversationId,
            error: msg,
          },
          metadata: {},
        });
      }

      yield this.error(msg, {
        sequence: seq,
        conversationId: options.conversationId,
        provider: options.provider,
        model: options.model,
      });
    }
  }
}

/**
 * EventEmittingProcessor wraps a StreamProcessor and emits every chunk
 * through the Event Bus automatically.
 */
class EventEmittingProcessor implements StreamProcessor {
  constructor(
    private inner: StreamProcessor,
    private eventBus?: EventBus,
    private logger?: Logger,
    private streamOptions?: StreamOptions,
  ) {}

  withEvents(options: StreamOptions): StreamProcessor {
    return new EventEmittingProcessor(this.inner, this.eventBus, this.logger, options);
  }

  private emit(type: StreamEvent['type'], payload: Record<string, unknown>): void {
    if (this.eventBus && this.streamOptions) {
      this.eventBus
        .emit({
          type,
          source: 'stream-runtime',
          payload: {
            conversationId: this.streamOptions.conversationId,
            ...payload,
          },
          // ARX-015 M2: conversationId is not an execution identity — correlation absent (fail-closed)
          metadata: {},
        })
        .catch(() => {});
    }
  }

  text(content: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.text(content, options);
    this.emit('provider:stream.chunk', { chunk });
    return chunk;
  }

  reasoning(content: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.reasoning(content, options);
    this.emit('provider:stream.chunk', { chunk });
    return chunk;
  }

  toolCall(name: string, args: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.toolCall(name, args, options);
    this.emit('provider:stream.chunk', { chunk });
    return chunk;
  }

  toolResult(name: string, content: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.toolResult(name, content, options);
    this.emit('provider:stream.chunk', { chunk });
    return chunk;
  }

  citation(source: string, content: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.citation(source, content, options);
    this.emit('provider:stream.chunk', { chunk });
    return chunk;
  }

  status(message: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.status(message, options);
    this.emit('provider:stream.chunk', { chunk });
    return chunk;
  }

  error(message: string, options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.error(message, options);
    this.emit('provider:stream.error', { chunk, error: message });
    return chunk;
  }

  complete(options?: ChunkOptions): StreamChunk {
    const chunk = this.inner.complete(options);
    this.emit('provider:stream.completed', { chunk });
    return chunk;
  }

  meta(usage?: ChunkMetadata['usage'], latency?: number, options?: ChunkOptions): StreamChunk {
    return this.inner.meta(usage, latency, options);
  }

  async *fromProvider(provider: AsyncIterable<string>, options: StreamOptions): AsyncIterable<StreamChunk> {
    yield* this.inner.fromProvider(provider, options);
  }
}
