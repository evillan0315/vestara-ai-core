/**
 * @vestara/tools-knowledge — Knowledge search tool
 *
 * Searches the indexed knowledge base through the injected KnowledgeEngine.
 * Low risk (read-only search). Integrates with the ToolRuntime for
 * permission-gated execution.
 *
 * Architecture Traceability:
 *   Foundation: TOOL-CATALOG.md → T-00x knowledge
 */

import type { KnowledgeEngine } from '@vestara/knowledge';
import type { ToolExecutionContext, ToolExecutionResult, ToolInputSchema, VestaraTool } from '@vestara/tool-runtime';
import type { EvidenceArtifact } from '@vestara/types';

export const version = '0.1.0';

export interface KnowledgeSearchInput {
  readonly query: string;
  readonly limit?: number;
}

export interface KnowledgeSearchOutput {
  readonly total: number;
  readonly results: Array<{
    readonly document: string;
    readonly score: number;
    readonly chunkCount: number;
  }>;
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

function knowledgeEvidence(summary: string): EvidenceArtifact {
  return {
    id: `knowledge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'custom',
    summary,
    metadata: { operation: 'knowledge.search' },
  };
}

/** Search the indexed knowledge base (low risk, read-only). */
export class KnowledgeSearchTool implements VestaraTool<KnowledgeSearchInput, KnowledgeSearchOutput> {
  readonly name = 'knowledge.search';
  readonly description = 'Search the indexed repository knowledge base';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<KnowledgeSearchInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    parse(input) {
      const record = recordInput(input);
      return {
        query: requiredString(record, 'query'),
        limit: optionalNumber(record, 'limit'),
      };
    },
  };

  constructor(private readonly engine: KnowledgeEngine) {}

  affectedResources(): readonly string[] {
    return ['knowledge'];
  }

  async execute(
    input: KnowledgeSearchInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<KnowledgeSearchOutput>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    try {
      const results = await this.engine.search(input.query, input.limit);
      return {
        status: 'completed',
        output: {
          total: results.length,
          results: results.map((result) => ({
            document: result.document.uri,
            score: result.score,
            chunkCount: result.chunks.length,
          })),
        },
        evidence: [knowledgeEvidence(`Searched knowledge for "${input.query}" (${results.length} result(s))`)],
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
