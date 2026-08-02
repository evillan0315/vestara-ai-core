import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import { InProcessEventBus } from '@vestara/event-bus';
import type { VestaraEvent } from '@vestara/shared';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createHarnessEngineeringEventBridge,
  harnessEventToAppend,
} from '../src/bridges/harness-engineering-event-bridge.js';

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function identityEvent(overrides: { type?: string; payload?: Record<string, unknown> } = {}): VestaraEvent {
  return {
    id: 'evt-1',
    type: overrides.type ?? 'harness.tool.completed',
    version: 1,
    timestamp: '2026-08-02T10:00:00.000Z',
    source: 'agent-harness',
    actor: { id: 'developer-1', role: 'system' },
    payload: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      runId: 'run-1',
      agentId: 'developer-1',
      correlationId: 'corr-1',
      callId: 'call-1',
      toolName: 'filesystem.read',
      ...(overrides.payload ?? {}),
    },
    metadata: { correlationId: 'corr-1', retryCount: 0, ttl: 60 },
  };
}

describe('harness engineering event bridge', () => {
  it('normalizes a harness event into an event-store append preserving identity', () => {
    const append = harnessEventToAppend(identityEvent(), 'ws-1', 'env-1');
    expect(append.type).toBe('harness.tool.completed');
    expect(append.source).toBe('agent-harness');
    expect(append.actorId).toBe('developer-1');
    expect(append.threadId).toBe('thread-1');
    expect(append.turnId).toBe('turn-1');
    expect(append.correlationId).toBe('corr-1');
    expect(append.payload.runId).toBe('run-1');
    expect(append.authority).toBe('system');
  });

  it('uses the event metadata correlationId when the payload omits it', () => {
    const event = identityEvent({ payload: { correlationId: undefined } });
    const append = harnessEventToAppend(event, 'ws-1', 'env-1');
    expect(append.correlationId).toBe('corr-1');
  });

  it('projects every harness.* event through the bus into the event store', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-bridge-'));
    directories.push(directory);
    const bus = new InProcessEventBus();
    const store = await SqliteEngineeringEventStore.open(path.join(directory, 'events.db'));
    const unsubscribe = createHarnessEngineeringEventBridge({
      eventBus: bus,
      events: store,
      workspaceId: 'ws-1',
      environmentId: 'env-1',
      telemetry: { track: () => {} },
    });
    try {
      await bus.emit(identityEvent());
      await bus.emit(identityEvent({ type: 'harness.outcome.completed', payload: { state: 'completed' } }));
      const stored = store.query({});
      const harnessEvents = stored.filter((event) => event.source === 'agent-harness');
      expect(harnessEvents.map((event) => event.type).sort()).toEqual([
        'harness.outcome.completed',
        'harness.tool.completed',
      ]);
      expect(harnessEvents.every((event) => event.threadId === 'thread-1')).toBe(true);
    } finally {
      unsubscribe();
      store.close();
    }
  });

  it('does not let a store failure break the event bus emit', async () => {
    const bus = new InProcessEventBus();
    const failing = {
      append: () => {
        throw new Error('disk full');
      },
    };
    createHarnessEngineeringEventBridge({
      eventBus: bus,
      events: failing as never,
      workspaceId: 'ws-1',
      environmentId: 'env-1',
      telemetry: { track: () => {} },
    });
    await expect(bus.emit(identityEvent())).resolves.toBeUndefined();
  });
});
