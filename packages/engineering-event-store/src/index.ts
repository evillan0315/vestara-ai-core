import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ThreadStore } from '@vestara/thread-runtime';
import type { AgentRunOutcome, AgentTurn, TaskThreadId, ThreadItem } from '@vestara/types';
import type { Database, SqlValue } from 'sql.js';

export interface EngineeringTruthEventInput {
  readonly id?: string;
  readonly type: string;
  readonly at?: string;
  readonly source: string;
  readonly actorId: string;
  readonly authority: 'user' | 'system' | 'agent' | 'policy' | 'verification';
  readonly workspaceId: string;
  readonly environmentId?: string;
  readonly taskId?: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly toolCallId?: string;
  readonly verificationRunId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EngineeringTruthEvent extends EngineeringTruthEventInput {
  readonly id: string;
  readonly seq: number;
  readonly at: string;
  readonly previousHash: string;
  readonly hash: string;
}

export interface EngineeringEventQuery {
  readonly afterSequence?: number;
  readonly type?: string;
  readonly taskId?: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly toolCallId?: string;
  readonly verificationRunId?: string;
  readonly correlationId?: string;
  readonly limit?: number;
}

export interface EvidenceManifestInput {
  readonly runId: string;
  readonly repository: string;
  readonly implementationCommit: string;
  readonly verifiedAt?: string;
  readonly verifiedBy: string;
  readonly scope: readonly string[];
  readonly limitations: readonly string[];
  readonly commands: readonly Readonly<Record<string, unknown>>[];
  readonly artifacts: readonly ContentAddressedArtifactRef[];
  readonly outcome: 'passed' | 'failed' | 'inconclusive' | 'blocked';
  readonly correlationId: string;
  readonly threadId?: string;
  readonly turnId?: string;
}

export interface ContentAddressedArtifactRef {
  readonly algorithm: 'sha256';
  readonly digest: string;
  readonly size: number;
  readonly mediaType: string;
  readonly kind: string;
  readonly summary: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvidenceArtifactInput {
  readonly content: string | Uint8Array;
  readonly mediaType: string;
  readonly kind: string;
  readonly summary: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ThreadRecoveryResult {
  readonly action: 'resumed' | 'abandoned' | 'reconciled';
  readonly threadId: string;
  readonly previousTurnId: string;
  readonly resumedTurn?: AgentTurn;
  readonly checkpointId: string;
}

export interface EvidenceManifest extends EvidenceManifestInput {
  readonly schemaVersion: 1;
  readonly verifiedAt: string;
  readonly checksum: { readonly algorithm: 'sha256'; readonly digest: string };
}

export interface RecoveryDecision {
  readonly threadId: string;
  readonly turnId: string;
  readonly previousState: string;
  readonly decision: 'preserved-awaiting-approval' | 'blocked-interrupted';
  readonly sideEffectsPossible: boolean;
}

export interface HistoricalTruthGraph {
  readonly entities: readonly {
    readonly id: string;
    readonly kind: 'task' | 'thread' | 'turn' | 'tool-call' | 'verification' | 'evidence';
    readonly status?: string;
    readonly label: string;
  }[];
  readonly relationships: readonly {
    readonly from: string;
    readonly to: string;
    readonly type: 'contains' | 'executes' | 'verifies' | 'produced-artifact' | 'caused';
  }[];
}

let eventCounter = 0;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function rows(db: Database, sql: string, params: readonly SqlValue[] = []): readonly unknown[][] {
  const statement = db.prepare(sql);
  try {
    statement.bind([...params]);
    const result: unknown[][] = [];
    while (statement.step()) result.push(statement.get());
    return result;
  } finally {
    statement.free();
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class SqliteEngineeringEventStore {
  private constructor(
    private readonly db: Database,
    private readonly dbPath: string,
  ) {
    this.initialize();
  }

  static async open(dbPath: string): Promise<SqliteEngineeringEventStore> {
    const initSqlJs = (await import('sql.js')).default;
    const sqlJsDir = path.dirname(require.resolve('sql.js'));
    const SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlJsDir, file) });
    const data = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
    return new SqliteEngineeringEventStore(data ? new SQL.Database(data) : new SQL.Database(), path.resolve(dbPath));
  }

  append(input: EngineeringTruthEventInput): EngineeringTruthEvent {
    const head = rows(this.db, 'SELECT seq, hash FROM engineering_events ORDER BY seq DESC LIMIT 1')[0];
    const seq = Number(head?.[0] ?? 0) + 1;
    const previousHash = String(head?.[1] ?? 'GENESIS');
    const at = input.at ?? new Date().toISOString();
    const id = input.id ?? `engineering-event-${Date.now()}-${++eventCounter}`;
    const unsigned = { ...input, id, seq, at, previousHash };
    const event: EngineeringTruthEvent = { ...unsigned, hash: digest(unsigned) };
    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run(
        `INSERT INTO engineering_events
         (seq, id, at, type, source, actor_id, authority, workspace_id, environment_id, task_id, thread_id,
          turn_id, tool_call_id, verification_run_id, correlation_id, causation_id, payload_json, previous_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.seq,
          event.id,
          event.at,
          event.type,
          event.source,
          event.actorId,
          event.authority,
          event.workspaceId,
          event.environmentId ?? null,
          event.taskId ?? null,
          event.threadId ?? null,
          event.turnId ?? null,
          event.toolCallId ?? null,
          event.verificationRunId ?? null,
          event.correlationId,
          event.causationId ?? null,
          canonical(event.payload),
          event.previousHash,
          event.hash,
        ],
      );
      this.db.run('COMMIT');
      this.persist();
      return event;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  appendThreadItem(input: {
    readonly item: ThreadItem;
    readonly workspaceId: string;
    readonly environmentId: string;
    readonly taskId: string;
  }): EngineeringTruthEvent {
    const payload = record(input.item.payload);
    return this.append({
      id: `thread-item:${input.item.id}`,
      type: `harness.${input.item.kind}`,
      at: input.item.createdAt,
      source: input.item.actorId,
      actorId: input.item.actorId,
      authority: authorityFor(input.item),
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      taskId: input.taskId,
      threadId: input.item.threadId,
      turnId: input.item.turnId,
      toolCallId: typeof payload.callId === 'string' ? payload.callId : undefined,
      verificationRunId: input.item.kind === 'verification-result' ? `verification-${input.item.turnId}` : undefined,
      correlationId: input.item.correlationId,
      causationId: input.item.causationId,
      payload,
    });
  }

  query(query: EngineeringEventQuery = {}): readonly EngineeringTruthEvent[] {
    const clauses = ['seq > ?'];
    const params: SqlValue[] = [query.afterSequence ?? 0];
    for (const [column, value] of [
      ['type', query.type],
      ['task_id', query.taskId],
      ['thread_id', query.threadId],
      ['turn_id', query.turnId],
      ['tool_call_id', query.toolCallId],
      ['verification_run_id', query.verificationRunId],
      ['correlation_id', query.correlationId],
    ] as const) {
      if (value !== undefined) {
        clauses.push(`${column} = ?`);
        params.push(value);
      }
    }
    params.push(Math.max(1, Math.min(1_000_000, query.limit ?? 10_000)));
    return rows(
      this.db,
      `SELECT * FROM engineering_events WHERE ${clauses.join(' AND ')} ORDER BY seq LIMIT ?`,
      params,
    ).map(eventFromRow);
  }

  has(id: string): boolean {
    return rows(this.db, 'SELECT 1 FROM engineering_events WHERE id = ? LIMIT 1', [id]).length > 0;
  }

  verifyIntegrity(): { readonly valid: boolean; readonly checked: number; readonly brokenSequence?: number } {
    let previousHash = 'GENESIS';
    const events = this.query({ limit: 1_000_000 });
    for (const event of events) {
      const { hash, ...unsigned } = event;
      if (event.previousHash !== previousHash || digest(unsigned) !== hash)
        return { valid: false, checked: event.seq - 1, brokenSequence: event.seq };
      previousHash = event.hash;
    }
    return { valid: true, checked: events.length };
  }

  projectGraph(atSequence = Number.MAX_SAFE_INTEGER): HistoricalTruthGraph {
    return projectTruthGraph(this.query({ limit: 1_000_000 }).filter((event) => event.seq <= atSequence));
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  private initialize(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS engineering_events (
        seq INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        authority TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        environment_id TEXT,
        task_id TEXT,
        thread_id TEXT,
        turn_id TEXT,
        tool_call_id TEXT,
        verification_run_id TEXT,
        correlation_id TEXT NOT NULL,
        causation_id TEXT,
        payload_json TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_truth_task ON engineering_events(task_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_thread ON engineering_events(thread_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_turn ON engineering_events(turn_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_tool ON engineering_events(tool_call_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_verification ON engineering_events(verification_run_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_correlation ON engineering_events(correlation_id, seq);
      CREATE INDEX IF NOT EXISTS idx_truth_causation ON engineering_events(causation_id, seq);
    `);
    this.persist();
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const temporaryPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(this.db.export()));
    fs.renameSync(temporaryPath, this.dbPath);
  }
}

export class ImmutableEvidenceManifestStore {
  constructor(private readonly directory: string) {}

