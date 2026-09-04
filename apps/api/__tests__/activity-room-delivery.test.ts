import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActivityStreamMessage } from '@vestara/activity-room';
import { FileThreadStore } from '@vestara/thread-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRoom } from '../src/activity-room';
import { createActivityRoom } from '../src/activity-room';
import { markMessageObserved } from '../src/message-receipts';
import { handleActivityRoomRoute } from '../src/routes/activity-room';
import type { WorkspaceContext } from '../src/workspace-context';

/**
 * Activity Room compose-message delivery contract (AAR-001E + human → agent
 * trust model). Verifies the full path from `POST /api/messages` → persisted
 * workflow-scoped record → broadcast to the room → seeded delivery receipts →
 * agent observation — including that a workflow-scoped message wakes the
 * workflow so the current workflow's agents can observe it.
 */

const PARTICIPANTS = [
  { agentId: 'vestara-context', role: 'context' },
  { agentId: 'vestara-planner', role: 'planner' },
  { agentId: 'vestara-developer', role: 'developer' },
  { agentId: 'vestara-verifier', role: 'verifier' },
  { agentId: 'vestara-reviewer', role: 'reviewer' },
];

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

let workflowCounter = 0;

async function setup() {
  // The receipts registry is process-lifetime, so each test gets its own
  // workflow id to keep unread/observation assertions isolated.
  const workflowId = `wf-delivery-${++workflowCounter}`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'act-delivery-'));
  directories.push(directory);
  const threadStore = await FileThreadStore.open(path.join(directory, 'threads.db'));
  PARTICIPANTS.forEach((participant, index) => {
    threadStore.createThread({
      id: `thread-${index}` as never,
      taskId: `task-${index}`,
      title: participant.role,
      environmentId: 'environment-local' as never,
      metadata: {
        agentId: participant.agentId,
        role: participant.role,
        workflowId,
        stageIndex: index,
        runSource: 'multi-agent',
      },
    });
  });
  const resumeIfIdle = vi.fn(async () => ({ resumed: true, threadId: 'thread-0' }));
  const ctx = {
    agentThreadStore: threadStore,
    multiAgentWorkflow: { resumeIfIdle },
  } as unknown as WorkspaceContext;
  const room = createActivityRoom();
  return { directory, threadStore, resumeIfIdle, ctx, room, workflowId };
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse & { headersSent: boolean };
  res.headersSent = false;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(body: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

async function post(
  room: ActivityRoom,
  ctx: WorkspaceContext,
  pathname: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const { res, body: responseBody, status } = fakeResponse();
  const url = new URL(`http://127.0.0.1:3001${pathname}`);
  await handleActivityRoomRoute('POST', url.pathname, fakeRequest(body), res, ctx, 3001, url, room);
  return { status: status(), body: responseBody() };
}

async function get(
  room: ActivityRoom,
  ctx: WorkspaceContext,
  pathname: string,
): Promise<{ status: number; body: unknown }> {
  const { res, body, status } = fakeResponse();
  const url = new URL(`http://127.0.0.1:3001${pathname}`);
  await handleActivityRoomRoute('GET', url.pathname, undefined as never, res, ctx, 3001, url, room);
  return { status: status(), body: body() };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Activity Room compose-message delivery (workflow-scoped)', () => {
  it('persists a broadcast in the workflow scope and broadcasts it to the room', async () => {
    const { ctx, room, workflowId } = await setup();
    const received: ActivityStreamMessage[] = [];
    room.hub.attach('client-1', { send: (message) => received.push(message) });

    const { status, body } = await post(room, ctx, '/api/messages', {
      content: '[delivery] broadcast to the workflow',
      targets: [{ type: 'all-agents' }],
      workflowId: workflowId,
      actor: { displayName: 'Alice' },
    });
    expect(status).toBe(201);
    const record = (body as { record: { id: string; workflowId: string; content: string } }).record;
    expect(record.workflowId).toBe(workflowId);

    // The scoped history (the workflow scope the room is displaying) returns it.
    const scoped = await get(room, ctx, `/api/activity-room?workflowId=${workflowId}`);
    const scopedRecords = (scoped.body as { records: { id: string }[] }).records;
    expect(scopedRecords.map((entry) => entry.id)).toContain(record.id);

    // The live broadcast reached an attached client.
    const broadcast = received.find(
      (message) => message.type === 'activity.appended' && message.activity.id === record.id,
    );
    expect(broadcast).toBeDefined();
  });

  it('seeds a delivery receipt for every participant of the workflow (broadcast visible to all)', async () => {
    const { ctx, room, workflowId } = await setup();
    const { body } = await post(room, ctx, '/api/messages', {
      content: 'informational broadcast',
      targets: [{ type: 'all-agents' }],
      workflowId: workflowId,
      actor: { displayName: 'Alice' },
    });
    const messageId = (body as { record: { id: string } }).record.id;

    const receipts = await get(room, ctx, `/api/activity-room/messages/${messageId}/receipts`);
    const states = (receipts.body as { receipts: { agentId: string; state: string }[] }).receipts;
    expect(states.map((entry) => entry.agentId).sort()).toEqual(PARTICIPANTS.map((p) => p.agentId).sort());
    expect(states.every((entry) => entry.state === 'pending')).toBe(true);
  });

  it('addresses the @mention agent while leaving the rest pending', async () => {
    const { ctx, room, workflowId } = await setup();
    const { body } = await post(room, ctx, '/api/messages', {
      content: '@vestara-developer please fix the comparator',
      targets: [{ type: 'all-agents' }],
      workflowId: workflowId,
      actor: { displayName: 'Alice' },
    });
    const messageId = (body as { record: { id: string } }).record.id;

    const receipts = await get(room, ctx, `/api/activity-room/messages/${messageId}/receipts`);
    const byAgent = new Map(
      (receipts.body as { receipts: { agentId: string; state: string }[] }).receipts.map((entry) => [
        entry.agentId,
        entry.state,
      ]),
    );
    expect(byAgent.get('vestara-developer')).toBe('addressed');
    expect(byAgent.get('vestara-planner')).toBe('pending');
    expect(byAgent.get('vestara-verifier')).toBe('pending');
  });

  it('addresses an explicit composer agent target even without an @mention', async () => {
    const { ctx, room, workflowId } = await setup();
    const { body } = await post(room, ctx, '/api/messages', {
      content: 'direct question for the developer',
      targets: [{ type: 'agent', agentId: 'vestara-developer' }],
      workflowId: workflowId,
      actor: { displayName: 'Alice' },
    });
    const messageId = (body as { record: { id: string } }).record.id;

    const receipts = await get(room, ctx, `/api/activity-room/messages/${messageId}/receipts`);
    const states = (receipts.body as { receipts: { agentId: string; state: string }[] }).receipts;
    expect(states.find((entry) => entry.agentId === 'vestara-developer')?.state).toBe('addressed');
  });

  it('wakes the workflow on a broadcast so the current workflow agents observe it', async () => {
    const { ctx, room, resumeIfIdle, workflowId } = await setup();
    await post(room, ctx, '/api/messages', {
      content: 'broadcast that should wake the workflow',
      targets: [{ type: 'all-agents' }],
      workflowId: workflowId,
      actor: { displayName: 'Alice' },
    });
    await flush();
    expect(resumeIfIdle).toHaveBeenCalledWith(workflowId);
  });

  it('marks an agent observation and reflects it in the receipt state (agent context visibility)', async () => {
    const { ctx, room, workflowId } = await setup();
    const { body } = await post(room, ctx, '/api/messages', {
      content: 'waiting for agents to observe',
      targets: [{ type: 'all-agents' }],
      workflowId: workflowId,
      actor: { displayName: 'Alice' },
    });
    const messageId = (body as { record: { id: string } }).record.id;

    // The harness context assembler marks the message observed when it injects
    // it into the agent's context.
    markMessageObserved(messageId, 'vestara-developer');

    const receipts = await get(room, ctx, `/api/activity-room/messages/${messageId}/receipts`);
    const dev = (
      receipts.body as { receipts: { agentId: string; state: string; observedAt?: string }[] }
    ).receipts.find((entry) => entry.agentId === 'vestara-developer');
    expect(dev?.state).toBe('observed');
    expect(dev?.observedAt).toBeDefined();

    // The workflow aggregate reflects the read receipt (unread dropped for dev).
    const aggregate = await get(room, ctx, `/api/activity-room/workflows/${workflowId}/message-receipts`);
    const unread = (aggregate.body as { unreadByAgent: Record<string, number> }).unreadByAgent;
    expect(unread['vestara-developer'] ?? 0).toBe(0);
    expect(unread['vestara-planner']).toBeGreaterThan(0);
  });

  it('rejects an invalid send with a visible error and never persists it', async () => {
    const { ctx, room, workflowId } = await setup();
    const before = await get(room, ctx, `/api/activity-room?workflowId=${workflowId}`);
    const beforeCount = (before.body as { records: unknown[] }).records.length;

    const { status, body } = await post(room, ctx, '/api/messages', {
      content: '   ',
      targets: [{ type: 'all-agents' }],
      workflowId: workflowId,
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('EMPTY_CONTENT');

    const after = await get(room, ctx, `/api/activity-room?workflowId=${workflowId}`);
    expect((after.body as { records: unknown[] }).records.length).toBe(beforeCount);
  });
});
