import type { Memory, MemoryInput, MemoryRuntime } from '@vestara/memory';
import { describe, expect, it } from 'vitest';
import { MemoryGraphQueryTool, MemoryStoreTool } from '../src/index';

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

function stubMemoryRuntime(): MemoryRuntime {
  const memories: Memory[] = [];
  let seq = 0;
  return {
    async store(userId: string, input: MemoryInput): Promise<Memory> {
      const memory: Memory = {
        id: `m-${++seq}`,
        userId,
        type: input.type,
        layer: 'working',
        content: input.content,
        tags: input.tags ?? [],
        importance: 5,
        source: input.source,
        metadata: input.metadata ?? {},
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      };
      memories.push(memory);
      return memory;
    },
    async search(userId: string, query: string, limit?: number) {
      const matched = memories.filter((memory) => memory.userId === userId && memory.content.includes(query));
      return { memories: matched.slice(0, limit ?? 10), total: matched.length, query };
    },
    async getContext() {
      return [];
    },
    async setImportance() {},
    async consolidate() {
      return { processed: 0, archived: 0, pruned: 0, promoted: 0, duration: 0 };
    },
    async delete() {},
    async stats() {
      return { total: memories.length, byType: {}, byLayer: {}, avgImportance: 0 };
    },
  };
}

describe('MemoryGraphQueryTool', () => {
  it('searches memories and returns matching results', async () => {
    const runtime = stubMemoryRuntime();
    await runtime.store('user-1', { type: 'fact', content: 'db is sqlite', source: 'tool' });
    const tool = new MemoryGraphQueryTool(runtime);

    const result = await tool.execute({ query: 'sqlite', userId: 'user-1' }, CONTEXT);
    expect(result.status).toBe('completed');
    expect(result.output?.total).toBe(1);
    expect(result.output?.memories[0]?.content).toContain('sqlite');
    expect(result.evidence.length).toBe(1);
  });

  it('returns zero results when nothing matches', async () => {
    const runtime = stubMemoryRuntime();
    const tool = new MemoryGraphQueryTool(runtime);
    const result = await tool.execute({ query: 'missing', userId: 'user-1' }, CONTEXT);
    expect(result.status).toBe('completed');
    expect(result.output?.total).toBe(0);
  });
});

describe('MemoryStoreTool', () => {
  it('stores a memory explicitly', async () => {
    const runtime = stubMemoryRuntime();
    const tool = new MemoryStoreTool(runtime);
    const result = await tool.execute(
      { userId: 'user-1', type: 'decision', content: 'use vite', tags: ['build'] },
      CONTEXT,
    );
    expect(result.status).toBe('completed');
    expect(result.output?.content).toBe('use vite');
    expect(result.output?.type).toBe('decision');
  });
});
