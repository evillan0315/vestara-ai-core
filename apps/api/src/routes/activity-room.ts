import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import type {
  ActivityOrganizationalEffect,
  ActivityRecord,
  AgentMessageActivity,
  MessageTarget,
} from '@vestara/activity-projection';
import { projectEffectiveState, toActivityBatch } from '@vestara/activity-projection';
import type { ActivityRoom } from '../activity-room';
import { getActivityRoom } from '../activity-room';
import { json } from '../http/response';
import * as messageReceipts from '../message-receipts';
import type { WorkspaceContext } from '../workspace-context';

const ACTIVITY_KIND_VALUES = new Set(['workflow', 'task', 'agent-message', 'test', 'verification']);
const SEVERITY_VALUES = new Set(['info', 'success', 'warning', 'error']);

const EFFECT_VALUES = new Set<ActivityOrganizationalEffect>([
  'message',
  'finding',
  'recommendation',
  'decision',
  'authorization',
  'intervention',
  'handoff',
  'closure',
  'recognition',
  'hold',
]);

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;
const MAX_MESSAGE_LENGTH = 4000;
/** Inline preview budget for timeline records (STREAM-PERF: raw details are lazy). */
const PREVIEW_BUDGET = 400;

/**
 * Project a stored record for the timeline list: large agent content is
 * truncated to a preview budget and flagged `hasDetails`, so the primary
 * timeline never transfers/renders 30 KB transcripts. The full raw record is
 * served on demand by `GET /api/activity-room/:id`.
 */
export function projectActivity(record: ActivityRecord): ActivityRecord & { hasDetails?: boolean } {
  if (record.kind !== 'agent-message') return record;
  const content = record.content ?? '';
  if (content.length <= PREVIEW_BUDGET) return record;
  const slice = content.slice(0, PREVIEW_BUDGET);
  const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  const cut = boundary > PREVIEW_BUDGET * 0.5 ? slice.slice(0, boundary) : slice;
  return { ...record, content: `${cut}…`, hasDetails: true };
}

function integer(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : undefined;
}