  write(input: EvidenceManifestInput): EvidenceManifest {
    validateCommit(input.implementationCommit);
    const unsigned = { schemaVersion: 1 as const, ...input, verifiedAt: input.verifiedAt ?? new Date().toISOString() };
    const manifest: EvidenceManifest = {
      ...unsigned,
      checksum: { algorithm: 'sha256', digest: digest(unsigned) },
    };
    fs.mkdirSync(this.directory, { recursive: true });
    const target = this.pathFor(input.runId);
    if (fs.existsSync(target)) throw new Error(`Evidence manifest is immutable: ${input.runId}`);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, target);
    return manifest;
  }

  read(runId: string): EvidenceManifest | undefined {
    const target = this.pathFor(runId);
    if (!fs.existsSync(target)) return undefined;
    return JSON.parse(fs.readFileSync(target, 'utf8')) as EvidenceManifest;
  }

  verify(runId: string): boolean {
    const manifest = this.read(runId);
    if (!manifest) return false;
    const { checksum, ...unsigned } = manifest;
    return checksum.algorithm === 'sha256' && digest(unsigned) === checksum.digest;
  }

  verifyArtifacts(
    runId: string,
    artifacts: ContentAddressedEvidenceStore,
  ): { readonly valid: boolean; readonly missing: readonly string[]; readonly corrupted: readonly string[] } {
    const manifest = this.read(runId);
    if (!manifest || !this.verify(runId)) return { valid: false, missing: [], corrupted: [] };
    const validReferences = manifest.artifacts.filter(isContentAddressedArtifactRef);
    const invalid = manifest.artifacts
      .map((artifact, index) => ({ artifact, index }))
      .filter(({ artifact }) => !isContentAddressedArtifactRef(artifact))
      .map(({ index }) => `invalid-reference:${index}`);
    const missing = validReferences
      .filter((artifact) => !artifacts.has(artifact.digest))
      .map((artifact) => artifact.digest);
    const corrupted = validReferences
      .filter((artifact) => artifacts.has(artifact.digest) && !artifacts.verify(artifact))
      .map((artifact) => artifact.digest);
    corrupted.push(...invalid);
    return { valid: missing.length === 0 && corrupted.length === 0, missing, corrupted };
  }

