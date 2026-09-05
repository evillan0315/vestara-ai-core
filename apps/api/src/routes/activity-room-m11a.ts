/**
 * ARX-015 M11A — Production Activity Room Read API
 *
 * Read-only API boundary over frozen M9/M10 contracts.
 * Authority flow:
 *   Agent/Team authority (AgentStorage) → team membership, agent identity, AI binding
 *   M8 workflow truth → M9 durable activity → M10 projection → lifecycle state
 *   → M11A composition → Workspace UI
 *
 * Activity Room is a generic consumer of participant/team information.
 * It does NOT define teams, roles, or model bindings.
 *
 * Endpoints:
 *   GET /api/activity-room/v1/snapshot          — Room snapshot + authoritative cursor
 *   GET /api/activity-room/v1/activities        — Bounded/paginated historical activity retrieval
 *   GET /api/activity-room/v1/activities/:id    — Individual ActivityRecord retrieval
 *   GET /api/activity-room/v1/activities/aggregate/:id — Aggregate drill-down
 *   GET /api/activity-room/v1/participants      — Participant projection (authority + lifecycle)
 *   GET /api/activity-room/v1/attention         — Attention projection
 *   GET /api/activity-room/v1/workflow-summary  — Workflow summary projection
 *
 * All endpoints are read-only. No mutation of M8, M9, or M10 state.
 * No exposure of SQLite schema, OpenCode internals, or provider internals.
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import type {
  ActivityCursor,
  ActivityEvent,
  ActivityRecordId,
  ActivityRoomProjection,
  AttentionEntry,
  M9ActivityQuery,
  M9ActivityRecord,
  M9ActivityStore,
  ParticipantProjection,
  WorkflowSummary,
} from '@vestara/activity-room';
import {
  ActivityStreamConnection,
  ActivityStreamHub,
  DurableActivityStore,
  type ActivityRecord as ProjectionActivityRecord,
  ProjectionRuntime,
} from '@vestara/activity-room';
import { json } from '../http/response';
import type { WorkspaceContext } from '../workspace-context';

// ─── Projection ActivityRecord (for hub) ────────────────────────

/** Convert M9 ActivityRecord to Projection ActivityRecord for hub broadcasting. */
function toProjectionRecord(record: M9ActivityRecord): ProjectionActivityRecord {
  // The projection contracts use 'kind' instead of 'type', and have different structure
  // Map the M9 fields to projection fields
  const kindMap: Record<string, ProjectionActivityRecord['kind']> = {
    'workflow.started': 'workflow',
    'workflow.completed': 'workflow',
    'workflow.failed': 'workflow',
    'workflow.cancelled': 'workflow',
    'task.runnable': 'task',
    'task.started': 'task',
    'task.completed': 'task',
    'task.failed': 'task',
    'task.cancelled': 'task',
    'agent.assigned': 'agent-message',
    'agent.started': 'agent-message',
    'agent.progress': 'agent-message',
    'agent.waiting': 'agent-message',
    'agent.completed': 'agent-message',
    'agent.failed': 'agent-message',
    'agent.cancelled': 'agent-message',
    'human.message': 'agent-message',
    'system.event': 'workflow',
    'interaction.presented': 'agent-message',
    'interaction.responded': 'agent-message',
  };

  return {
    id: String(record.activityId),
    sequence: record.sequenceNumber,
    timestamp: record.timestamp,
    actor: {
      type: record.actor.type,
      id: record.actor.id,
      displayName: record.actor.displayName,
      ...(record.actorId ? { role: record.actorId } : {}),
    },
    kind: kindMap[record.type] ?? 'workflow',
    agentId: record.actor.type === 'agent' ? record.actor.id : undefined,
    messageKind: 'message',
    content: record.payload?.message ?? '',
    workflowId: record.workflowRunId,
    sessionId: undefined,
    evidenceRefs: [],
    ...(record.payload?.error ? { effect: 'intervention' as const } : {}),
    ...(record.payload?.output ? { output: record.payload.output } : {}),
  } as ProjectionActivityRecord;
}