function string(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

/** Parse query parameters into a validated ActivityQuery (unknown filters ignored). */
export function parseActivityQuery(url: URL): import('@vestara/activity-projection').ActivityQuery {
  const params = url.searchParams;
  const kind = string(params.get('kind'));
  const severity = string(params.get('severity'));
  const limit = integer(params.get('limit'));
  return {
    workflowId: string(params.get('workflowId')),
    sessionId: string(params.get('sessionId')),
    taskId: string(params.get('taskId')),
    agentId: string(params.get('agentId')),
    kind:
      kind !== undefined && ACTIVITY_KIND_VALUES.has(kind)
        ? (kind as import('@vestara/activity-projection').ActivityKind)
        : undefined,
    severity:
      severity !== undefined && SEVERITY_VALUES.has(severity)
        ? (severity as import('@vestara/activity-projection').ActivitySeverity)
        : undefined,
    afterSequence: integer(params.get('afterSequence')),
    beforeSequence: integer(params.get('beforeSequence')),
    limit: limit !== undefined ? Math.max(1, Math.min(MAX_LIMIT, limit)) : DEFAULT_LIMIT,
  };
}

/**
 * Activity Room history + messaging API. Serializes stored typed records as-is —
 * the projection layer owns normalization and redaction. A human message is a
 * conversation event, never an authorized action (AAR-001E authority boundary):
 * it is appended as an `agent-message` activity with a `human` actor and flows
 * through the same sequence/persist/broadcast pipeline as projected events.
 */
export async function handleActivityRoomRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  url: URL,
  room: ActivityRoom = getActivityRoom(),
): Promise<boolean> {
  if (method === 'GET' && p === '/api/activity-room') {
    const query = parseActivityQuery(url);
    // STREAM-PERF-001: initial load is the LATEST bounded window, not the oldest
    // history. Explicit cursors (beforeSequence/afterSequence) pass through.
    let effective = query;
    if (query.afterSequence === undefined && query.beforeSequence === undefined) {
      const last = await room.store.lastSequence();
      effective = { ...query, afterSequence: Math.max(0, last - (query.limit ?? DEFAULT_LIMIT)) };
    }
    const page = await room.store.list(effective);
    const batch = toActivityBatch(page.records);
    json(res, 200, {
      firstSequence: batch.firstSequence,
      lastSequence: batch.lastSequence,
      records: batch.records.map(projectActivity),
      nextSequence: page.nextSequence,
    });
    return true;
  }

  // Effective state — a live recompute over the durable history (Direction 2).
  // History is authoritative; this projection is derived and never persisted.
  if (method === 'GET' && p === '/api/activity-room/state') {
    const page = await room.store.list(parseActivityQuery(url));
    json(res, 200, projectEffectiveState(page.records));
    return true;
  }

  // Visual Edit durability — the declarative visual configuration survives
  // reload/restart. The durable representation, not transient DOM state, is
  // responsible for reconstruction.
  if (p === '/api/visual-config') {
    const configFile = path.join(ctx.repoPath, '.vestara', 'visual-config.json');
    if (method === 'GET') {
      let overrides = {};
      try {
        if (fs.existsSync(configFile)) {
          const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { overrides?: unknown };
          overrides = parsed.overrides ?? {};
        }
      } catch {
        /* corrupt or missing — start empty */
      }
      json(res, 200, { overrides });
      return true;
    }
    if (method === 'PUT') {
      let body: unknown;
      try {
        body = JSON.parse((await readBody(req)) || '{}') as unknown;
      } catch {
        json(res, 400, { error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } });
        return true;
      }
      try {
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        fs.writeFileSync(configFile, JSON.stringify(body ?? {}, null, 2));
        json(res, 200, { ok: true });
      } catch (error) {
        json(res, 500, {
          error: { code: 'PERSIST_FAILED', message: error instanceof Error ? error.message : 'Failed to persist' },
        });
      }
      return true;
    }
  }

  if (method === 'POST' && p === '/api/messages') {
    const body = await parseBody(req);
    if (await handleMessageCommand(ctx, res, body)) return true;
    const record = await sendActivityMessage(room, res, undefined, body);
    if (record) {
      registerReceiptsForMessage(ctx, record);
      void maybeWakeAddressedAgent(ctx, record);
    }
    return true;
  }

  const direct = p.match(/^\/api\/agents\/([^/]+)\/messages$/);
  if (method === 'POST' && direct !== null) {
    const agentId = decodeURIComponent(direct[1]);
    const body = await parseBody(req);
    const record = await sendActivityMessage(room, res, agentId, body);
    if (record) {
      registerReceiptsForMessage(ctx, record, agentId);
      void maybeWakeAddressedAgent(ctx, record, agentId);
    }
    return true;
  }

  // Message delivery/observation receipts (the human → agent trust model).
  const receiptsMatch = p.match(/^\/api\/activity-room\/messages\/([^/]+)\/receipts$/);
  if (method === 'GET' && receiptsMatch !== null) {
    const messageId = decodeURIComponent(receiptsMatch[1]);
    const record = await room.store.get(messageId);
    if (record === null) {
      json(res, 404, { error: { code: 'NOT_FOUND', message: `Message not found: ${messageId}` } });
      return true;
    }
    json(res, 200, { messageId, receipts: messageReceipts.receiptsForMessage(messageId) });
    return true;
  }

  // Aggregated message receipts + unread counts for a workflow (used for the
  // participant unread badges and the attention bar).
  const workflowReceiptsMatch = p.match(/^\/api\/activity-room\/workflows\/([^/]+)\/message-receipts$/);
  if (method === 'GET' && workflowReceiptsMatch !== null) {
    const workflowId = decodeURIComponent(workflowReceiptsMatch[1]);
    json(res, 200, {
      workflowId,
      receiptsByMessage: messageReceipts.receiptsForWorkflow(workflowId),
      unreadByAgent: messageReceipts.unreadCountsForWorkflow(workflowId),
    });
    return true;
  }

  const single = p.match(/^\/api\/activity-room\/([^/]+)$/);
  if (method === 'GET' && single !== null) {
    const activityId = decodeURIComponent(single[1]);
    const record = await room.store.get(activityId);
    if (record === null) {
      json(res, 404, { error: { code: 'NOT_FOUND', message: `Activity not found: ${activityId}` } });
      return true;
    }
    json(res, 200, { record });
    return true;
  }

  return false;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Read + parse the request body once (callers must not read the stream again). */