  list(): readonly EvidenceManifest[] {
    if (!fs.existsSync(this.directory)) return [];
    return fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(path.join(this.directory, file), 'utf8')) as EvidenceManifest);
  }

  private pathFor(runId: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(runId)) throw new Error(`Unsafe evidence run id: ${runId}`);
    return path.join(this.directory, `${runId}.json`);
  }
}

function isContentAddressedArtifactRef(value: unknown): value is ContentAddressedArtifactRef {
  const candidate = record(value);
  return (
    candidate.algorithm === 'sha256' &&
    typeof candidate.digest === 'string' &&
    /^[0-9a-f]{64}$/i.test(candidate.digest) &&
    typeof candidate.size === 'number' &&
    candidate.size >= 0 &&
    typeof candidate.mediaType === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.summary === 'string'
  );
}

/** Immutable content-addressed storage for large verification outputs and observations. */
export class ContentAddressedEvidenceStore {
  constructor(private readonly directory: string) {}

  put(input: EvidenceArtifactInput): ContentAddressedArtifactRef {
    const bytes = typeof input.content === 'string' ? Buffer.from(input.content) : Buffer.from(input.content);
    const artifactDigest = createHash('sha256').update(bytes).digest('hex');
    const target = this.pathFor(artifactDigest);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) {
      const temporary = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, bytes, { flag: 'wx' });
      try {
        fs.renameSync(temporary, target);
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        if (!fs.existsSync(target)) throw error;
      }
    }
    return {
      algorithm: 'sha256',
      digest: artifactDigest,
      size: bytes.byteLength,
      mediaType: input.mediaType,
      kind: input.kind,
      summary: input.summary,
      metadata: input.metadata,
    };
  }

  putJson(value: unknown, input: Omit<EvidenceArtifactInput, 'content' | 'mediaType'>): ContentAddressedArtifactRef {
    return this.put({ ...input, content: `${canonical(value)}\n`, mediaType: 'application/json' });
  }

  putFile(filePath: string, input: Omit<EvidenceArtifactInput, 'content'>): ContentAddressedArtifactRef {
    return this.put({ ...input, content: fs.readFileSync(filePath) });
  }

  read(digestValue: string): Buffer | undefined {
    const target = this.pathFor(digestValue);
    return fs.existsSync(target) ? fs.readFileSync(target) : undefined;
  }

  verify(reference: ContentAddressedArtifactRef): boolean {
    const value = this.read(reference.digest);
    return (
      value !== undefined &&
      value.byteLength === reference.size &&
      createHash('sha256').update(value).digest('hex') === reference.digest
    );
  }

  has(digestValue: string): boolean {
    return fs.existsSync(this.pathFor(digestValue));
  }

  private pathFor(digestValue: string): string {
    if (!/^[0-9a-f]{64}$/i.test(digestValue)) throw new Error(`Invalid evidence artifact digest: ${digestValue}`);
    const normalized = digestValue.toLowerCase();
    return path.join(this.directory, 'sha256', normalized.slice(0, 2), normalized);
  }
}