// ─── Configuration ────────────────────────────────────────────────

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_CURSOR_AGE_MS = 5 * 60 * 1000; // 5 minutes

// ─── M11A Room State ────────────────────────────────────────────

/** Production-safe instrumentation counters (no PII, no SQL content). */
export interface M11AInstrumentation {
  /** Total watcher poll cycles since boot */
  watcherPollCount: number;
  /** Watcher poll cycles that threw */
  watcherErrorCount: number;
  /** Watcher poll latency (last, avg, max) in ms */
  watcherLastLatencyMs: number;
  watcherAvgLatencyMs: number;
  watcherMaxLatencyMs: number;
  /** Timestamp of first watcher error (null if none) */
  firstWatcherErrorAt: string | null;
  /** Timestamp of last watcher error (null if none) */
  lastWatcherErrorAt: string | null;
  /** Total db.exec() calls (read path) */
  dbExecReadCount: number;
  /** Total db.exec() calls (write path — via auto-persist) */
  dbExecWriteCount: number;
  /** Total persistDb() calls (db.export() invocations) */
  persistDbCount: number;
  /** Total snapshot fetches served */
  snapshotFetchCount: number;
  /** Snapshot fetch latency (last, avg, max) in ms */
  snapshotLastLatencyMs: number;
  snapshotAvgLatencyMs: number;
  snapshotMaxLatencyMs: number;
  /** Timestamp of last successful snapshot */
  lastSnapshotAt: string | null;
  /** Current Node.js memory (heapUsed, rss) in bytes */
  processHeapUsedBytes: number;
  processRssBytes: number;
}

export interface M11ARoomState {
  store: M9ActivityStore;
  runtime: ProjectionRuntime;
  hub: ActivityStreamHub;
  lastProjection: ActivityRoomProjection | null;
  lastProjectionAt: number;
  instrumentation: M11AInstrumentation;
}

/** In-memory singleton for process lifetime. */
let m11aRoom: M11ARoomState | null = null;

/**
 * Initialize the M11A Activity Room for a repo.
 * Opens the M9 SQLite database and creates the M10 ProjectionRuntime.
 * Called once at API boot before any route uses the room.
 */
export async function initM11AActivityRoom(repoPath: string): Promise<M11ARoomState> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const dbPath = path.join(repoPath, '.vestara', 'm9-activity.db');

  let db: any;
  try {
    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
    }
  } catch {
    /* corrupt or unreadable — start fresh */
  }
  db = db ?? new SQL.Database();

  // Ensure M9 schema exists
  db.run(`
    CREATE TABLE IF NOT EXISTS m9_activity_events (
      activity_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      sequence_number INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      execution_id TEXT,
      trace_id TEXT,
      request_id TEXT,
      workflow_run_id TEXT,
      task_id TEXT,
      agent_assignment_id TEXT,
      repository_binding_id TEXT,
      runtime_session_binding_id TEXT,
      ai_binding_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_display_name TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'all'
    );
    CREATE INDEX IF NOT EXISTS idx_m9_sequence ON m9_activity_events(sequence_number);
    CREATE INDEX IF NOT EXISTS idx_m9_event_id ON m9_activity_events(event_id);
    CREATE INDEX IF NOT EXISTS idx_m9_workflow_run ON m9_activity_events(workflow_run_id);
    CREATE INDEX IF NOT EXISTS idx_m9_execution ON m9_activity_events(execution_id);
    CREATE INDEX IF NOT EXISTS idx_m9_task ON m9_activity_events(task_id);
    CREATE INDEX IF NOT EXISTS idx_m9_type ON m9_activity_events(type);
    CREATE INDEX IF NOT EXISTS idx_m9_timestamp ON m9_activity_events(timestamp);
  `);

  // Auto-persist on write operations (both db.exec and db.run)
  const origExec = db.exec.bind(db);
  db.exec = (sql: string) => {
    const result = origExec(sql);
    const trimmed = sql.trim().toUpperCase();
    if (
      trimmed.startsWith('INSERT') ||
      trimmed.startsWith('UPDATE') ||
      trimmed.startsWith('DELETE') ||
      trimmed.startsWith('CREATE') ||
      trimmed.startsWith('DROP')
    ) {
      persistDb(db, dbPath);
    }
    return result;
  };

  const origRun = db.run.bind(db);
  db.run = (sql: string, params?: any[]) => {
    origRun(sql, params);
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
      persistDb(db, dbPath);
    }
  };

  const store = new DurableActivityStore(db);
  const runtime = new ProjectionRuntime();
  const hub = new ActivityStreamHub({
    earliestAvailableSequence: 1,
    bufferCapacity: 128,
  });

  // Build initial projection
  const records = await store.rebuild();
  const projection = runtime.rebuild(records);

  m11aRoom = {
    store,
    runtime,
    hub,
    lastProjection: projection,
    lastProjectionAt: Date.now(),
    instrumentation: {
      watcherPollCount: 0,
      watcherErrorCount: 0,
      watcherLastLatencyMs: 0,
      watcherAvgLatencyMs: 0,
      watcherMaxLatencyMs: 0,
      firstWatcherErrorAt: null,
      lastWatcherErrorAt: null,
      dbExecReadCount: 0,
      dbExecWriteCount: 0,
      persistDbCount: 0,
      snapshotFetchCount: 0,
      snapshotLastLatencyMs: 0,
      snapshotAvgLatencyMs: 0,
      snapshotMaxLatencyMs: 0,
      lastSnapshotAt: null,
      processHeapUsedBytes: 0,
      processRssBytes: 0,
    },
  };

  // Start background watcher for new records (M11B realtime transport)
  startActivityWatcher(m11aRoom);

  return m11aRoom;
}

