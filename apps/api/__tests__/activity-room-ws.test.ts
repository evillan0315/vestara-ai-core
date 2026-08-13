import type { ActivitySourceEvent, ActivityStreamMessage } from '@vestara/activity-projection';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type { ActivityRoom } from '../src/activity-room';
import { createActivityRoom } from '../src/activity-room';

let room: ActivityRoom;

function taskEvent(id: string, taskId: string): ActivitySourceEvent {
  return {
    id,
    type: 'task.started',
    at: '2026-08-06T12:00:00.000Z',
    actorId: 'workflow-orchestrator',
    authority: 'system',
    workflowId: 'wfo-ws',
    taskId,
    payload: {},
  };
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out waiting for condition');
}

function appended(messages: ActivityStreamMessage[]): number[] {
  return messages
    .filter(
      (message): message is Extract<ActivityStreamMessage, { type: 'activity.appended' }> =>
        message.type === 'activity.appended',
    )
    .map((message) => message.sequence);
}

describe('Activity Room WebSocket transport (AAR-001B)', () => {
  let wss: WebSocketServer;
  let baseUrl: string;

  beforeAll(async () => {
    room = createActivityRoom();
    wss = new WebSocketServer({ port: 0 });
    wss.on('connection', (ws) => {
      let attachedId: string | undefined;
      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        if (parsed.op === 'activity-subscribe') {
          const afterSequence = typeof parsed.afterSequence === 'number' ? parsed.afterSequence : 0;
          attachedId = `activity-${Math.random().toString(36).slice(2)}`;
          // Mirror the gateway handler: attach at the true latest sequence FIRST
          // (so appends during replay stream live), then page the full missed
          // history instead of truncating at a single 1000-record window.
          void (async () => {
            let frontier = afterSequence;
            try {
              frontier = await room.store.lastSequence();
            } catch {
              /* ignore */
            }
            if (ws.readyState === WebSocket.OPEN) {
              room.hub.attach(attachedId, { send: (message) => ws.send(JSON.stringify(message)) }, frontier);
            }
            let cursor = afterSequence;
            for (;;) {
              const page = await room.store.list({ afterSequence: cursor, limit: 1000 });
              if (page.records.length === 0) break;
              if (ws.readyState !== WebSocket.OPEN) return;
              for (const record of page.records) {
                ws.send(JSON.stringify({ type: 'activity.appended', sequence: record.sequence, activity: record }));
              }
              const next = page.nextSequence;
              if (next === undefined) break;
              cursor = next;
            }
          })();
        }
      });
      ws.on('close', () => {
        if (attachedId !== undefined) room.hub.detach(attachedId);
      });
    });
    const address = wss.address() as { port: number };
    baseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    wss.close();
  });

  function openClient(afterSequence = 0): Promise<{ ws: WebSocket; messages: ActivityStreamMessage[] }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${baseUrl}/ws/activity`);
      const messages: ActivityStreamMessage[] = [];
      const timer = setTimeout(() => reject(new Error('connect timeout')), 4000);
      ws.on('open', () => {
        clearTimeout(timer);
        ws.send(JSON.stringify({ op: 'activity-subscribe', afterSequence }));
        resolve({ ws, messages });
      });
      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()) as ActivityStreamMessage);
      });
      ws.on('error', reject);
    });
  }

  it('replays missed history on subscribe and then delivers live broadcasts', async () => {
    room = createActivityRoom();
    await room.service.project(taskEvent('ws-1', 'task-1'));
    const client = await openClient(0);
    await waitFor(async () => appended(client.messages).length === 1);

    await room.service.project(taskEvent('ws-2', 'task-2'));
    await waitFor(async () => appended(client.messages).length === 2);

    expect(appended(client.messages)).toEqual([1, 2]);
    client.ws.close();
  });

  it('recovers missed records after reconnect without duplicates', async () => {
    room = createActivityRoom();
    await room.service.project(taskEvent('ws-a', 'task-a'));
    await room.service.project(taskEvent('ws-b', 'task-b'));

    const first = await openClient(0);
    await waitFor(async () => appended(first.messages).length === 2);
    first.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Record 3 is produced while the client is disconnected.
    await room.service.project(taskEvent('ws-c', 'task-c'));

    // Reconnect at the boundary of the last record the client saw.
    const recovered = await openClient(2);
    await waitFor(async () => appended(recovered.messages).length === 1);
    await room.service.project(taskEvent('ws-d', 'task-d'));
    await waitFor(async () => appended(recovered.messages).length === 2);

    expect(appended(recovered.messages)).toEqual([3, 4]);
    recovered.ws.close();
  });

  it('broadcasts each persisted record exactly once per connected client', async () => {
    room = createActivityRoom();
    await room.service.project(taskEvent('ws-1', 'task-1'));
    const first = await openClient(0);
    const second = await openClient(0);
    await waitFor(async () => appended(first.messages).length >= 1 && appended(second.messages).length >= 1);

    await room.service.project(taskEvent('ws-2', 'task-2'));
    await waitFor(async () => appended(first.messages).length === 2 && appended(second.messages).length === 2);

    expect(appended(first.messages)).toEqual([1, 2]);
    expect(appended(second.messages)).toEqual([1, 2]);
    first.ws.close();
    second.ws.close();
  });

  it('delivers only redacted records over the wire', async () => {
    room = createActivityRoom();
    await room.service.project({
      id: 'ws-secret',
      type: 'harness.model-response',
      at: '2026-08-06T12:00:00.000Z',
      actorId: 'engineer',
      authority: 'agent',
      taskId: 'task-secret',
      payload: { agentId: 'engineer', content: 'token sk-0123456789abcdef0123456789abcdef012345' },
    });
    const client = await openClient(0);
    await waitFor(async () => appended(client.messages).length === 1);
    const serialized = JSON.stringify(client.messages);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(serialized).toContain('[REDACTED]');
    client.ws.close();
  });

  it('delivers live broadcasts when missed history exceeds the 1000-record replay window', async () => {
    room = createActivityRoom();
    // Seed more records than the per-page limit so replay must page and the hub
    // checkpoint must be the true frontier (not the 1000th record's sequence).
    for (let i = 0; i < 1500; i++) {
      await room.service.project(taskEvent(`ws-bulk-${i}`, `task-bulk-${i}`));
    }
    const client = await openClient(0);
    // Replay must deliver more than a single page.
    await waitFor(async () => appended(client.messages).length >= 1000);
    // A record appended after subscribe must still arrive. With the old
    // single-window replay the hub checkpoint lagged the frontier and this
    // record was held as an out-of-order gap and silently dropped.
    await room.service.project(taskEvent('ws-live', 'task-live'));
    await waitFor(async () => appended(client.messages).includes(1501));
    client.ws.close();
  });
});