/** Explicit recovery operations; interrupted mutations are never resumed without reconciliation evidence. */
export class DurableThreadRecoveryService {
  constructor(
    private readonly threads: ThreadStore,
    private readonly events: SqliteEngineeringEventStore,
    private readonly workspaceId: string,
    private readonly environmentId: string,
  ) {}

  recover(input: {
    readonly threadId: TaskThreadId;
    readonly action: 'resume' | 'abandon' | 'reconcile';
    readonly actorId: string;
    readonly reason: string;
    readonly sideEffectsReconciled?: boolean;
  }): ThreadRecoveryResult {
    const thread = this.threads.getThread(input.threadId);
    if (!thread) throw new Error(`Thread not found: ${input.threadId}`);
    const previousTurn = this.threads.listTurns(thread.id).at(-1);
    if (!previousTurn) throw new Error(`Thread has no turn to recover: ${input.threadId}`);
    if (previousTurn.state !== 'blocked' && previousTurn.state !== 'awaiting-approval')
      throw new Error(`Thread is not recoverable from state: ${previousTurn.state}`);
    const sideEffectsPossible = previousTurn.outcome?.reasonCode === 'restart-side-effects-inconclusive';
    if (input.action === 'resume' && sideEffectsPossible && input.sideEffectsReconciled !== true)
      throw new Error('Interrupted side effects must be explicitly reconciled before resume');

    const checkpoint = this.threads.createCheckpoint({
      threadId: thread.id,
      turnId: previousTurn.id,
      reason: `recovery-${input.action}`,
      snapshot: {
        actorId: input.actorId,
        reason: input.reason,
        previousState: previousTurn.state,
        previousOutcome: previousTurn.outcome,
        sideEffectsReconciled: input.sideEffectsReconciled ?? false,
        itemCount: this.threads.listItems(thread.id, previousTurn.id).length,
      },
    });
    let resumedTurn: AgentTurn | undefined;
    if (input.action === 'resume') {
      this.threads.updateThreadStatus(thread.id, 'active');
      resumedTurn = this.threads.createTurn({ threadId: thread.id, input: previousTurn.input });
    } else if (input.action === 'abandon') {
      if (previousTurn.state === 'awaiting-approval') {
        this.threads.transitionTurn(previousTurn.id, 'cancelled', {
          state: 'cancelled',
          summary: input.reason,
          reasonCode: 'recovery-abandoned',
          completedAt: new Date().toISOString(),
        });
      }
      this.threads.updateThreadStatus(thread.id, 'cancelled');
    }
    const action = input.action === 'resume' ? 'resumed' : input.action === 'abandon' ? 'abandoned' : 'reconciled';
    this.events.append({
      type: `recovery.thread-${action}`,
      source: 'thread-recovery-service',
      actorId: input.actorId,
      authority: input.actorId === 'system' ? 'system' : 'user',
      workspaceId: this.workspaceId,
      environmentId: this.environmentId,
      taskId: thread.taskId,
      threadId: thread.id,
      turnId: previousTurn.id,
      correlationId: `recovery:${previousTurn.id}`,
      payload: {
        reason: input.reason,
        checkpointId: checkpoint.id,
        sideEffectsPossible,
        sideEffectsReconciled: input.sideEffectsReconciled ?? false,
        resumedTurnId: resumedTurn?.id,
      },
    });
    return { action, threadId: thread.id, previousTurnId: previousTurn.id, resumedTurn, checkpointId: checkpoint.id };
  }
}

