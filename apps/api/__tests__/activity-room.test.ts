import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ActivityRoom } from '../src/activity-room';
import { createActivityRoom } from '../src/activity-room';
import { handleActivityRoomRoute } from '../src/routes/activity-room';
import { ROUTE_DEFS } from '../src/server';

async function seedRoom(): Promise<ActivityRoom> {
  const room = createActivityRoom();
  await room.service.project({
    id: 'seed-1',
    type: 'project.phase.changed',
    at: '2026-08-06T12:00:00.000Z',
    actorId: 'workflow-orchestrator',
    authority: 'system',
    workflowId: 'wfo-a',
    payload: { from: 'draft', to: 'executing' },
  });
  await room.service.project({
    id: 'seed-2',
    type: 'task.started',
    at: '2026-08-06T12:00:01.000Z',
    actorId: 'workflow-orchestrator',
    authority: 'system',
    workflowId: 'wfo-a',
    taskId: 'task-1',
    payload: {},
  });
  await room.service.project({
    id: 'seed-3',
    type: 'task.completed',
    at: '2026-08-06T12:00:02.000Z',
    actorId: 'workflow-orchestrator',
    authority: 'system',
    workflowId: 'wfo-a',
    taskId: 'task-1',
    payload: {},
  });
  await room.service.project({
    id: 'seed-4',
    type: 'harness.tool-result',
    at: '2026-08-06T12:00:03.000Z',
    actorId: 'engineer',
    authority: 'agent',
    workflowId: 'wfo-a',
    taskId: 'task-1',
    payload: {
      agentId: 'engineer',
      toolName: 'git.commit',
      status: 'failed',
      error: 'commit failed sk-0123456789abcdef0123456789abcdef012345',
    },
  });
  return room;
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

async function get(room: ActivityRoom, path: string): Promise<{ status: number; body: unknown }> {
  const { res, body, status } = fakeResponse();
  const url = new URL(`http://127.0.0.1:3001${path}`);
  await handleActivityRoomRoute('GET', url.pathname, undefined as never, res, undefined as never, 3001, url, room);
  return { status: status(), body: body() };
}

function fakeRequest(body: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

async function post(room: ActivityRoom, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const { res, body: responseBody, status } = fakeResponse();
  const url = new URL(`http://127.0.0.1:3001${path}`);
  await handleActivityRoomRoute('POST', url.pathname, fakeRequest(body), res, undefined as never, 3001, url, room);
  return { status: status(), body: responseBody() };
}

describe('Activity Room history API', () => {
  it('lists history with a resumable nextSequence and batch span', async () => {
    const room = await seedRoom();
    const { status, body } = await get(room, '/api/activity-room');
    expect(status).toBe(200);
    const records = (body as { records: unknown[] }).records;
    expect(records).toHaveLength(4);
    expect((body as { nextSequence: number }).nextSequence).toBe(5);
    expect((body as { firstSequence: number }).firstSequence).toBe(1);
    expect((body as { lastSequence: number }).lastSequence).toBe(4);
  });

  it('filters by kind and severity without reinterpreting records', async () => {
    const room = await seedRoom();
    const tasks = await get(room, '/api/activity-room?kind=task');
    expect((tasks.body as { records: { kind: string }[] }).records.map((record) => record.kind)).toEqual([
      'task',
      'task',
    ]);

    const success = await get(room, '/api/activity-room?severity=success');
    expect((success.body as { records: { kind: string }[] }).records).toHaveLength(1);

    const errors = await get(room, '/api/activity-room?severity=error');
    expect((errors.body as { records: unknown[] }).records).toHaveLength(1);
  });

  it('resumes from afterSequence with only newer records', async () => {
    const room = await seedRoom();
    const page = await get(room, '/api/activity-room?afterSequence=2');
    const records = (page.body as { records: { sequence: number }[] }).records;
    expect(records.map((record) => record.sequence)).toEqual([3, 4]);
  });

  it('pages deterministically with a limit and sequence cursors', async () => {
    const room = await seedRoom();
    // STREAM-PERF-001: the cursor-less default read is the LATEST bounded window.
    const first = await get(room, '/api/activity-room?limit=2');
    const firstBody = first.body as { records: { sequence: number }[]; nextSequence: number; lastSequence: number };
    expect(firstBody.records.map((record) => record.sequence)).toEqual([3, 4]);
    expect(firstBody.lastSequence).toBe(4);
    // beforeSequence pages into the adjacent older window.
    const older = await get(room, '/api/activity-room?beforeSequence=3&limit=2');
    const olderRecords = (older.body as { records: { sequence: number }[] }).records;
    expect(olderRecords.map((record) => record.sequence)).toEqual([1, 2]);
    // afterSequence resumes forward from a boundary.
    const newer = await get(room, '/api/activity-room?afterSequence=2&limit=2');
    const newerRecords = (newer.body as { records: { sequence: number }[] }).records;
    expect(newerRecords.map((record) => record.sequence)).toEqual([3, 4]);
  });

  it('filters by workflow and agent', async () => {
    const room = await seedRoom();
    const workflow = await get(room, '/api/activity-room?workflowId=wfo-a');
    expect((workflow.body as { records: unknown[] }).records).toHaveLength(4);
    const agent = await get(room, '/api/activity-room?agentId=engineer');
    const records = (agent.body as { records: { kind: string }[] }).records;
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe('agent-message');
  });

  it('returns a single stored record as-is', async () => {
    const room = await seedRoom();
    const page = await get(room, '/api/activity-room');
    const first = (page.body as { records: { id: string }[] }).records[0];
    const single = await get(room, `/api/activity-room/${encodeURIComponent(first.id)}`);
    expect(single.status).toBe(200);
    expect((single.body as { record: { id: string } }).record.id).toBe(first.id);
  });

  it('returns 404 for an unknown activity id', async () => {
    const room = await seedRoom();
    const { status, body } = await get(room, '/api/activity-room/does-not-exist');
    expect(status).toBe(404);
    expect((body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('ignores invalid kind and severity filters and clamps the limit', async () => {
    const room = await seedRoom();
    const filtered = await get(room, '/api/activity-room?kind=bogus&severity=nope&limit=99999');
    const records = (filtered.body as { records: unknown[] }).records;
    expect(records).toHaveLength(4);
  });

  it('exposes only redacted payloads (no re-redaction needed, nothing leaks)', async () => {
    const room = await seedRoom();
    const all = await get(room, '/api/activity-room');
    const serialized = JSON.stringify(all.body);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(serialized).toContain('[REDACTED]');
  });
});

describe('Activity Room messaging (AAR-001E)', () => {
  it('posts an all-agents human message that appears in history', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'Pause implementation and review the current verification failure.',
      targets: [{ type: 'all-agents' }],
    });
    expect(status).toBe(201);
    const record = (body as { record: { kind: string; agentId: string; actor: { type: string } } }).record;
    expect(record.kind).toBe('agent-message');
    expect(record.agentId).toBe('all-agents');
    expect(record.actor.type).toBe('human');

    const page = await get(room, '/api/activity-room');
    const records = (page.body as { records: { id: string }[] }).records;
    expect(records).toHaveLength(5);
  });

  it('posts a direct message to a specific agent', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/agents/engineer/messages', {
      content: 'Please explain the failing comparison.',
    });
    expect(status).toBe(201);
    expect((body as { record: { agentId: string } }).record.agentId).toBe('engineer');
  });

  it('rejects empty content', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: '   ',
      targets: [{ type: 'all-agents' }],
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('EMPTY_CONTENT');
  });

  it('rejects invalid targets', async () => {
    const room = await seedRoom();
    const { status } = await post(room, '/api/messages', {
      content: 'hello',
      targets: [{ type: 'task', taskId: 't-1' }],
    });
    expect(status).toBe(400);
  });

  it('rejects references to unknown activity records', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'hello',
      targets: [{ type: 'all-agents' }],
      referencedActivityIds: ['nope-missing'],
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('UNKNOWN_REFERENCE');
  });

  it('preserves valid referenced activity ids on the appended record', async () => {
    const room = await seedRoom();
    const page = await get(room, '/api/activity-room');
    const known = (page.body as { records: { id: string }[] }).records[0].id;
    const { status, body } = await post(room, '/api/messages', {
      content: 'Referencing an earlier event.',
      targets: [{ type: 'all-agents' }],
      referencedActivityIds: [known],
    });
    expect(status).toBe(201);
    expect((body as { record: { referencedActivityIds: string[] } }).record.referencedActivityIds).toEqual([known]);
  });

  it('redacts secrets from human message content', async () => {
    const room = await seedRoom();
    const { status } = await post(room, '/api/messages', {
      content: 'my token is sk-0123456789abcdef0123456789abcdef012345',
      targets: [{ type: 'all-agents' }],
    });
    expect(status).toBe(201);
    const page = await get(room, '/api/activity-room');
    const serialized = JSON.stringify(page.body);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
  });

  it('assigns the next monotonic sequence to the appended message', async () => {
    const room = await seedRoom();
    const before = await get(room, '/api/activity-room');
    const last = (before.body as { records: { sequence: number }[] }).records.at(-1)?.sequence ?? 0;
    const { status, body } = await post(room, '/api/messages', {
      content: 'sequence check',
      targets: [{ type: 'all-agents' }],
    });
    expect(status).toBe(201);
    expect((body as { record: { sequence: number } }).record.sequence).toBe(last + 1);
  });

  it('records organizational effect and real actor identity on human messages', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'Director authorizes the continuation.',
      targets: [{ type: 'all-agents' }],
      effect: 'authorization',
      actor: { displayName: 'Director', role: 'director' },
      relatesTo: ['activity:evt-1:workflow'],
    });
    expect(status).toBe(201);
    const record = body as {
      record: {
        effect: string;
        relatesTo: string[];
        actor: { displayName: string; role: string; id: string };
        referencedActivityIds?: string[];
      };
    };
    expect(record.record.effect).toBe('authorization');
    expect(record.record.relatesTo).toEqual(['activity:evt-1:workflow']);
    expect(record.record.actor.displayName).toBe('Director');
    expect(record.record.actor.role).toBe('director');
    expect(record.record.actor.id).toBe('director');
  });

  it('ignores an invalid effect and keeps the default actor', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'plain message',
      targets: [{ type: 'all-agents' }],
      effect: 'bogus-effect',
    });
    expect(status).toBe(201);
    const record = (body as { record: { effect?: string; actor: { displayName: string } } }).record;
    expect(record.effect).toBeUndefined();
    expect(record.actor.displayName).toBe('You');
  });

  it('records an append-only correction linked to the original, defaulting to intervention', async () => {
    const room = await seedRoom();
    const page = await get(room, '/api/activity-room');
    const original = (page.body as { records: { id: string }[] }).records[0].id;

    const { status, body } = await post(room, '/api/messages', {
      content: 'Corrected attribution: workflow-orchestrator → Reviewer',
      targets: [{ type: 'all-agents' }],
      correctionOf: original,
      actor: { displayName: 'Director', role: 'director' },
    });
    expect(status).toBe(201);
    const record = body as { record: { correctionOf: string; effect: string; actor: { displayName: string } } };
    expect(record.record.correctionOf).toBe(original);
    expect(record.record.effect).toBe('intervention');
    expect(record.record.actor.displayName).toBe('Director');

    // The original is never mutated (append-only).
    const originalAfter = await get(room, `/api/activity-room/${encodeURIComponent(original)}`);
    expect((originalAfter.body as { record: { actor: { displayName: string } } }).record.actor.displayName).toBe(
      'workflow-orchestrator',
    );
  });

  it('rejects a correction whose target does not exist', async () => {
    const room = await seedRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'correct nothing',
      targets: [{ type: 'all-agents' }],
      correctionOf: 'does-not-exist',
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('UNKNOWN_CORRECTION_TARGET');
  });
});

