import type { KnowledgeEngine } from '@vestara/knowledge';
import { describe, expect, it } from 'vitest';
import { KnowledgeSearchTool } from '../src/index';

const CONTEXT = {
  agentId: 'agent-1',
  taskId: 'task-1',
  environment: {
    id: 'env-1',
    kind: 'local',
    workspaceRoot: '/repo',
    networkPolicy: 'restricted',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  },
  signal: new AbortController().signal,
} as const;

function stubEngine(): KnowledgeEngine {
  return {
    storage: {} as never,
    parser: {} as never,
    chunker: {} as never,
    indexer: {} as never,
    analyzer: {} as never,
    async search(query: string, limit = 20) {
      if (query === 'vite')
        return [
          {
            document: {
              id: 'doc-1',
              uri: '/repo/vite.md',
              title: 'Vite',
              language: 'markdown',
              mimeType: 'text/markdown',
              content: 'vite is a build tool',
              metadata: {},
            },
            chunks: [{ text: 'vite is a build tool' }],
            score: 0.9,
          },
        ].slice(0, limit);
      return [];
    },
    async index() {
      return { documentsIndexed: 0, chunksCreated: 0, duration: 0 };
    },
    analyze() {
      return { name: 'repo', language: 'ts' } as never;
    },
    async getStats() {
      return { documents: 1, chunks: 1 };
    },
  } as unknown as KnowledgeEngine;
}

describe('KnowledgeSearchTool', () => {
  it('searches the knowledge base and returns ranked results', async () => {
    const tool = new KnowledgeSearchTool(stubEngine());
    const result = await tool.execute({ query: 'vite' }, CONTEXT);
    expect(result.status).toBe('completed');
    expect(result.output?.total).toBe(1);
    expect(result.output?.results[0]?.document).toBe('/repo/vite.md');
    expect(result.output?.results[0]?.score).toBe(0.9);
    expect(result.evidence.length).toBe(1);
  });

  it('returns zero results when nothing matches', async () => {
    const tool = new KnowledgeSearchTool(stubEngine());
    const result = await tool.execute({ query: 'nonexistent' }, CONTEXT);
    expect(result.status).toBe('completed');
    expect(result.output?.total).toBe(0);
  });

  it('validates required query input', () => {
    const tool = new KnowledgeSearchTool(stubEngine());
    expect(() => tool.inputSchema.parse({})).toThrow(/query/);
  });
});