export function inspectGitImplementation(workspaceRoot: string): {
  readonly repository: string;
  readonly commit: string;
} {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
  let repository: string;
  try {
    repository = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    repository = path.resolve(workspaceRoot);
  }
  validateCommit(commit);
  return { repository: repository || path.resolve(workspaceRoot), commit };
}

export function reconcileInterruptedThreads(input: {
  readonly threads: ThreadStore;
  readonly events: SqliteEngineeringEventStore;
  readonly workspaceId: string;
  readonly environmentId: string;
}): readonly RecoveryDecision[] {
  const decisions: RecoveryDecision[] = [];
  for (const thread of input.threads.listThreads()) {
    const turn = input.threads.getActiveTurn(thread.id);
    if (!turn) continue;
    if (turn.state === 'awaiting-approval') {
      const decision: RecoveryDecision = {
        threadId: thread.id,
        turnId: turn.id,
        previousState: turn.state,
        decision: 'preserved-awaiting-approval',
        sideEffectsPossible: false,
      };
      input.events.append(recoveryEvent(decision, thread.taskId, input.workspaceId, input.environmentId));
      decisions.push(decision);
      continue;
    }
    if (['blocked', 'completed', 'failed', 'cancelled'].includes(turn.state)) continue;
    const items = input.threads.listItems(thread.id, turn.id);
    const calls = items.filter((item) => item.kind === 'tool-call');
    const results = new Set(
      items.filter((item) => item.kind === 'tool-result').map((item) => String(record(item.payload).callId ?? '')),
    );
    const sideEffectsPossible = calls.some((item) => !results.has(String(record(item.payload).callId ?? '')));
    const outcome: AgentRunOutcome = {
      state: 'blocked',
      summary: sideEffectsPossible
        ? 'Interrupted tool execution requires reconciliation before resume'
        : 'Interrupted agent turn is safe to reassign or resume explicitly',
      reasonCode: sideEffectsPossible ? 'restart-side-effects-inconclusive' : 'restart-resumable',
      completedAt: new Date().toISOString(),
    };
    input.threads.transitionTurn(turn.id, 'blocked', outcome);
    input.threads.updateThreadStatus(thread.id, 'blocked');
    const decision: RecoveryDecision = {
      threadId: thread.id,
      turnId: turn.id,
      previousState: turn.state,
      decision: 'blocked-interrupted',
      sideEffectsPossible,
    };
    input.events.append(recoveryEvent(decision, thread.taskId, input.workspaceId, input.environmentId));
    decisions.push(decision);
  }
  return decisions;
}

export function importThreadHistory(input: {
  readonly threads: ThreadStore;
  readonly events: SqliteEngineeringEventStore;
  readonly workspaceId: string;
  readonly environmentId: string;
}): { readonly imported: number; readonly existing: number } {
  const items = input.threads
    .listThreads()
    .flatMap((thread) => input.threads.listItems(thread.id).map((item) => ({ item, taskId: thread.taskId })))
    .sort((left, right) =>
      left.item.createdAt === right.item.createdAt
        ? left.item.id.localeCompare(right.item.id)
        : left.item.createdAt.localeCompare(right.item.createdAt),
    );
  let imported = 0;
  let existing = 0;
  for (const entry of items) {
    if (input.events.has(`thread-item:${entry.item.id}`)) {
      existing++;
      continue;
    }
    input.events.appendThreadItem({
      item: entry.item,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      taskId: entry.taskId,
    });
    imported++;
  }
  return { imported, existing };
}

export function generatedStatus(events: readonly EngineeringTruthEvent[], manifests: readonly EvidenceManifest[]) {
  const verifiedTurns = new Set(
    manifests.filter((manifest) => manifest.outcome === 'passed').map((manifest) => manifest.turnId),
  );
  const completed = events.filter(
    (event) => event.type === 'harness.final-outcome' && record(event.payload).state === 'completed',
  );
  return {
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
    verificationManifestCount: manifests.length,
    completedTurns: completed.length,
    verifiedTurns: completed.filter((event) => verifiedTurns.has(event.turnId)).length,
    missingEvidence: completed.filter((event) => !verifiedTurns.has(event.turnId)).map((event) => event.turnId),
    interruptedTurns: events
      .filter((event) => event.type === 'recovery.turn-reconciled')
      .map((event) => ({ turnId: event.turnId, ...event.payload })),
  };
}

