import { InProcessEventBus } from '@vestara/event-bus';
import type { EmitEvent, VestaraEvent } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { createEngineeringMemoryProjection, deriveMemory, type MemoryRuntime } from '../src/index';

function harnessEvent(type: string, overrides: Record<string, unknown> = {}): VestaraEvent {
  return {
    type,
    timestamp: '2026-08-03T00:00:00.000Z',
    source: 'agent-harness',
    actor: { id: 'agent-1', role: 'system' },
    payload: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      agentId: 'agent-1',
      taskId: 'task-1',
      correlationId: 'corr-1',
      ...overrides,
    },
    metadata: { correlationId: 'corr-1' },
  } as VestaraEvent;
}

function recordingMemory(): { memory: MemoryRuntime; stored: MemoryInput[] } {
  const stored: MemoryInput[] = [];
  const memory: MemoryRuntime = {
    async store(_userId: string, input: MemoryInput) {
      stored.push(input);
      return {
        id: `m-${stored.length}`,
        userId: _userId,
        type: input.type,
        layer: 'long-term',
        content: input.content,
        tags: input.tags ?? [],
        importance: 5,
        source: input.source,
        metadata: input.metadata ?? {},
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      };
    },
    async search() {
      return { memories: [], total: 0, query: '' };
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
      return { total: stored.length, byType: {}, byLayer: {}, avgImportance: 0 };
    },
  };
  return { memory, stored };
}

describe('deriveMemory (pure)', () => {
  it('derives a decision memory from a model completion', () => {
    const derivation = deriveMemory(harnessEvent('harness.model.completed', { content: 'Use vite for the build' }));
    expect(derivation?.type).toBe('decision');
    expect(derivation?.layer).toBe('long-term');
    expect(derivation?.content).toContain('vite');
  });

  it('derives a fact memory from a tool completion', () => {
    const derivation = deriveMemory(
      harnessEvent('harness.tool.completed', { callId: 'c1', toolName: 'filesystem.write' }),
    );
    expect(derivation?.type).toBe('fact');
    expect(derivation?.content).toContain('filesystem.write');
  });

  it('derives an event memory from a tool failure', () => {
    const derivation = deriveMemory(harnessEvent('harness.tool.failed', { toolName: 'git', error: 'merge conflict' }));
    expect(derivation?.type).toBe('event');
    expect(derivation?.content).toContain('merge conflict');
  });

  it('derives a decision memory from a completed thread outcome', () => {
    const derivation = deriveMemory(harnessEvent('harness.outcome.completed', { summary: 'Task delivered' }));
    expect(derivation?.type).toBe('decision');
    expect(derivation?.content).toContain('completed');
    expect(derivation?.importance).toBe(9);
  });

  it('derives an event memory from a failed thread outcome', () => {
    const derivation = deriveMemory(
      harnessEvent('harness.outcome.failed', { summary: 'verification failed', reasonCode: 'test-failed' }),
    );
    expect(derivation?.type).toBe('event');
    expect(derivation?.content).toContain('test-failed');
  });

  it('ignores events that do not produce a memory', () => {
    expect(deriveMemory(harnessEvent('harness.steer', { itemId: 'x' }))).toBeUndefined();
  });
});

describe('createEngineeringMemoryProjection', () => {
  it('projects harness events into the memory runtime', async () => {
    const bus = new InProcessEventBus();
    const { memory, stored } = recordingMemory();
    const dispose = createEngineeringMemoryProjection({ eventBus: bus, memory });

    await bus.emit({
      type: 'harness.model.completed',
      source: 'agent-harness',
      actor: { id: 'agent-1', role: 'system' },
      payload: { threadId: 'thread-1', content: 'Adopt pnpm workspaces' },
      metadata: {},
    } as EmitEvent);
    await bus.emit({
      type: 'harness.outcome.completed',
      source: 'agent-harness',
      actor: { id: 'agent-1', role: 'system' },
      payload: { threadId: 'thread-1', summary: 'Migration done' },
      metadata: {},
    } as EmitEvent);

    expect(stored).toHaveLength(2);
    expect(stored[0]?.source).toBe('engineering-thread');
    expect(stored[0]?.type).toBe('decision');
    expect(stored[1]?.type).toBe('decision');
    expect(stored[0]?.metadata?.threadId).toBe('thread-1');

    dispose();
  });

  it('does not store memories for non-harness events', async () => {
    const bus = new InProcessEventBus();
    const { memory, stored } = recordingMemory();
    const dispose = createEngineeringMemoryProjection({ eventBus: bus, memory });

    await bus.emit({
      type: 'runtime:boot.completed',
      source: 'kernel',
      payload: {},
      metadata: {},
    } as EmitEvent);

    expect(stored).toHaveLength(0);
    dispose();
  });
});