describe('Activity Room effective state (Direction 2)', () => {
  it('recomputes derived state from durable history (corrections + open items)', async () => {
    const room = await seedRoom();
    const page = await get(room, '/api/activity-room');
    const original = (page.body as { records: { id: string }[] }).records[0].id;

    await post(room, '/api/messages', {
      content: 'Corrected attribution: workflow-orchestrator → Reviewer',
      targets: [{ type: 'all-agents' }],
      correctionOf: original,
      actor: { displayName: 'Director', role: 'director' },
    });
    await post(room, '/api/messages', {
      content: 'Hold on the migration verification',
      targets: [{ type: 'all-agents' }],
      effect: 'hold',
      workflowId: 'wfo-a',
      actor: { displayName: 'Reviewer', role: 'reviewer' },
    });

    const { status, body } = await get(room, '/api/activity-room/state');
    expect(status).toBe(200);
    const state = body as {
      corrections: { originalId: string; correctedBy: string }[];
      open: { effect: string }[];
      needsAttention: number;
    };
    expect(state.corrections.some((c) => c.originalId === original && c.correctedBy === 'Director')).toBe(true);
    expect(state.open.some((item) => item.effect === 'hold')).toBe(true);
    expect(state.needsAttention).toBe(state.open.length);
  });
});

