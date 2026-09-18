import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import type {
  ActivityOrganizationalEffect,
  ActivityRecord,
  AgentMessageActivity,
  MessageTarget,
} from '@vestara/activity-room';
import {
  ACTIVITY_KINDS,
  fromAgentLifecycle,
  fromHumanMessage,
  projectEffectiveState,
  toActivityBatch,
  triggerAssistantTurn,
} from '@vestara/activity-room';
import type { ActivityRoom } from '../activity-room';
import { getActivityRoom } from '../activity-room';
import { json } from '../http/response';
import * as messageReceipts from '../message-receipts';
import type { WorkspaceContext } from '../workspace-context';

/** Canonical kind allowlist — single-sourced from @vestara/activity-room to prevent drift. */
const ACTIVITY_KIND_VALUES = new Set<string>(ACTIVITY_KINDS);
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
export function parseActivityQuery(url: URL): import('@vestara/activity-room').ActivityQuery {
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
        ? (kind as import('@vestara/activity-room').ActivityKind)
        : undefined,
    severity:
      severity !== undefined && SEVERITY_VALUES.has(severity)
        ? (severity as import('@vestara/activity-room').ActivitySeverity)
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
    const parsed = await parseBody(req);
    if (!parsed.ok) {
      json(res, 400, { error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } });
      return true;
    }
    const body = parsed.body;
    if (await handleMessageCommand(ctx, res, body)) return true;
    const record = await sendActivityMessage(ctx, room, res, undefined, body);
    if (record) {
      void maybeWakeAddressedAgent(ctx, record);
      // Single M9 writer per message: a turn-triggering message is projected
      // into M9 by the EventBus bridge (same logical message, eventId
      // `human.message:<convMsgId>`), so the direct legacy mirror below must
      // be skipped — otherwise one submission yields two M9 records under two
      // eventIds with identical content (duplicate-message defect). Messages
      // with no turn keep the direct mirror as their only M9 path.
      const triggersTurn = isTurnProjected(record.agentId);
      if (!triggersTurn) {
        void mirrorHumanMessageToM9(record);
      }
      // AR-006: Trigger an agent turn for targeted messages from addressable
      // agents only. Non-addressable targets (browser/coder/unknown) produce
      // NO turn — never fall back to Assistant (AR Convergence step 3).
      if (triggersTurn) {
        const executionConfig =
          body.executionConfig && typeof body.executionConfig === 'object'
            ? (body.executionConfig as { maxToolCalls?: number; turnTimeoutMs?: number })
            : undefined;
        const turnAgentId = record.agentId;
        const surface = surfaceOf(body);
        void triggerAssistantTurn({
          agentId: turnAgentId,
          humanRecord: record,
          service: room.service,
          conversationService: ctx.conversationService,
          agentStorage: ctx.agents,
          ...(executionConfig ? { executionConfig } : {}),
          ...(surface ? { surface } : {}),
        })
          .then((result) => {
            // Mirror completed turn replies into M9 so they appear on the
            // M11C surface (the legacy append above is M11C-invisible).
            if (result.status === 'completed' && result.content) {
              void mirrorAgentReplyToM9(turnAgentId, result.content);
            }
          })
          .catch(() => {
            /* turn failures are already captured in the result */
          });
      }
    }
    return true;
  }

  const direct = p.match(/^\/api\/agents\/([^/]+)\/messages$/);
  if (method === 'POST' && direct !== null) {
    const agentId = decodeURIComponent(direct[1]);
    const parsed = await parseBody(req);
    if (!parsed.ok) {
      json(res, 400, { error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } });
      return true;
    }
    const body = parsed.body;
    const record = await sendActivityMessage(ctx, room, res, agentId, body);
    if (record) {
      void maybeWakeAddressedAgent(ctx, record);
      // Single M9 writer per message (see /api/messages above): a direct
      // message to a turn-capable agent is bridge-projected via its turn.
      const triggersTurn = isTurnProjected(agentId);
      if (!triggersTurn) {
        void mirrorHumanMessageToM9(record);
      }
      // AR-006: Trigger an agent turn for direct agent messages — forward executionConfig when provided
      if (triggersTurn) {
        const executionConfig =
          body.executionConfig && typeof body.executionConfig === 'object'
            ? (body.executionConfig as { maxToolCalls?: number; turnTimeoutMs?: number })
            : undefined;
        const surface = surfaceOf(body);
        void triggerAssistantTurn({
          agentId,
          humanRecord: record,
          service: room.service,
          conversationService: ctx.conversationService,
          agentStorage: ctx.agents,
          ...(executionConfig ? { executionConfig } : {}),
          ...(surface ? { surface } : {}),
        })
          .then((result) => {
            if (result.status === 'completed' && result.content) {
              void mirrorAgentReplyToM9(agentId, result.content);
            }
          })
          .catch(() => {
            /* turn failures are already captured in the result */
          });
      }
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
async function parseBody(
  req: http.IncomingMessage,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> {
  try {
    const raw = await readBody(req);
    if (!raw) return { ok: true, body: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false };
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

/**
 * AR-REPLY-003: resolve a referenced activity across both canonical
 * namespaces. The legacy ActivityStore owns `activity:msg:*` records;
 * the M11A M9 store owns `act-<seq>-*` records mirrored from external
 * surfaces (Telegram/Instagram) and composer traffic. The M11C surface
 * displays M11A projection ids verbatim, so validation must resolve them
 * where they were minted. Unknown in both namespaces stays a 400 —
 * validation is extended, never weakened.
 */
export async function referenceExists(room: ActivityRoom, activityId: string): Promise<boolean> {
  if ((await room.store.get(activityId)) !== null) return true;
  try {
    const { getM11ARoom } = await import('./activity-room-m11a.js');
    return (await getM11ARoom().store.getByActivityId(activityId)) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Client/surface attribution from the message body (e.g. 'workspace-ui').
 * Attested by the sending surface; informational only — never principal
 * identity, never authorship. Absent → UNKNOWN (never manufactured).
 */
function surfaceOf(body: Record<string, unknown>): string | undefined {
  return stringField(body.surface);
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
  ctx: WorkspaceContext,
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
    if (!(await referenceExists(room, activityId))) {
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
  if (correctionOf !== undefined && !(await referenceExists(room, correctionOf))) {
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
    // Seed delivery/observation receipts BEFORE the response is written, so the
    // sender's first receipt fetch (and the live WS item) already observes them.
    // Best-effort: a receipt-seeding failure must not fail an appended message.
    try {
      registerReceiptsForMessage(ctx, appended, directAgentId);
    } catch {
      /* receipt seeding is best-effort */
    }
    json(res, 201, { record: appended });
    // M11C visibility is handled by the caller (see the turn-predicate
    // mirror below): messages that trigger a conversation-runtime turn are
    // projected into M9 by the EventBus bridge (`conversation:message.sent`
    // → `human.message:<convMsgId>`); only messages with no turn use the
    // direct legacy→M9 mirror. Mirroring in both places manufactured a
    // second M9 record under a different eventId for one submission.
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
 * agents. A message explicitly targeted at one agent (a composer agent target
 * or the direct `/api/agents/:id/messages` route) addresses that agent; an
 * @mention in the content addresses the mentioned agent; a broadcast leaves
 * every participant pending until their harness turn observes the message.
 */
function registerReceiptsForMessage(ctx: WorkspaceContext, record: AgentMessageActivity, forcedAgentId?: string): void {
  const workflowId = record.workflowId;
  const participantAgentIds: string[] = [];
  const agentRoles = new Map<string, string>();
  // The thread store is optional in tests; without it receipts simply seed from
  // the explicit target/mention rather than the full participant roster.
  if (workflowId && ctx?.agentThreadStore) {
    for (const thread of ctx.agentThreadStore.listThreads()) {
      if (thread.metadata?.workflowId !== workflowId) continue;
      const agentId = String(thread.metadata?.agentId ?? '');
      if (!agentId) continue;
      participantAgentIds.push(agentId);
      agentRoles.set(agentId, String(thread.metadata?.role ?? ''));
    }
  }
  if (participantAgentIds.length === 0 && forcedAgentId) participantAgentIds.push(forcedAgentId);
  const forced = new Set<string>();
  if (forcedAgentId) forced.add(forcedAgentId);
  // An explicit agent target (composer sidebar target) addresses that agent
  // even without an @mention in the content.
  if (record.agentId !== undefined && record.agentId !== 'all-agents') forced.add(record.agentId);
  messageReceipts.registerMessage(record, participantAgentIds, agentRoles, forced.size > 0 ? forced : undefined);
}

/**
 * Agent ids that take conversation-runtime turns when a composer message
 * targets them (@assistant, @context, @planner, @developer, @reviewer,
 * @verifier). Addressability contract (AR Convergence step 2):
 * - assistant/context/planner/developer/reviewer/verifier = addressable
 * - browser/coder/all-agents/unknown = NOT addressable (no turn, no fallback)
 * Step 3 removed the silent Assistant fallback: a non-addressable target
 * must never impersonate another agent.
 */
const TURN_CAPABLE_AGENTS = new Set([
  'agent-assistant',
  'agent-context',
  'agent-planner',
  'agent-developer',
  'agent-reviewer',
  'agent-verifier',
]);

/**
 * Whether a human record's M9 projection is owned by the EventBus bridge
 * (exactly the condition that triggers a conversation-runtime turn for it).
 * The bridge ingests the turn's `conversation:message.sent` under eventId
 * `human.message:<convMsgId>`; a turn-projected message must therefore skip
 * the direct legacy→M9 mirror (eventId `human.message:<legacyId>`), or one
 * submission becomes two M9 records. Non-turn messages keep the mirror as
 * their only M9 path. Identity-based (agent target), never content-based:
 * two intentionally identical submissions still yield two records each.
 */
function isTurnProjected(agentId: string | undefined): boolean {
  return agentId !== undefined && TURN_CAPABLE_AGENTS.has(agentId);
}

/** Display names and roles for turn-capable agents (registry fallback). */
const TURN_AGENT_IDENTITY: Record<string, { displayName: string; role: string }> = {
  'agent-assistant': { displayName: 'Assistant', role: 'assistant' },
  'agent-context': { displayName: 'Context', role: 'context' },
  'agent-developer': { displayName: 'Developer', role: 'developer' },
  'agent-reviewer': { displayName: 'Reviewer', role: 'reviewer' },
  'agent-planner': { displayName: 'Planner', role: 'planning' },
  'agent-verifier': { displayName: 'Verifier', role: 'verifier' },
};

/**
 * Phase A observability for the legacy→M9 bridge (dual-store convergence).
 * Counts successes/failures so silent `catch→warn` loss becomes visible in
 * logs and (via M11A snapshot debug) in the room. Never throws: a mirror
 * failure must not fail an appended message.
 */
export const m9MirrorStats = {
  humanOk: 0,
  humanFailed: 0,
  replyOk: 0,
  replyFailed: 0,
  lastErrorAt: null as string | null,
  lastMessageId: null as string | null,
};

function recordMirrorFailure(messageId: string | null, error: unknown): void {
  m9MirrorStats.lastErrorAt = new Date().toISOString();
  m9MirrorStats.lastMessageId = messageId;
  console.warn(
    '[activity-room] M9 mirror failed:',
    messageId ?? 'unknown',
    error instanceof Error ? error.message : error,
  );
}

/**
 * Mirror a completed agent turn reply into the M9 durable store via the
 * canonical `fromAgentLifecycle` adapter, so the reply appears on the M11C
 * surface (the turn's legacy append is M11C-invisible). Best-effort: throws
 * nothing; failures are counted + logged.
 */
async function mirrorAgentReplyToM9(agentId: string, content: string): Promise<void> {
  const attempt = async (): Promise<void> => {
    const { getM11ARoom } = await import('./activity-room-m11a.js');
    const identity = TURN_AGENT_IDENTITY[agentId] ?? { displayName: agentId, role: agentId };
    await getM11ARoom().store.append(
      fromAgentLifecycle({
        agentId,
        displayName: identity.displayName,
        lifecycleType: 'completed',
        message: content,
        role: identity.role,
      }),
    );
  };
  try {
    await attempt();
    m9MirrorStats.replyOk += 1;
  } catch (error) {
    try {
      await attempt();
      m9MirrorStats.replyOk += 1;
    } catch (retryError) {
      m9MirrorStats.replyFailed += 1;
      recordMirrorFailure(null, retryError instanceof Error ? retryError : error);
    }
  }
}

/**
 * Mirror a composer human message into the M9 durable store via the canonical
 * `fromHumanMessage` adapter. The M11A watcher picks it up, projects it
 * (`human.message` → conversation, primary), and broadcasts it live over M11B,
 * so the M11C surface shows the sent message. The legacy record id seeds the
 * M9 eventId for stable deduplication across retries. Best-effort: throws
 * nothing (M11A may be uninitialized in tests); failures are counted + logged.
 */
async function mirrorHumanMessageToM9(appended: AgentMessageActivity): Promise<void> {
  const attempt = async (): Promise<void> => {
    const { getM11ARoom } = await import('./activity-room-m11a.js');
    const m9Store = getM11ARoom().store;
    await m9Store.append(
      fromHumanMessage({
        message: appended.content,
        userId: appended.actor.id,
        displayName: appended.actor.displayName,
        messageId: appended.id,
      }),
    );
  };
  try {
    await attempt();
    m9MirrorStats.humanOk += 1;
  } catch (error) {
    try {
      await attempt();
      m9MirrorStats.humanOk += 1;
    } catch (retryError) {
      m9MirrorStats.humanFailed += 1;
      recordMirrorFailure(appended.id, retryError instanceof Error ? retryError : error);
    }
  }
}

/**
 * Deliver a workflow-scoped human message to the workflow's agents. A broadcast
 * is observed by every participant (each agent's next harness turn injects it
 * via the context assembler); an @mention additionally names the intended
 * responder. Waking is best-effort and never interrupts an active run.
 */
async function maybeWakeAddressedAgent(ctx: WorkspaceContext, record: AgentMessageActivity): Promise<void> {
  const workflowId = record.workflowId;
  if (!workflowId) return;
  try {
    await ctx.multiAgentWorkflow.resumeIfIdle(workflowId);
  } catch {
    /* waking is best-effort */
  }
}
