/**
 * @vestara/tools-memory — Memory graph query tool
 *
 * Searches and stores memories through the injected MemoryRuntime. Low risk
 * (read-only search; storage is explicit and bounded). Integrates with the
 * ToolRuntime for permission-gated execution.
 *
 * Architecture Traceability:
 *   Foundation: TOOL-CATALOG.md → T-00x memory
 */

import type { MemoryRuntime } from '@vestara/memory';
import type { ToolExecutionContext, ToolExecutionResult, ToolInputSchema, VestaraTool } from '@vestara/tool-runtime';
import type { EvidenceArtifact } from '@vestara/types';

export const version = '0.1.0';

export interface MemorySearchInput {
  readonly query: string;
  readonly userId: string;
  readonly limit?: number;
}

export interface MemorySearchOutput {
  readonly total: number;
  readonly memories: Array<{
    readonly id: string;
    readonly type: string;
    readonly layer: string;
    readonly content: string;
    readonly summary?: string;
    readonly importance: number;
    readonly tags: readonly string[];
    readonly createdAt: string;
  }>;
}

export interface MemoryStoreInput {
  readonly userId: string;
  readonly type: 'fact' | 'preference' | 'event' | 'decision';
  readonly content: string;
  readonly tags?: readonly string[];
}

export interface MemoryStoreOutput {
  readonly id: string;
  readonly type: string;
  readonly layer: string;
  readonly content: string;
}

function recordInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object');
  return input as Record<string, unknown>;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Tool input requires non-empty string: ${key}`);
  return value;
}

function optionalNumber(record: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Tool input must be a number: ${key}`);
  return value;
}

function optionalStringList(record: Readonly<Record<string, unknown>>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new Error(`Tool input must be an array of strings: ${key}`);
  return value as string[];
}

function memoryEvidence(summary: string): EvidenceArtifact {
  return {
    id: `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'custom',
    summary,
    metadata: { operation: 'memory.graph.query' },
  };
}

/** Search the memory graph (low risk, read-only). */
export class MemoryGraphQueryTool implements VestaraTool<MemorySearchInput, MemorySearchOutput> {
  readonly name = 'memory.graph.query';
  readonly description = 'Search stored memories for a query across all layers';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<MemorySearchInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        userId: { type: 'string', minLength: 1 },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: ['query', 'userId'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      return {
        query: requiredString(record, 'query'),
        userId: requiredString(record, 'userId'),
        limit: optionalNumber(record, 'limit'),
      };
    },
  };

  constructor(private readonly memory: MemoryRuntime) {}

  affectedResources(input: MemorySearchInput): readonly string[] {
    return [`memory:${input.userId}`];
  }

  async execute(
    input: MemorySearchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<MemorySearchOutput>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const result = await this.memory.search(input.userId, input.query, input.limit);
      return {
        status: 'completed',
        output: {
          total: result.total,
          memories: result.memories.map((memory) => ({
            id: memory.id,
            type: memory.type,
            layer: memory.layer,
            content: memory.content,
            summary: memory.summary,
            importance: memory.importance,
            tags: memory.tags,
            createdAt: memory.createdAt,
          })),
        },
        evidence: [memoryEvidence(`Searched memories for "${input.query}" (${result.total} result(s))`)],
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        evidence: [],
      };
    }
  }
}

/** Store a memory explicitly (low risk; bounded content). */
export class MemoryStoreTool implements VestaraTool<MemoryStoreInput, MemoryStoreOutput> {
  readonly name = 'memory.store';
  readonly description = 'Store a memory explicitly for later recall';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<MemoryStoreInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', minLength: 1 },
        type: { enum: ['fact', 'preference', 'event', 'decision'] },
        content: { type: 'string', minLength: 1 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['userId', 'type', 'content'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      const type = requiredString(record, 'type');
      if (!['fact', 'preference', 'event', 'decision'].includes(type)) throw new Error(`Invalid memory type: ${type}`);
      return {
        userId: requiredString(record, 'userId'),
        type: type as MemoryStoreInput['type'],
        content: requiredString(record, 'content'),
        tags: optionalStringList(record, 'tags'),
      };
    },
  };

  constructor(private readonly memory: MemoryRuntime) {}

  affectedResources(input: MemoryStoreInput): readonly string[] {
    return [`memory:${input.userId}`];
  }

  async execute(
    input: MemoryStoreInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<MemoryStoreOutput>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const memory = await this.memory.store(input.userId, {
        type: input.type,
        content: input.content,
        tags: input.tags ? [...input.tags] : undefined,
        source: 'tool',
      });
      return {
        status: 'completed',
        output: { id: memory.id, type: memory.type, layer: memory.layer, content: memory.content },
        evidence: [memoryEvidence(`Stored memory ${memory.id} (${memory.type})`)],
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        evidence: [],
      };
    }
  }
}