describe('Visual Edit durability (milestone regression)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 've-config-'));
  const repoPath = path.join(tmp, 'repo');

  it('the server dispatches /api/visual-config to the activity-room handler', () => {
    const room = ROUTE_DEFS.find((def) => def.prefixes.includes('/api/activity-room'));
    expect(room).toBeDefined();
    expect(room?.prefixes).toContain('/api/visual-config');
  });

  it('PUT persists and GET returns the same configuration after a cold read', async () => {
    const room = createActivityRoom();
    const ctx = { repoPath } as never;

    // PUT
    const putRes = fakeResponse();
    const putUrl = new URL('http://127.0.0.1:3001/api/visual-config');
    await handleActivityRoomRoute(
      'PUT',
      '/api/visual-config',
      fakeRequest({ overrides: { 'msg-1': { alignment: 'right' } } }),
      putRes.res,
      ctx,
      3001,
      putUrl,
      room,
    );
    expect(putRes.status()).toBe(200);

    // The durable artifact exists on disk.
    const file = path.join(repoPath, '.vestara', 'visual-config.json');
    expect(fs.existsSync(file)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(onDisk.overrides['msg-1'].alignment).toBe('right');

    // GET (a fresh handler call — simulates a cold reload reading the artifact).
    const getRes = fakeResponse();
    const getUrl = new URL('http://127.0.0.1:3001/api/visual-config');
    await handleActivityRoomRoute('GET', '/api/visual-config', undefined as never, getRes.res, ctx, 3001, getUrl, room);
    expect(getRes.status()).toBe(200);
    const body = getRes.body() as { overrides: Record<string, { alignment?: string }> };
    expect(body.overrides['msg-1'].alignment).toBe('right');
  });
});