async function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const raw = await readBody(req);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Workflow control-plane commands (`/resume`, `/verify`, `/pause`, `/stop`)
 * are intercepted here rather than becoming conversational messages. `resume`
 * and `verify` continue the workflow chain; pause/stop are acknowledged (full
 * in-flight cancellation is not yet available). Returns true when handled.
 */
async function handleMessageCommand(
  ctx: WorkspaceContext,
  res: http.ServerResponse,
  body: Record<string, unknown>,
): Promise<boolean> {
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const match = /^\/(resume|verify|pause|stop)(\s|$)/i.exec(content);
  if (!match) return false;
  const command = match[1].toLowerCase();
  const workflowId = typeof body.workflowId === 'string' ? body.workflowId : '';
  if ((command === 'resume' || command === 'verify') && !workflowId) {
    json(res, 400, { error: { code: 'MISSING_WORKFLOW', message: `/workflowId is required for /${command}` } });
    return true;
  }
  if (command === 'resume' || command === 'verify') {
    try {
      const resumedThreadId = await ctx.multiAgentWorkflow.resume(workflowId);
      json(res, 200, { ok: true, command, workflowId, resumedThreadId });
    } catch (error) {
      json(res, 500, {
        error: { code: 'CONTROL_FAILED', message: error instanceof Error ? error.message : 'Failed to resume' },
      });
    }
    return true;
  }
  json(res, 200, {
    ok: false,
    command,
    message: `/${command} is not yet supported for running workflows.`,
  });
  return true;
}
function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseEffect(value: unknown): ActivityOrganizationalEffect | undefined {
  return typeof value === 'string' && EFFECT_VALUES.has(value as ActivityOrganizationalEffect)
    ? (value as ActivityOrganizationalEffect)
    : undefined;
}

function parseTargets(value: unknown): readonly MessageTarget[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const targets: MessageTarget[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') return undefined;
    const type = (entry as { type?: unknown }).type;
    if (type === 'all-agents') {
      targets.push({ type: 'all-agents' });
    } else if (type === 'agent') {
      const agentId = stringField((entry as { agentId?: unknown }).agentId);
      if (agentId === undefined) return undefined;
      targets.push({ type: 'agent', agentId });
    } else {
      return undefined;
    }
  }
  return targets;
}