/** Process-lifetime singleton shared by routes. */
export function getM11ARoom(): M11ARoomState {
  if (!m11aRoom) {
    throw new Error('M11A Activity Room not initialized. Call initM11AActivityRoom first.');
  }
  return m11aRoom;
}

function persistDb(db: any, dbPath: string): void {
  if (m11aRoom) m11aRoom.instrumentation.persistDbCount++;
  try {
    const data = db.export();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch {
    /* best-effort */
  }
}

/** Background watcher: polls M9 store for new records and broadcasts via hub. */
function startActivityWatcher(room: M11ARoomState): void {
  let lastKnownSequence = 0;
  const inst = room.instrumentation;

  // Initialize with current last sequence
  room.store
    .lastSequence()
    .then((seq) => {
      lastKnownSequence = seq ?? 0;
    })
    .catch(() => {
      lastKnownSequence = 0;
    });

  const interval = setInterval(async () => {
    const pollStart = Date.now();
    inst.watcherPollCount++;
    try {
      const currentSequence = await room.store.lastSequence();
      if (currentSequence === undefined || currentSequence <= lastKnownSequence) return;

      // Fetch new records
      const cursor: ActivityCursor = {
        sequenceNumber: lastKnownSequence,
        eventId: '',
        timestamp: '',
      };
      const newRecords = await room.store.getAfter(cursor);

      if (newRecords.length > 0) {
        // Broadcast each new record in order (convert to projection format)
        for (const record of newRecords) {
          room.hub.broadcast(toProjectionRecord(record));
        }
        lastKnownSequence = newRecords[newRecords.length - 1].sequenceNumber;
      }
      // Track watcher latency (success path)
      const elapsed = Date.now() - pollStart;
      inst.watcherLastLatencyMs = elapsed;
      inst.watcherAvgLatencyMs =
        (inst.watcherAvgLatencyMs * (inst.watcherPollCount - 1) + elapsed) / inst.watcherPollCount;
      inst.watcherMaxLatencyMs = Math.max(inst.watcherMaxLatencyMs, elapsed);
      // Update process memory snapshot
      const mem = process.memoryUsage();
      inst.processHeapUsedBytes = mem.heapUsed;
      inst.processRssBytes = mem.rss;
    } catch (error) {
      inst.watcherErrorCount++;
      const now = new Date().toISOString();
      if (!inst.firstWatcherErrorAt) inst.firstWatcherErrorAt = now;
      inst.lastWatcherErrorAt = now;
      console.error('[M11A] Activity watcher error:', error);
    }
  }, 500); // Poll every 500ms

  interval.unref?.();
}

// ─── Query Parsing & Validation ──────────────────────────────────

function integer(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : undefined;
}

function stringValue(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

/** Parse and validate query parameters into M9ActivityQuery. */
function parseActivityQuery(url: URL): M9ActivityQuery {
  const params = url.searchParams;
  const limit = integer(params.get('limit'));
  const afterSeq = integer(params.get('afterSequence'));
  const beforeSeq = integer(params.get('beforeSequence'));
  const afterTimestamp = stringValue(params.get('afterTimestamp'));
  const beforeTimestamp = stringValue(params.get('beforeTimestamp'));
  const workflowRunId = stringValue(params.get('workflowRunId'));
  const executionId = stringValue(params.get('executionId'));
  const taskId = stringValue(params.get('taskId'));
  const actorType = stringValue(params.get('actorType'));
  const actorId = stringValue(params.get('actorId'));
  const type = stringValue(params.get('type'));
  const source = stringValue(params.get('source'));

  // Validate limit
  const validatedLimit = limit !== undefined ? Math.max(1, Math.min(MAX_LIMIT, limit)) : DEFAULT_LIMIT;

  // Validate cursor parameters
  if (afterSeq !== undefined && afterSeq < 0) {
    throw new Error('afterSequence must be non-negative');
  }
  if (beforeSeq !== undefined && beforeSeq < 0) {
    throw new Error('beforeSequence must be non-negative');
  }
  if (afterSeq !== undefined && beforeSeq !== undefined && afterSeq >= beforeSeq) {
    throw new Error('afterSequence must be less than beforeSequence');
  }

  // Build cursor if afterSequence provided
  let after: ActivityCursor | undefined;
  if (afterSeq !== undefined) {
    after = {
      sequenceNumber: afterSeq,
      eventId: '',
      timestamp: '',
    };
  }

  return {
    workflowRunId: workflowRunId as M9ActivityQuery['workflowRunId'],
    executionId: executionId as M9ActivityQuery['executionId'],
    taskId: taskId as M9ActivityQuery['taskId'],
    actor: actorType as M9ActivityQuery['actor'],
    actorId,
    type: type as M9ActivityQuery['type'],
    source: source as M9ActivityQuery['source'],
    after,
    before: beforeTimestamp,
    afterTimestamp,
    limit: validatedLimit,
  };
}

// ─── Response Helpers ────────────────────────────────────────────

/** Sanitize ActivityRecord for API response (strip internal fields). */
function sanitizeRecord(record: M9ActivityRecord): Record<string, unknown> {
  return {
    activityId: String(record.activityId),
    eventId: record.eventId,
    sequenceNumber: record.sequenceNumber,
    type: record.type,
    timestamp: record.timestamp,
    executionId: record.executionId,
    traceId: record.traceId,
    requestId: record.requestId,
    workflowRunId: record.workflowRunId,
    taskId: record.taskId,
    agentAssignmentId: record.agentAssignmentId,
    repositoryBindingId: record.repositoryBindingId,
    runtimeSessionBindingId: record.runtimeSessionBindingId,
    aiBindingId: record.aiBindingId,
    actor: record.actor,
    actorId: record.actorId,
    source: record.source,
    payload: record.payload,
    visibility: record.visibility,
  };
}

/** Sanitize StreamItem for API response. */
function sanitizeStreamItem(item: ActivityRoomProjection['stream'][0]): Record<string, unknown> {
  return {
    streamItemId: item.streamItemId,
    activityId: item.activityId,
    sequenceNumber: item.sequenceNumber,
    kind: item.kind,
    importance: item.importance,
    actor: item.actor,
    content: item.content,
    timestamp: item.timestamp,
    workflowRunId: item.workflowRunId,
    executionId: item.executionId,
    taskId: item.taskId,
    aggregated: item.aggregated
      ? {
          count: item.aggregated.count,
          kind: item.aggregated.kind,
          summary: item.aggregated.summary,
          referencedActivityIds: item.aggregated.referencedActivityIds,
          sequenceRange: item.aggregated.sequenceRange,
        }
      : undefined,
    interaction: item.interaction
      ? {
          interactionId: item.interaction.interactionId,
          lifecycle: item.interaction.lifecycle,
          ...(item.interaction.choices ? { choices: item.interaction.choices } : {}),
          ...(item.interaction.selectedChoiceId ? { selectedChoiceId: item.interaction.selectedChoiceId } : {}),
          ...(item.interaction.respondingParticipantId
            ? { respondingParticipantId: item.interaction.respondingParticipantId }
            : {}),
          ...(item.interaction.respondingParticipantName
            ? { respondingParticipantName: item.interaction.respondingParticipantName }
            : {}),
        }
      : undefined,
  };
}

/** Sanitize ParticipantProjection for API response. */
function sanitizeParticipant(p: ParticipantProjection): Record<string, unknown> {
  return {
    participantId: p.participantId,
    type: p.type,
    displayName: p.displayName,
    modelDisplayName: p.modelDisplayName,
    role: p.role,
    modelId: p.modelId,
    providerId: p.providerId,
    teamId: p.teamId,
    teamName: p.teamName,
    membership: p.membership,
    presence: p.presence,
    workState: p.workState,
    currentAssignment: p.currentAssignment,
    joinedAt: p.joinedAt,
    lastActivityAt: p.lastActivityAt,
  };
}

/** Sanitize AttentionEntry for API response. */
function sanitizeAttention(a: AttentionEntry): Record<string, unknown> {
  return {
    attentionId: a.attentionId,
    reason: a.reason,
    severity: a.severity,
    message: a.message,
    actor: a.actor,
    workflowRunId: a.workflowRunId,
    taskId: a.taskId,
    timestamp: a.timestamp,
    acknowledged: a.acknowledged,
  };
}

/** Sanitize WorkflowSummary for API response. */
function sanitizeWorkflowSummary(w: WorkflowSummary): Record<string, unknown> {
  return {
    workflowRunId: w.workflowRunId,
    executionId: w.executionId,
    status: w.status,
    taskCount: w.taskCount,
    completedTasks: w.completedTasks,
    failedTasks: w.failedTasks,
    currentTask: w.currentTask,
    startedAt: w.startedAt,
    lastActivityAt: w.lastActivityAt,
  };
}

// ─── Authority Composition ────────────────────────────────────────

/**
 * Compose Activity Room participants from two authoritative sources:
 *
 * 1. M10 projection (lifecycle-derived): runtime presence, work state, current assignment
 * 2. Agent/Team authority (config-driven): agent identity, team membership, AI binding
 *
 * Agent/Team authority answers "who belongs in the room/team."
 * M10/lifecycle state answers "what is happening to/with that participant."
 *
 * Activity Room does NOT define teams, roles, or model bindings.
 * It consumes them from upstream AgentStorage/AgentTeam authorities.
 */
async function composeParticipants(
  ctx: WorkspaceContext,
  room: M11ARoomState,
): Promise<readonly ParticipantProjection[]> {
  // 1. Get lifecycle-derived participants from M10 projection
  if (Date.now() - room.lastProjectionAt > MAX_CURSOR_AGE_MS) {
    const records = await room.store.rebuild();
    room.lastProjection = room.runtime.rebuild(records);
    room.lastProjectionAt = Date.now();
  }
  const lifecycleParticipants = room.lastProjection?.participants ?? [];

  // Build lookup: participantId → lifecycle participant
  const lifecycleById = new Map<string, ParticipantProjection>();
  for (const p of lifecycleParticipants) {
    lifecycleById.set(p.participantId, p);
  }

  // 2. Get agent/team authority from AgentStorage
  const allAgents = await ctx.agents.listAgents();
  const allTeams = await ctx.agents.listTeams();

  // Build team membership map: agentId → { teamId, teamName }
  const teamByAgentId = new Map<string, { teamId: string; teamName: string }>();
  for (const team of allTeams) {
    // team.memberIds contains agent IDs
    for (const agentId of team.memberIds) {
      if (!teamByAgentId.has(agentId)) {
        teamByAgentId.set(agentId, { teamId: team.id, teamName: team.name });
      }
    }
    // Also check agent-side back-reference (teamId on agent definition)
    for (const agent of allAgents) {
      if (agent.teamId === team.id && !teamByAgentId.has(agent.id)) {
        teamByAgentId.set(agent.id, { teamId: team.id, teamName: team.name });
      }
    }
  }

  // 3. Build composed participant list
  const composed: ParticipantProjection[] = [];
  const seenIds = new Set<string>();

  // 3a. Add all configured agents from AgentStorage
  for (const agent of allAgents) {
    const participantId = `agent-${agent.id}`;
    const teamMembership = teamByAgentId.get(agent.id);
    const lifecycle = lifecycleById.get(participantId);

    if (lifecycle) {
      // Agent has lifecycle history — enrich with team/agent authority metadata
      composed.push({
        ...lifecycle,
        // Enrich canonical identity from agent authority if available
        displayName: agent.id,
        modelDisplayName: agent.model || agent.name || undefined,
        role: agent.role || lifecycle.role,
        modelId: agent.model || lifecycle.modelId,
        providerId: agent.provider || lifecycle.providerId,
        // Team membership from AgentTeam authority
        teamId: teamMembership?.teamId ?? lifecycle.teamId,
        teamName: teamMembership?.teamName ?? lifecycle.teamName,
      });
    } else {
      // Agent configured but has no lifecycle history — render with idle state
      composed.push({
        participantId,
        type: 'agent' as const,
        displayName: agent.id,
        modelDisplayName: agent.model || agent.name || undefined,
        role: agent.role || undefined,
        modelId: agent.model || undefined,
        providerId: agent.provider || undefined,
        teamId: teamMembership?.teamId,
        teamName: teamMembership?.teamName,
        membership: 'joined' as const,
        presence: 'offline' as const,
        workState: 'available' as const,
        joinedAt: agent.createdAt,
        lastActivityAt: agent.createdAt,
      });
    }
    seenIds.add(participantId);
  }

  // 3b. Add human participants from lifecycle projection (not in AgentStorage)
  for (const p of lifecycleParticipants) {
    if (p.type === 'human' && !seenIds.has(p.participantId)) {
      composed.push(p);
      seenIds.add(p.participantId);
    }
  }

  return composed;
}

// ─── Route Handler ───────────────────────────────────────────────

/**
 * M11A Activity Room Read API.
 * All endpoints are read-only. No mutation of M8, M9, or M10 state.
 */
export async function handleM11AActivityRoomRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  url: URL,
): Promise<boolean> {
  // The dispatcher invokes every handler for every request; return false early
  // for paths outside this route group so uninitialized rooms never break
  // unrelated endpoints (e.g. the 404 path or later-registered routes).
  if (!p.startsWith('/api/activity-room/v1')) return false;
  const room = getM11ARoom();

  // ─── GET /api/activity-room/v1/snapshot ──────────────────────
  // Room snapshot + authoritative cursor
  if (method === 'GET' && p === '/api/activity-room/v1/snapshot') {
    const snapStart = Date.now();
    // Refresh projection if stale
    if (Date.now() - room.lastProjectionAt > MAX_CURSOR_AGE_MS) {
      const records = await room.store.rebuild();
      room.lastProjection = room.runtime.rebuild(records);
      room.lastProjectionAt = Date.now();
    }

    const projection = room.lastProjection!;
    const participants = await composeParticipants(ctx, room);
    json(res, 200, {
      room: projection.room,
      participants: participants.map(sanitizeParticipant),
      stream: projection.stream.map(sanitizeStreamItem).slice(0, 50), // Bounded preview
      workflowSummary: projection.workflowSummary ? sanitizeWorkflowSummary(projection.workflowSummary) : null,
      attention: projection.attention.map(sanitizeAttention),
      contextualCapabilities: projection.contextualCapabilities,
      // Explicit cursor for reconnect
      cursor: projection.room.cursor,
    });
    // Track snapshot latency
    const snapElapsed = Date.now() - snapStart;
    room.instrumentation.snapshotFetchCount++;
    room.instrumentation.snapshotLastLatencyMs = snapElapsed;
    const sc = room.instrumentation.snapshotFetchCount;
    room.instrumentation.snapshotAvgLatencyMs =
      (room.instrumentation.snapshotAvgLatencyMs * (sc - 1) + snapElapsed) / sc;
    room.instrumentation.snapshotMaxLatencyMs = Math.max(room.instrumentation.snapshotMaxLatencyMs, snapElapsed);
    room.instrumentation.lastSnapshotAt = new Date().toISOString();
    return true;
  }

  // ─── GET /api/activity-room/v1/activities ────────────────────
  // Bounded/paginated historical activity retrieval
  if (method === 'GET' && p === '/api/activity-room/v1/activities') {
    try {
      const query = parseActivityQuery(url);
      const page = await room.store.query(query);

      json(res, 200, {
        records: page.map(sanitizeRecord),
        count: page.length,
        limit: query.limit ?? DEFAULT_LIMIT,
        // Cursor for next page
        nextCursor:
          page.length > 0
            ? {
                sequenceNumber: page[page.length - 1].sequenceNumber,
                eventId: page[page.length - 1].eventId,
                timestamp: page[page.length - 1].timestamp,
              }
            : null,
      });
    } catch (error) {
      json(res, 400, {
        error: { code: 'INVALID_QUERY', message: error instanceof Error ? error.message : 'Invalid query parameters' },
      });
    }
    return true;
  }

  // ─── GET /api/activity-room/v1/activities/after ──────────────
  // Cursor-based pagination (M9 sequence-based)
  if (method === 'GET' && p === '/api/activity-room/v1/activities/after') {
    try {
      const params = url.searchParams;
      const afterSeq = integer(params.get('afterSequence'));
      const afterEventId = stringValue(params.get('afterEventId'));
      const afterTimestamp = stringValue(params.get('afterTimestamp'));
      const limit = integer(params.get('limit')) ?? DEFAULT_LIMIT;

      if (afterSeq === undefined && !afterTimestamp) {
        json(res, 400, {
          error: { code: 'MISSING_CURSOR', message: 'afterSequence or afterTimestamp required' },
        });
        return true;
      }

      const cursor: ActivityCursor = {
        sequenceNumber: afterSeq ?? 0,
        eventId: afterEventId ?? '',
        timestamp: afterTimestamp ?? new Date(0).toISOString(),
      };

      const records = await room.store.getAfter(cursor);
      const limited = records.slice(0, limit);

      json(res, 200, {
        records: limited.map(sanitizeRecord),
        count: limited.length,
        limit,
        nextCursor:
          limited.length > 0
            ? {
                sequenceNumber: limited[limited.length - 1].sequenceNumber,
                eventId: limited[limited.length - 1].eventId,
                timestamp: limited[limited.length - 1].timestamp,
              }
            : null,
      });
    } catch (error) {
      json(res, 400, {
        error: {
          code: 'INVALID_CURSOR',
          message: error instanceof Error ? error.message : 'Invalid cursor parameters',
        },
      });
    }
    return true;
  }

  // ─── GET /api/activity-room/v1/activities/:id ────────────────
  // Individual ActivityRecord retrieval
  if (method === 'GET' && p.match(/^\/api\/activity-room\/v1\/activities\/[^/]+$/)) {
    const activityId = decodeURIComponent(p.split('/').pop()!);
    const record = await room.store.getByEventId(activityId);

    if (!record) {
      json(res, 404, {
        error: { code: 'NOT_FOUND', message: `Activity not found: ${activityId}` },
      });
      return true;
    }

    json(res, 200, { record: sanitizeRecord(record) });
    return true;
  }

  // ─── GET /api/activity-room/v1/activities/aggregate/:id ──────
  // Aggregate drill-down using referencedActivityIds / sequenceRange
  if (method === 'GET' && p.match(/^\/api\/activity-room\/v1\/activities\/aggregate\/[^/]+$/)) {
    const streamItemId = decodeURIComponent(p.split('/').pop()!);

    // Fetch recent records to find the aggregated stream item
    const recentRecords = await room.store.query({ limit: 500 });
    const projection = room.runtime.rebuild(recentRecords);

    const aggregatedItem = projection.stream.find((s) => s.aggregated !== undefined && s.streamItemId === streamItemId);

    if (!aggregatedItem || !aggregatedItem.aggregated) {
      json(res, 404, {
        error: { code: 'NOT_FOUND', message: `Aggregated activity not found: ${streamItemId}` },
      });
      return true;
    }

    // Retrieve all underlying M9 records via referencedActivityIds
    const referencedIds = aggregatedItem.aggregated.referencedActivityIds;
    const underlyingRecords: M9ActivityRecord[] = [];

    for (const refId of referencedIds) {
      const record = await room.store.getByEventId(refId);
      if (record) {
        underlyingRecords.push(record);
      }
    }

    // Also support sequenceRange fallback
    let rangeRecords: M9ActivityRecord[] = [];
    if (underlyingRecords.length === 0 && aggregatedItem.aggregated.sequenceRange) {
      const { first, last } = aggregatedItem.aggregated.sequenceRange;
      rangeRecords = (await room.store.query({ limit: last - first + 1 })).filter(
        (r) => r.sequenceNumber >= first && r.sequenceNumber <= last,
      );
    }

    const allUnderlying = [...underlyingRecords, ...rangeRecords];
    const uniqueRecords = Array.from(new Map(allUnderlying.map((r) => [r.sequenceNumber, r])).values()).sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber,
    );

    json(res, 200, {
      aggregate: {
        streamItemId: aggregatedItem.streamItemId,
        count: aggregatedItem.aggregated.count,
        kind: aggregatedItem.aggregated.kind,
        summary: aggregatedItem.aggregated.summary,
        sequenceRange: aggregatedItem.aggregated.sequenceRange,
      },
      underlyingRecords: uniqueRecords.map(sanitizeRecord),
      count: uniqueRecords.length,
    });
    return true;
  }

  // ─── GET /api/activity-room/v1/participants ──────────────────
  // Participant projection — composed from Agent/Team authority + lifecycle state
  if (method === 'GET' && p === '/api/activity-room/v1/participants') {
    const participants = await composeParticipants(ctx, room);
    json(res, 200, {
      participants: participants.map(sanitizeParticipant),
      count: participants.length,
    });
    return true;
  }

  // ─── GET /api/activity-room/v1/attention ─────────────────────
  // Attention projection
  if (method === 'GET' && p === '/api/activity-room/v1/attention') {
    if (Date.now() - room.lastProjectionAt > MAX_CURSOR_AGE_MS) {
      const records = await room.store.rebuild();
      room.lastProjection = room.runtime.rebuild(records);
      room.lastProjectionAt = Date.now();
    }

    const projection = room.lastProjection!;
    json(res, 200, {
      attention: projection.attention.map(sanitizeAttention),
      count: projection.attention.length,
    });
    return true;
  }

  // ─── GET /api/activity-room/v1/workflow-summary ──────────────
  // Workflow summary projection
  if (method === 'GET' && p === '/api/activity-room/v1/workflow-summary') {
    if (Date.now() - room.lastProjectionAt > MAX_CURSOR_AGE_MS) {
      const records = await room.store.rebuild();
      room.lastProjection = room.runtime.rebuild(records);
      room.lastProjectionAt = Date.now();
    }

    const projection = room.lastProjection!;
    if (projection.workflowSummary) {
      json(res, 200, { workflowSummary: sanitizeWorkflowSummary(projection.workflowSummary) });
    } else {
      json(res, 200, { workflowSummary: null });
    }
    return true;
  }

  return false;
}
