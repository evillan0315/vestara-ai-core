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
 *   POST /api/activity-room/v1/interactions/:id/present — Authoritative RuntimeInteraction
 *     presentation (AR-TOOL-ASK-003A4B mutation; all GETs above stay read-only)
 *
 * All GET endpoints are read-only. No mutation of M8, M9, or M10 state.
 * The single POST mutates ONLY RuntimeInteraction presentation state
 * (pending → presented with token rotation); it never writes M9, never
 * claims, never delivers to OpenCode.
 * No exposure of SQLite schema, OpenCode internals, or provider internals.
 */

import type * as http from 'node:http';
import * as path from 'node:path';
import type {
  ActivityCursor,
  ActivityRoomProjection,
  AttentionEntry,
  M9ActivityQuery,
  M9ActivityRecord,
  M9ActivityStore,
  ParticipantProjection,
  PendingRuntimeQuestionProjection,
  SnapshotActivityEntity,
  WorkflowSummary,
} from '@vestara/activity-room';
import {
  ActivityStreamHub,
  DurableActivityStore,
  ProjectionRuntime,
  presentRuntimeQuestionForBrowser,
  projectActivitySnapshot,
  projectAttentionEntries,
  projectDiagnosticAttentionEntries,
  projectPendingRuntimeQuestions,
  projectRepositoryVerificationAttentionEntries,
  projectRuntimeQuestionAttention,
  RuntimeInteractionStoreOpenError,
  RuntimeQuestionInteractionStore,
  RuntimeQuestionTransitionError,
  toProjectionRecord,
} from '@vestara/activity-room';
import { getActivityRoom } from '../activity-room';
import { readBody } from '../http/body';
import { json } from '../http/response';
import type { WorkspaceContext } from '../workspace-context';

// ─── Configuration ────────────────────────────────────────────────

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_CURSOR_AGE_MS = 5 * 60 * 1000; // 5 minutes
const DIAGNOSTIC_ATTENTION_CACHE_MS = 15_000;