/** Validates and appends a human message, broadcasting it to the room. */
async function sendActivityMessage(
  room: ActivityRoom,
  res: http.ServerResponse,
  directAgentId: string | undefined,
  body: Record<string, unknown>,
): Promise<AgentMessageActivity | null> {
  if (Object.keys(body).length === 0) {
    json(res, 400, { error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } });
    return null;
  }

  const record = body;
  const content = stringField(record.content);
  if (content === undefined) {
    json(res, 400, { error: { code: 'EMPTY_CONTENT', message: 'content is required' } });
    return null;
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    json(res, 400, {
      error: { code: 'CONTENT_TOO_LONG', message: `content exceeds ${MAX_MESSAGE_LENGTH} characters` },
    });
    return null;
  }

  let targets: readonly MessageTarget[];
  if (directAgentId !== undefined) {
    targets = [{ type: 'agent', agentId: directAgentId }];
  } else {
    const parsed = parseTargets(record.targets);
    if (parsed === undefined) {
      json(res, 400, {
        error: { code: 'INVALID_TARGETS', message: 'targets must be [all-agents] or [agent { agentId }]' },
      });
      return null;
    }
    targets = parsed;
  }

  const referenced = Array.isArray(record.referencedActivityIds)
    ? record.referencedActivityIds.filter((entry): entry is string => typeof entry === 'string')
    : [];
  for (const activityId of referenced) {
    if ((await room.store.get(activityId)) === null) {
      json(res, 400, { error: { code: 'UNKNOWN_REFERENCE', message: `Referenced activity not found: ${activityId}` } });
      return null;
    }
  }

  const allAgents = targets.some((target) => target.type === 'all-agents');
  const agentTarget = targets.find((target): target is { type: 'agent'; agentId: string } => target.type === 'agent');
  const agentId = allAgents ? 'all-agents' : (agentTarget?.agentId ?? 'all-agents');

  const actorInput = record.actor;
  const actorName = stringField((actorInput as { displayName?: unknown } | null)?.displayName) ?? 'You';
  const actorRole = stringField((actorInput as { role?: unknown } | null)?.role);
  const effect = parseEffect(record.effect);
  const relatesTo = Array.isArray(record.relatesTo)
    ? record.relatesTo.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
  const correctionOf = stringField(record.correctionOf);

  // A correction is an append-only organizational act: it references an
  // existing record and never mutates it. Default its effect to intervention.
  if (correctionOf !== undefined && (await room.store.get(correctionOf)) === null) {
    json(res, 400, {
      error: { code: 'UNKNOWN_CORRECTION_TARGET', message: `Corrected activity not found: ${correctionOf}` },
    });
    return null;
  }
  const effectiveEffect = effect ?? (correctionOf !== undefined ? 'intervention' : undefined);

  const message: AgentMessageActivity = {
    id: `activity:msg:${randomUUID()}`,
    sequence: 0,
    timestamp: new Date().toISOString(),
    actor: {
      type: 'human',
      id: actorName.toLowerCase().replace(/\s+/g, '-'),
      displayName: actorName,
      ...(actorRole ? { role: actorRole } : {}),
    },
    kind: 'agent-message',
    agentId,
    messageKind: 'message',
    content,
    workflowId: stringField(record.workflowId),
    sessionId: stringField(record.sessionId),
    evidenceRefs: [],
    ...(effectiveEffect !== undefined ? { effect: effectiveEffect } : {}),
    ...(correctionOf !== undefined ? { correctionOf } : {}),
    ...(relatesTo.length > 0 ? { relatesTo } : {}),
    ...(referenced.length > 0 ? { referencedActivityIds: referenced } : {}),
  };

  try {
    const appended = (await room.service.appendActivity(message)) as AgentMessageActivity;
    json(res, 201, { record: appended });
    return appended;
  } catch (error) {
    json(res, 500, {
      error: { code: 'APPEND_FAILED', message: error instanceof Error ? error.message : 'Failed to append message' },
    });
    return null;
  }
}

/**
 * Seed delivery receipts for a human message across the workflow's participant
 * agents. Direct agent messages address only that agent; otherwise addressing
 * follows @mentions parsed from the content.
 */
function registerReceiptsForMessage(ctx: WorkspaceContext, record: AgentMessageActivity, forcedAgentId?: string): void {
  const workflowId = record.workflowId;
  const participantAgentIds: string[] = [];
  const agentRoles = new Map<string, string>();
  if (workflowId) {
    for (const thread of ctx.agentThreadStore.listThreads()) {
      if (thread.metadata?.workflowId !== workflowId) continue;
      const agentId = String(thread.metadata?.agentId ?? '');
      if (!agentId) continue;
      participantAgentIds.push(agentId);
      agentRoles.set(agentId, String(thread.metadata?.role ?? ''));
    }
  }
  if (participantAgentIds.length === 0 && forcedAgentId) participantAgentIds.push(forcedAgentId);
  const forced = forcedAgentId ? new Set([forcedAgentId]) : undefined;
  messageReceipts.registerMessage(record, participantAgentIds, agentRoles, forced);
}

/**
 * @mention scheduling: when a human message is addressed to an agent and the
 * workflow is idle (no turn in progress), wake the chain so the addressed
 * agent can begin/continue. Best-effort and never interrupts an active run.
 */
async function maybeWakeAddressedAgent(
  ctx: WorkspaceContext,
  record: AgentMessageActivity,
  forcedAgentId?: string,
): Promise<void> {
  const workflowId = record.workflowId;
  if (!workflowId) return;
  const content = record.content ?? '';
  // Wake when the message addresses someone (a direct agent message or an
  // @mention in the content); broadcast-only messages leave the chain as-is.
  const mentioned = /\B@[\w-]+/.test(content);
  if (!mentioned && forcedAgentId === undefined) return;
  try {
    await ctx.multiAgentWorkflow.resumeIfIdle(workflowId);
  } catch {
    /* waking is best-effort */
  }
}
