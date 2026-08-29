import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentEnvironmentId, CorrelationId } from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import { FileThreadStore } from '../src/index.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function databasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-thread-'));
  directories.push(directory);
  return path.join(directory, 'threads.db');
}

describe('FileThreadStore', () => {
  it('persists ordered turns and items for restart-safe replay', async () => {
    const dbPath = databasePath();
    const first = await FileThreadStore.open(dbPath);
    const thread = first.createThread({
      taskId: 'TASK-1',
      title: 'Inspect repository',
      environmentId: 'environment-local' as AgentEnvironmentId,
    });
    const turn = first.createTurn({ threadId: thread.id, input: 'Inspect the repository' });
    first.transitionTurn(turn.id, 'reasoning');
    first.appendItem({
      threadId: thread.id,
      turnId: turn.id,
      kind: 'user-message',
      actorId: 'user',
      payload: { content: 'Inspect the repository' },
      correlationId: 'correlation-1' as CorrelationId,
    });
    first.appendItem({
      threadId: thread.id,
      turnId: turn.id,
      kind: 'agent-message',
      actorId: 'developer-01',
      payload: { content: 'Inspection complete' },
      correlationId: 'correlation-1' as CorrelationId,
    });
    first.close();

    const reopened = await FileThreadStore.open(dbPath);
    const replay = reopened.replay(thread.id);
    expect(replay.thread.taskId).toBe('TASK-1');
    expect(replay.turns).toHaveLength(1);
    expect(replay.turns[0]?.state).toBe('reasoning');
    expect(replay.items.map((item) => item.sequence)).toEqual([1, 2]);
    expect(replay.items.map((item) => item.kind)).toEqual(['user-message', 'agent-message']);
    reopened.close();
  });

  it('records terminal outcomes and excludes them from active turns', async () => {
    const store = await FileThreadStore.open(databasePath());
    const thread = store.createThread({
      taskId: 'TASK-2',
      title: 'Cancel work',
      environmentId: 'environment-local' as AgentEnvironmentId,
    });
    const turn = store.createTurn({ threadId: thread.id, input: 'Start work' });
    store.transitionTurn(turn.id, 'cancelled', {
      state: 'cancelled',
      summary: 'Cancelled by user',
      reasonCode: 'cancelled-by-user',
      completedAt: new Date().toISOString(),
    });
    store.updateThreadStatus(thread.id, 'cancelled');

    expect(store.getActiveTurn(thread.id)).toBeUndefined();
    expect(store.getTurn(turn.id)?.outcome?.reasonCode).toBe('cancelled-by-user');
    expect(store.getThread(thread.id)?.status).toBe('cancelled');
    store.close();
  });
});