let diagnosticAttentionCache:
  | {
      readonly key: string;
      readonly expiresAt: number;
      readonly entries: readonly AttentionEntry[];
    }
  | undefined;

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
  /** Total durable database read operations. */
  dbExecReadCount: number;
  /** Total durable database write operations. */
  dbExecWriteCount: number;
  /** Retained for diagnostics compatibility; native M9 never exports a database. */
  persistDbCount: number;
  /** Persistence failures surfaced by the native M9 store. */
  m9PersistenceErrorCount: number;
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
  /**
   * RuntimeInteraction command-state authority, opened independently of M9.
   * Null when its explicit migration has not run: the Tool Ask durable
   * capability is then unavailable, but M9 evidence stays valid. Never
   * inferred, never silently created.
   */
  runtimeQuestions: RuntimeQuestionInteractionStore | null;
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
  const dbPath = path.join(repoPath, '.vestara', 'm9-activity.db');
  let m9PersistenceErrorCount = 0;
  // M9 authority opens first and alone: an M9-valid database always boots
  // the Activity Room regardless of RuntimeInteraction migration state.
  const store = DurableActivityStore.open(dbPath, {
    onPersistenceError: () => {
      m9PersistenceErrorCount += 1;
      if (m11aRoom) m11aRoom.instrumentation.m9PersistenceErrorCount = m9PersistenceErrorCount;
    },
  });
  // RuntimeInteraction authority opens independently against the same
  // physical file. A missing migration leaves the Tool Ask durable
  // capability unavailable under this domain's own error — it never
  // redefines the M9 database as invalid and never fails M9 boot.
  let runtimeQuestions: RuntimeQuestionInteractionStore | null = null;
  try {
    runtimeQuestions = RuntimeQuestionInteractionStore.open(dbPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const status = error instanceof RuntimeInteractionStoreOpenError ? error.status : 'unknown';
    console.warn(
      `[m11a] RuntimeInteraction authority unavailable (status=${status}): ${detail} ` +
        `Run the explicit RuntimeInteraction migration to enable the Tool Ask durable capability.`,
    );
  }
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
    runtimeQuestions,
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
      m9PersistenceErrorCount,
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

export function closeM11AActivityRoom(): void {
  m11aRoom?.store.close?.();
  try {
    m11aRoom?.runtimeQuestions?.close();
  } catch {
    // Best-effort shutdown; the M9 close above is authoritative.
  }
  m11aRoom = null;
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
        // Apply each durable record to the live projection before broadcasting.
        // Snapshot reads and reconnects must observe the same M10 state as the
        // realtime stream; the watcher is not only a transport relay.
        for (const record of newRecords) {
          room.runtime.processRecord(record);
          room.lastProjection = room.runtime.getProjection();
          room.lastProjectionAt = Date.now();
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
    beforeSequence: beforeSeq,
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

/** Sanitize converted projection ActivityRecord for drawer fallback use. */
function sanitizeProjectionRecord(record: ReturnType<typeof toProjectionRecord>): Record<string, unknown> {
  return { ...record };
}

/**
 * REASONING-BOUNDARY-001: re-validate the diagnostic details bag at the API
 * boundary. Known keys, bounded strings, finite numbers — anything else
 * stays out. Never parses message content.
 */
function sanitizeDetails(details: unknown): Record<string, unknown> | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const source = details as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const bounded = (value: unknown, max: number): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= max ? trimmed : undefined;
  };
  const finite = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  const reasoning = bounded(source.reasoning, 8000);
  if (reasoning) out.reasoning = reasoning;
  const providerId = bounded(source.providerId, 128);
  if (providerId) out.providerId = providerId;
  const modelId = bounded(source.modelId, 256);
  if (modelId) out.modelId = modelId;
  const latencyMs = finite(source.latencyMs);
  if (latencyMs !== undefined) out.latencyMs = latencyMs;
  const tokens = finite(source.tokens);
  if (tokens !== undefined) out.tokens = tokens;
  const conversationId = bounded(source.conversationId, 256);
  if (conversationId) out.conversationId = conversationId;
  return Object.keys(out).length > 0 ? out : undefined;
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
    runtimeSessionBindingId: item.runtimeSessionBindingId,
    // AR-UI-REPLY-002: authoritative origin provenance only; the
    // sanitizer otherwise stays an allowlist (projection stays lossy).
    ...(typeof item.originConversationId === 'string' ? { originConversationId: item.originConversationId } : {}),
    ...(typeof item.originSurface === 'string' ? { originSurface: item.originSurface } : {}),
    // REASONING-BOUNDARY-001: validated diagnostic details passthrough
    // (already validated at projection time; re-validated by UI converters).
    ...(item.details ? { details: sanitizeDetails(item.details) } : {}),
    // Phase 1: tool correlation passthrough (allowlisted shape only).
    ...(item.tool
      ? {
          tool: {
            toolName: item.tool.toolName,
            callID: item.tool.callID,
            status: item.tool.status,
            ...(typeof item.tool.agentId === 'string' ? { agentId: item.tool.agentId } : {}),
            ...(typeof item.tool.sessionId === 'string' ? { sessionId: item.tool.sessionId } : {}),
            ...(typeof item.tool.output === 'string' ? { output: item.tool.output.slice(0, 12000) } : {}),
          },
        }
      : {}),
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

/** Sanitize the authoritative M11A entity/operation snapshot projection. */
function sanitizeSnapshotEntity(entity: SnapshotActivityEntity): Record<string, unknown> {
  return {
    parent: sanitizeStreamItem(entity.parent),
    lineageKey: entity.lineageKey,
    operations: entity.operations.map((operation) => ({
      operationId: operation.operationId,
      toolName: operation.toolName,
      status: operation.status,
      timestamp: operation.timestamp,
      activityIds: operation.activityIds,
      ...(operation.output ? { output: operation.output.slice(0, 12000) } : {}),
      ...(operation.executionId ? { executionId: operation.executionId } : {}),
      ...(operation.runtimeSessionBindingId ? { runtimeSessionBindingId: operation.runtimeSessionBindingId } : {}),
      ...(operation.conversationId ? { conversationId: operation.conversationId } : {}),
    })),
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
    pendingInteractionId: p.pendingInteractionId,
    joinedAt: p.joinedAt,
    lastActivityAt: p.lastActivityAt,
  };
}

/** Sanitize AttentionEntry for API response. */
function sanitizeAttention(a: AttentionEntry): Record<string, unknown> {
  return {
    attentionId: a.attentionId,
    reason: a.reason,
    category: a.category,
    severity: a.severity,
    message: a.message,
    sourceRecordId: a.sourceRecordId,
    sourceRef: a.sourceRef,
    owner: a.owner,
    scope: a.scope,
    sourceFindingId: a.sourceFindingId,
    status: a.status,
    resolvedAt: a.resolvedAt,
    resolutionReason: a.resolutionReason,
    evidenceRefs: a.evidenceRefs,
    details: a.details,
    actor: a.actor,
    workflowRunId: a.workflowRunId,
    taskId: a.taskId,
    sessionId: a.sessionId,
    interactionId: a.interactionId,
    timestamp: a.timestamp,
    firstObservedAt: a.firstObservedAt,
    lastObservedAt: a.lastObservedAt,
    acknowledged: a.acknowledged,
  };
}

function sanitizePendingRuntimeQuestion(question: PendingRuntimeQuestionProjection): Record<string, unknown> {
  return {
    interactionId: question.interactionId,
    conversationId: question.conversationId,
    openCodeSessionId: question.openCodeSessionId,
    openCodeRequestId: question.openCodeRequestId,
    status: question.status,
    questions: question.questions.map((entry) => ({
      header: entry.header,
      question: entry.question,
      options: entry.options.map((option) => ({
        label: option.label,
        ...(option.description ? { description: option.description } : {}),
      })),
    })),
    expiresAt: question.expiresAt,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

function attentionSort(left: AttentionEntry, right: AttentionEntry): number {
  const severity = severityRank(right.severity) - severityRank(left.severity);
  if (severity !== 0) return severity;
  const time = left.timestamp.localeCompare(right.timestamp);
  if (time !== 0) return time;
  return left.attentionId.localeCompare(right.attentionId);
}

function dedupeAttention(entries: readonly AttentionEntry[]): readonly AttentionEntry[] {
  const byKey = new Map<string, AttentionEntry>();
  for (const entry of entries) {
    const key = canonicalAttentionKey(entry);
    const existing = byKey.get(key);
    byKey.set(key, existing === undefined ? entry : chooseAttentionEntry(existing, entry));
  }
  return [...byKey.values()];
}

function canonicalAttentionKey(entry: AttentionEntry): string {
  if (entry.sourceRef && entry.sourceRef.kind !== 'activity') {
    return `${entry.sourceRef.kind}:${entry.sourceRef.owner ?? entry.owner ?? 'unknown'}:${entry.sourceRef.id}`;
  }
  switch (entry.reason) {
    case 'task-blocked':
    case 'task-failed':
    case 'task-awaiting-approval':
      return entry.taskId ? `task:${entry.taskId}` : `source:${entry.sourceRecordId}`;
    case 'workflow-failed':
      return entry.workflowRunId ? `workflow:${entry.workflowRunId}:failed` : `source:${entry.sourceRecordId}`;
    case 'verification-failed':
    case 'verification-blocked': {
      const verificationRunId = stringDetail(entry, 'verificationRunId');
      if (verificationRunId) return `verification:${verificationRunId}`;
      return entry.taskId ? `verification-task:${entry.taskId}` : `source:${entry.sourceRecordId}`;
    }
    case 'test-failed': {
      const command = stringDetail(entry, 'command');
      return `test:${entry.taskId ?? 'global'}:${command ?? entry.sourceRecordId}`;
    }
    case 'tool-failed': {
      const callID = stringDetail(entry, 'callID');
      return callID ? `tool:${callID}` : `source:${entry.sourceRecordId}`;
    }
    case 'approval-required':
    case 'interaction-presented':
      if (entry.interactionId) return `interaction:${entry.interactionId}`;
      return entry.taskId ? `approval-task:${entry.taskId}` : `source:${entry.sourceRecordId}`;
    default:
      return `source:${entry.sourceRecordId}`;
  }
}

async function projectSystemAttention(ctx: WorkspaceContext): Promise<readonly AttentionEntry[]> {
  const key = ctx.repoPath;
  const now = Date.now();
  if (diagnosticAttentionCache?.key === key && diagnosticAttentionCache.expiresAt > now) {
    return diagnosticAttentionCache.entries;
  }

  try {
    const { collectDiagnosticSnapshots } = await import('../diagnostics/snapshots.js');
    const collection = collectDiagnosticSnapshots(ctx.repoPath);
    const entries = projectDiagnosticAttentionEntries(collection.snapshots);
    diagnosticAttentionCache = {
      key,
      expiresAt: now + DIAGNOSTIC_ATTENTION_CACHE_MS,
      entries,
    };
    return entries;
  } catch {
    return diagnosticAttentionCache?.key === key ? diagnosticAttentionCache.entries : [];
  }
}

async function projectRepositoryAttention(ctx: WorkspaceContext): Promise<readonly AttentionEntry[]> {
  try {
    const workspaceId = ctx.runtime.getSession().fingerprint.id;
    const reports = await ctx.verifications.listByWorkspace(workspaceId);
    return projectRepositoryVerificationAttentionEntries(reports);
  } catch {
    return [];
  }
}

function chooseAttentionEntry(left: AttentionEntry, right: AttentionEntry): AttentionEntry {
  const evidence = (right.evidenceRefs?.length ?? 0) - (left.evidenceRefs?.length ?? 0);
  if (evidence !== 0) return evidence > 0 ? right : left;
  const details = detailCount(right) - detailCount(left);
  if (details !== 0) return details > 0 ? right : left;
  const namespace = sourceNamespaceRank(right.sourceRecordId) - sourceNamespaceRank(left.sourceRecordId);
  if (namespace !== 0) return namespace > 0 ? right : left;
  return right.sourceRecordId.localeCompare(left.sourceRecordId) < 0 ? right : left;
}

function detailCount(entry: AttentionEntry): number {
  return entry.details ? Object.keys(entry.details).length : 0;
}

function sourceNamespaceRank(sourceRecordId: string): number {
  return sourceRecordId.startsWith('act-') ? 1 : 2;
}

function stringDetail(entry: AttentionEntry, key: string): string | undefined {
  const value = entry.details?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function severityRank(severity: AttentionEntry['severity']): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
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
 * Actor ids that are client/surface attribution, never human principals.
 * 'workspace-ui' is the surface default used by the conversations API
 * (ACTOR constant there). A surface is where a principal acted, not who
 * acted — it must never manufacture a Human participant. Principal ≠ Surface.
 */
const SURFACE_ACTOR_IDS = new Set(['workspace-ui']);

/**
 * Phase A fail-closed admission predicate for lifecycle human participants.
 * Pure and unit-testable. Admits only when the raw actor id is neither a
 * canonical agent id (turn-target leak) nor a surface attribution (client,
 * not principal). Anything else stays unlisted (UNKNOWN) rather than
 * manufacturing a Human participant. Storage and history are untouched.
 */
export function isAdmittedHumanParticipant(participantId: string, canonicalAgentIds: ReadonlySet<string>): boolean {
  if (!participantId.startsWith('human-')) return false;
  const rawId = participantId.slice('human-'.length);
  return !canonicalAgentIds.has(rawId) && !SURFACE_ACTOR_IDS.has(rawId);
}

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
        // Canonical identity: agent.name is the human-readable name (e.g. "Developer")
        // agent.id is the stable key (e.g. "agent-developer") — not suitable for display
        displayName: agent.name || agent.id,
        modelDisplayName: agent.model || undefined,
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
        displayName: agent.name || agent.id,
        modelDisplayName: agent.model || undefined,
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

  // 3b. Add human participants from lifecycle projection (not in AgentStorage).
  // Phase A fail-closed admission: a human-typed id matching a canonical
  // agent id is a turn-target leak, and surface ids are client attribution —
  // neither is a human principal. Such rows are quarantined (excluded here,
  // preserved in storage and stream): they must never manufacture Humans.
  // UNKNOWN stays unlisted rather than guessing.
  const canonicalAgentIds = new Set(allAgents.map((agent) => agent.id));
  for (const p of lifecycleParticipants) {
    if (p.type === 'human' && !seenIds.has(p.participantId)) {
      if (!isAdmittedHumanParticipant(p.participantId, canonicalAgentIds)) continue;
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
  _req: http.IncomingMessage,
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
    const pendingRuntimeQuestions = projectPendingRuntimeQuestions(room.runtimeQuestions?.listPending() ?? []);
    const runtimeQuestionAttention = projectRuntimeQuestionAttention(pendingRuntimeQuestions);
    const participants = await composeParticipants(ctx, room);
    // AR-SNAPSHOT-002: snapshot membership is newest-N projectable Activity
    // entities selected by the M11A SnapshotProjector (operations consume
    // zero entity slots), not a raw tail of stream items. Wire shape and
    // frontier cursor are unchanged, so M11C hydration is untouched.
    const selection = await projectActivitySnapshot(
      {
        fetchPage: (beforeSequence, limit) => room.store.query({ beforeSequence, limit }),
        projectRecord: (record) => room.runtime.projectRecord(record),
      },
      { startBefore: projection.room.cursor.sequenceNumber + 1 },
    );
    json(res, 200, {
      room: projection.room,
      participants: participants.map(sanitizeParticipant),
      // Snapshot hydration must retain one row per projected activity. The
      // compact projection intentionally aggregates muted runs, but using it
      // here made a refresh replace a populated stream with one aggregate.
      // Keep the API bounded while preserving raw activity identity so M11C
      // can dedupe catch-up events and maintain edit/session correlation.
      stream: selection.items.map(sanitizeStreamItem),
      entities: selection.entities.map(sanitizeSnapshotEntity),
      complete: selection.complete,
      entityCount: selection.entityCount,
      workflowSummary: projection.workflowSummary ? sanitizeWorkflowSummary(projection.workflowSummary) : null,
      attention: dedupeAttention([...projection.attention, ...runtimeQuestionAttention])
        .filter((entry) => entry.status === 'open')
        .map(sanitizeAttention),
      pendingRuntimeQuestions: pendingRuntimeQuestions.map(sanitizePendingRuntimeQuestion),
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
    const record = (await room.store.getByActivityId(activityId)) ?? (await room.store.getByEventId(activityId));

    if (!record) {
      json(res, 404, {
        error: { code: 'NOT_FOUND', message: `Activity not found: ${activityId}` },
      });
      return true;
    }

    json(res, 200, {
      record: sanitizeRecord(record),
      projection: sanitizeProjectionRecord(toProjectionRecord(record)),
    });
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

    if (!aggregatedItem?.aggregated) {
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
    const pendingRuntimeQuestions = projectPendingRuntimeQuestions(room.runtimeQuestions?.listPending() ?? []);
    const runtimeQuestionAttention = projectRuntimeQuestionAttention(pendingRuntimeQuestions);
    const legacyPage = await getActivityRoom().store.list({
      workflowId: stringValue(url.searchParams.get('workflowId')),
      sessionId: stringValue(url.searchParams.get('sessionId')),
    });
    const legacyAttention = projectAttentionEntries(legacyPage.records);
    const [systemAttention, repositoryAttention] = await Promise.all([
      projectSystemAttention(ctx),
      projectRepositoryAttention(ctx),
    ]);
    const attention = dedupeAttention([
      ...projection.attention,
      ...runtimeQuestionAttention,
      ...legacyAttention,
      ...systemAttention,
      ...repositoryAttention,
    ])
      .filter((entry) => entry.status === 'open')
      .sort(attentionSort);
    json(res, 200, {
      attention: attention.map(sanitizeAttention),
      pendingRuntimeQuestions: pendingRuntimeQuestions.map(sanitizePendingRuntimeQuestion),
      count: attention.length,
    });
    return true;
  }

  // ─── POST /api/activity-room/v1/interactions/:id/present ──
  // AR-TOOL-ASK-003A4B: authoritative presentation mutation. Resolves the
  // EXACT persisted RuntimeInteraction and atomically presents it
  // (pending → presented, re-presentation rotates token + version).
  // Rationale for POST (not GET): presentation MUTATES authoritative state
  // and mints a single-use credential, so it is never safe, idempotent, or
  // cacheable. GET would let proxies/caches replay credentials; POST with
  // `Cache-Control: no-store` keeps exactly one valid token/version pair.
  // The claim token is returned ONLY in this response body — never in M9,
  // SSE, Activity, logs, diagnostics, or projections. Never claims, never
  // delivers to OpenCode (no reply/reject here; 003B owns delivery).
  if (method === 'POST' && p.match(/^\/api\/activity-room\/v1\/interactions\/[^/]+\/present$/)) {
    const segments = p.split('/');
    const interactionId = decodeURIComponent(segments[segments.length - 2] as string);
    if (!interactionId) {
      json(res, 400, { error: { code: 'INVALID_IDENTITY', message: 'interaction id is required.' } });
      return true;
    }
    let parsed: unknown;
    try {
      const raw = await readBody(_req);
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      json(res, 400, { error: { code: 'INVALID_BODY', message: 'Request body is not valid JSON.' } });
      return true;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      json(res, 400, { error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object.' } });
      return true;
    }
    const body = parsed as Record<string, unknown>;
    const allowed = new Set(['conversationId', 'openCodeSessionId', 'openCodeRequestId']);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) {
        json(res, 400, { error: { code: 'INVALID_BODY', message: `Unexpected field: ${key}.` } });
        return true;
      }
    }
    const conversationId = body.conversationId;
    if (typeof conversationId !== 'string' || conversationId.length === 0) {
      json(res, 400, { error: { code: 'INVALID_IDENTITY', message: 'conversationId is required.' } });
      return true;
    }
    const openCodeSessionId = body.openCodeSessionId;
    if (openCodeSessionId !== undefined && (typeof openCodeSessionId !== 'string' || openCodeSessionId.length === 0)) {
      json(res, 400, { error: { code: 'INVALID_IDENTITY', message: 'openCodeSessionId must be a non-empty string.' } });
      return true;
    }
    const openCodeRequestId = body.openCodeRequestId;
    if (openCodeRequestId !== undefined && (typeof openCodeRequestId !== 'string' || openCodeRequestId.length === 0)) {
      json(res, 400, { error: { code: 'INVALID_IDENTITY', message: 'openCodeRequestId must be a non-empty string.' } });
      return true;
    }
    const store = room.runtimeQuestions;
    if (store === null) {
      json(res, 503, {
        error: {
          code: 'RUNTIME_QUESTIONS_UNAVAILABLE',
          message: 'RuntimeInteraction authority unavailable; explicit migration required.',
        },
      });
      return true;
    }
    try {
      const presentation = presentRuntimeQuestionForBrowser(store, {
        interactionId,
        conversationId,
        ...(typeof openCodeSessionId === 'string' ? { openCodeSessionId } : {}),
        ...(typeof openCodeRequestId === 'string' ? { openCodeRequestId } : {}),
      });
      if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');
      json(res, 200, { presentation });
    } catch (error) {
      if (error instanceof Error && error.message.includes('unknown interaction id')) {
        json(res, 404, { error: { code: 'NOT_FOUND', message: 'Interaction not found.' } });
        return true;
      }
      if (error instanceof RuntimeQuestionTransitionError) {
        if (error.from === 'expired' || error.reason.includes('expired')) {
          json(res, 410, { error: { code: 'GONE', message: 'Interaction expired.' } });
          return true;
        }
        json(res, 409, { error: { code: 'NOT_PRESENTABLE', message: 'Interaction is not presentable.' } });
        return true;
      }
      json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Presentation failed.' } });
    }
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