function authorityFor(item: ThreadItem): EngineeringTruthEventInput['authority'] {
  if (item.kind === 'approval-request' || item.actorId === 'policy-runtime') return 'policy';
  if (item.kind === 'verification-result' || item.actorId === 'verification-runtime') return 'verification';
  if (item.actorId === 'user' || item.actorId === 'console-user') return 'user';
  if (item.actorId === 'agent-harness' || item.actorId === 'tool-runtime') return 'system';
  return 'agent';
}

function recoveryEvent(
  decision: RecoveryDecision,
  taskId: string,
  workspaceId: string,
  environmentId: string,
): EngineeringTruthEventInput {
  return {
    type: 'recovery.turn-reconciled',
    source: 'engineering-event-store',
    actorId: 'recovery-runtime',
    authority: 'system',
    workspaceId,
    environmentId,
    taskId,
    threadId: decision.threadId,
    turnId: decision.turnId,
    correlationId: `recovery:${decision.turnId}`,
    payload: { ...decision },
  };
}

function validateCommit(commit: string): void {
  if (!/^[0-9a-f]{40,64}$/i.test(commit))
    throw new Error(`Verified evidence requires an immutable implementation commit, received: ${commit}`);
}

function eventFromRow(row: readonly unknown[]): EngineeringTruthEvent {
  return {
    seq: Number(row[0]),
    id: String(row[1]),
    at: String(row[2]),
    type: String(row[3]),
    source: String(row[4]),
    actorId: String(row[5]),
    authority: String(row[6]) as EngineeringTruthEvent['authority'],
    workspaceId: String(row[7]),
    environmentId: row[8] ? String(row[8]) : undefined,
    taskId: row[9] ? String(row[9]) : undefined,
    threadId: row[10] ? String(row[10]) : undefined,
    turnId: row[11] ? String(row[11]) : undefined,
    toolCallId: row[12] ? String(row[12]) : undefined,
    verificationRunId: row[13] ? String(row[13]) : undefined,
    correlationId: String(row[14]),
    causationId: row[15] ? String(row[15]) : undefined,
    payload: JSON.parse(String(row[16])) as Readonly<Record<string, unknown>>,
    previousHash: String(row[17]),
    hash: String(row[18]),
  };
}

function projectTruthGraph(events: readonly EngineeringTruthEvent[]): HistoricalTruthGraph {
  const entities = new Map<string, HistoricalTruthGraph['entities'][number]>();
  const relationships = new Map<string, HistoricalTruthGraph['relationships'][number]>();
  const addEntity = (entity: HistoricalTruthGraph['entities'][number]) => entities.set(entity.id, entity);
  const addRelationship = (relationship: HistoricalTruthGraph['relationships'][number]) =>
    relationships.set(`${relationship.from}:${relationship.type}:${relationship.to}`, relationship);
  for (const event of events) {
    if (event.taskId) addEntity({ id: `task:${event.taskId}`, kind: 'task', label: event.taskId });
    if (event.threadId) {
      addEntity({ id: `thread:${event.threadId}`, kind: 'thread', label: event.threadId });
      if (event.taskId)
        addRelationship({ from: `task:${event.taskId}`, to: `thread:${event.threadId}`, type: 'contains' });
    }
    if (event.turnId) {
      const status = event.type === 'harness.final-outcome' ? String(record(event.payload).state ?? '') : undefined;
      addEntity({ id: `turn:${event.turnId}`, kind: 'turn', label: event.turnId, status });
      if (event.threadId)
        addRelationship({ from: `thread:${event.threadId}`, to: `turn:${event.turnId}`, type: 'contains' });
    }
    if (event.toolCallId) {
      addEntity({
        id: `tool-call:${event.toolCallId}`,
        kind: 'tool-call',
        label: String(record(event.payload).toolName ?? event.toolCallId),
      });
      if (event.turnId)
        addRelationship({ from: `turn:${event.turnId}`, to: `tool-call:${event.toolCallId}`, type: 'executes' });
    }
    if (event.verificationRunId) {
      addEntity({
        id: event.verificationRunId,
        kind: 'verification',
        label: event.verificationRunId,
        status: String(record(event.payload).status ?? ''),
      });
      if (event.turnId)
        addRelationship({ from: `turn:${event.turnId}`, to: event.verificationRunId, type: 'verifies' });
    }
  }
  return { entities: [...entities.values()], relationships: [...relationships.values()] };
}
