/**
 * AR-TOOL-ASK-003A — Durable Runtime Question Interaction Authority.
 *
 * SQLite-backed lifecycle authority for runtime `question.asked`
 * interactions: pending → presented → claimed, with contract-defined
 * terminal states (answered | rejected | expired | orphaned |
 * delivery-unknown) representable but NOT driven by OpenCode in this
 * milestone.
 *
 * 003A boundary (frozen):
 * - This authority records the human claim. It NEVER performs the OpenCode
 *   question reply/reject calls, never leases delivery, never retries
 *   the network, never reconciles on restart. Delivery is AR-TOOL-ASK-003B.
 * - The pre-existing OpenCode response path in the API adapter is preserved
 *   untouched; this store is not wired to it, so there are never two active
 *   delivery authorities.
 * - M9 remains evidence/projection only: this store never writes M9 rows
 *   and M9 never drives these transitions.
 *
 * Transaction boundaries: every mutation runs in its own
 * `BEGIN IMMEDIATE … COMMIT` (rollback on error). The claim CAS is a single
 * conditional UPDATE so exactly one claimant wins under contention:
 *
 *   UPDATE runtime_question_interactions
 *      SET status='claimed', claim_token=NULL, answers_json=?,
 *          decided_by=?, decided_at=?, claimed_at=?, version=version+1,
 *          updated_at=?
 *    WHERE interaction_id=? AND status='presented'
 *      AND claim_token=? AND version=?
 *
 * changes = 1 → claim won. changes = 0 → stale token, stale version, wrong
 * id, or non-presented status (all rejected, fail closed).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  boundRuntimeAnswers,
  boundRuntimeQuestions,
  type ClaimRuntimeQuestionInput,
  type ClaimRuntimeQuestionRejectionInput,
  deriveRuntimeQuestionInteractionId,
  type IngestRuntimeQuestionInput,
  RUNTIME_QUESTION_BOUNDS,
  RUNTIME_QUESTION_DEFAULT_TTL_MS,
  type RuntimeQuestionInteraction,
  type RuntimeQuestionStatus,
  RuntimeQuestionTransitionError,
  requireExactIdentity,
} from './runtime-interaction-contract';
import {
  inspectRuntimeInteractionSchema,
  migrateRuntimeInteractionSchema,
  RuntimeInteractionSchemaCompatibilityError,
} from './runtime-interaction-schema';

type Row = Record<string, unknown>;

export interface RuntimeQuestionStoreOptions {
  readonly busyTimeoutMs?: number;
  readonly onPersistenceError?: (error: unknown) => void;
}

export class RuntimeInteractionStoreOpenError extends Error {
  readonly status: 'migration-required' | 'incompatible' | 'corrupt';
  readonly dbPath: string;

  constructor(status: 'migration-required' | 'incompatible' | 'corrupt', dbPath: string, message: string) {
    super(message);
    this.name = 'RuntimeInteractionStoreOpenError';
    this.status = status;
    this.dbPath = dbPath;
  }
}

export interface ExpireUnclaimedResult {
  readonly expiredCount: number;
  readonly expiredIds: readonly string[];
}

export class RuntimeQuestionInteractionStore {
  private readonly onPersistenceError?: (error: unknown) => void;

  constructor(
    private readonly db: DatabaseSync,
    options: RuntimeQuestionStoreOptions = {},
  ) {
    // Fail closed on foreign/absent schema: ordinary construction never
    // creates RuntimeInteraction objects. Use the explicit migrate() path.
    try {
      const inspection = inspectRuntimeInteractionSchema(db);
      if (inspection.status !== 'current') {
        throw new RuntimeInteractionSchemaCompatibilityError(inspection.status, inspection.reason);
      }
    } catch (error) {
      options.onPersistenceError?.(error);
      throw error;
    }
    this.onPersistenceError = options.onPersistenceError;
  }

  /**
   * Explicit open boundary for the RuntimeInteraction domain. Opens the
   * shared physical database file and fails closed with a
   * RuntimeInteraction-specific error when this domain's schema is absent
   * or incompatible. Never migrates: M9 validity is never consulted and an
   * M9-invalid database does not stop this check from reporting this
   * domain's own status first where reached.
   */
  static open(dbPath: string, options: RuntimeQuestionStoreOptions = {}): RuntimeQuestionInteractionStore {
    const resolvedPath = path.resolve(dbPath);
    if (!existsSync(resolvedPath)) {
      throw new RuntimeInteractionStoreOpenError(
        'migration-required',
        resolvedPath,
        'RuntimeInteraction database does not exist; explicit migration is required',
      );
    }
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(resolvedPath);
    } catch (error) {
      throw new RuntimeInteractionStoreOpenError(
        'corrupt',
        resolvedPath,
        `RuntimeInteraction database could not be opened: ${String(error)}`,
      );
    }
    try {
      if (db === undefined) {
        throw new RuntimeInteractionStoreOpenError('corrupt', resolvedPath, 'database handle was not opened');
      }
      const busyTimeoutMs = Math.max(1, Math.min(1000, Math.floor(options.busyTimeoutMs ?? 250)));
      db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
      return new RuntimeQuestionInteractionStore(db, options);
    } catch (error) {
      try {
        db?.close();
      } catch {
        // Preserve the open error.
      }
      if (error instanceof RuntimeInteractionSchemaCompatibilityError) {
        throw new RuntimeInteractionStoreOpenError(error.status, resolvedPath, error.message);
      }
      throw error;
    }
  }

  /**
   * Explicit migration authority for the RuntimeInteraction domain. Creates
   * and versions ONLY RuntimeInteraction objects; never touches M9 tables,
   * indexes, allocator state, `PRAGMA user_version`, or journal settings.
   * Normal store opening never calls this path.
   */
  static migrate(dbPath: string, options: RuntimeQuestionStoreOptions = {}): void {
    const resolvedPath = path.resolve(dbPath);
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(resolvedPath);
      const busyTimeoutMs = Math.max(1, Math.min(1000, Math.floor(options.busyTimeoutMs ?? 250)));
      db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
      migrateRuntimeInteractionSchema(db);
    } catch (error) {
      options.onPersistenceError?.(error);
      throw error;
    } finally {
      try {
        db?.close();
      } catch {
        // Preserve the migration error.
      }
    }
  }

  /** Close the underlying database handle. */
  close(): void {
    this.db.close();
  }

  // ─── Ingestion: question.asked → durable pending ───────────

  /**
   * Idempotently ingest a runtime `question.asked` event as a pending
   * durable interaction. A duplicate ask for the same exact
   * (openCodeSessionId, openCodeRequestId) pair returns the existing row
   * unchanged — it can never create a second interaction.
   * Identities persist byte-for-byte; missing IDs throw (never inferred).
   */
  ingestAsked(input: IngestRuntimeQuestionInput): RuntimeQuestionInteraction {
    const conversationId = requireExactIdentity('conversationId', input.conversationId);
    const openCodeSessionId = requireExactIdentity('openCodeSessionId', input.openCodeSessionId);
    const openCodeRequestId = requireExactIdentity('openCodeRequestId', input.openCodeRequestId);
    const questions = boundRuntimeQuestions(input.questions);
    if (questions.length === 0) {
      throw new RuntimeQuestionTransitionError(
        deriveRuntimeQuestionInteractionId(openCodeSessionId, openCodeRequestId),
        'pending',
        'question.asked carried no usable questions; refusing to persist an empty ask',
      );
    }
    const questionsJson = JSON.stringify(questions);
    if (Buffer.byteLength(questionsJson, 'utf8') > RUNTIME_QUESTION_BOUNDS.maxQuestionsJsonBytes) {
      throw new RuntimeQuestionTransitionError(
        deriveRuntimeQuestionInteractionId(openCodeSessionId, openCodeRequestId),
        'pending',
        'bounded questions render data exceeds the persistence cap',
      );
    }
    const interactionId = deriveRuntimeQuestionInteractionId(openCodeSessionId, openCodeRequestId);
    const nowMs = input.nowMs ?? Date.now();
    const now = new Date(nowMs).toISOString();
    const ttlMs = input.ttlMs ?? RUNTIME_QUESTION_DEFAULT_TTL_MS;
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    const executionId = optionalIdentity(input.executionId);
    const turnId = optionalIdentity(input.turnId);
    const providerId = optionalIdentity(input.providerId);
    const modelId = optionalIdentity(input.modelId);

    return this.inTransaction(() => {
      const existing = this.getRow(interactionId);
      if (existing !== undefined) return this.rowToInteraction(existing);
      // UNIQUE (opencode_session_id, opencode_request_id) is the second
      // line of defense: same pair → same id, so this INSERT OR IGNORE
      // converges even if two writers race inside the transaction.
      this.db
        .prepare(
          `INSERT OR IGNORE INTO runtime_question_interactions (
            interaction_id, conversation_id, opencode_session_id, opencode_request_id,
            execution_id, turn_id, provider_id, model_id,
            questions_json, status, version, claim_token,
            expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?, ?)`,
        )
        .run(
          interactionId,
          conversationId,
          openCodeSessionId,
          openCodeRequestId,
          executionId,
          turnId,
          providerId,
          modelId,
          questionsJson,
          expiresAt,
          now,
          now,
        );
      const row = this.getRow(interactionId);
      if (row === undefined) throw new Error(`Runtime question interaction ${interactionId} was not persisted`);
      return this.rowToInteraction(row);
    });
  }

  // ─── Presentation: pending → presented (token + version) ───

  /**
   * Atomically present a pending interaction (or re-present an already
   * presented one). Each presentation mints a fresh single-use claim token
   * and increments the version. Terminal/claimed/expired rows are never
   * moved back into an answerable state — they throw.
   * Returns the updated interaction INCLUDING the new claim token (the
   * only time the token leaves the authority: hand it to the presenter).
   */
  present(interactionId: string, nowMs?: number): RuntimeQuestionInteraction {
    const now = new Date(nowMs ?? Date.now()).toISOString();
    // The expiry transition must COMMIT even when presentation is refused:
    // a throw inside the transaction would roll the expiry back, so the
    // closure returns an outcome sentinel and the throw happens after commit.
    const outcome = this.inTransaction(() => {
      const row = this.getRow(interactionId);
      if (row === undefined) throw new Error(`Runtime question interaction ${interactionId} not found`);
      const status = String(row.status) as RuntimeQuestionStatus;
      if (status !== 'pending' && status !== 'presented') {
        throw new RuntimeQuestionTransitionError(
          interactionId,
          status,
          'only pending or presented interactions can be presented; claimed/terminal rows never re-enter an answerable state',
        );
      }
      if (String(row.expires_at) <= now) {
        this.transitionToExpired(interactionId, now);
        return { expired: true as const, interaction: undefined as unknown as RuntimeQuestionInteraction };
      }
      // Authoritative re-presentation rotates token + version.
      const claimToken = randomUUID().replace(/-/g, '');
      const version = Number(row.version) + 1;
      this.db
        .prepare(
          `UPDATE runtime_question_interactions
              SET status = 'presented', claim_token = ?, version = ?,
                  presented_at = ?, updated_at = ?
            WHERE interaction_id = ?`,
        )
        .run(claimToken, version, now, now, interactionId);
      const updated = this.getRow(interactionId);
      if (updated === undefined) throw new Error(`Runtime question interaction ${interactionId} was not persisted`);
      return { expired: false as const, interaction: this.rowToInteraction(updated) };
    });
    if (outcome.expired) {
      throw new RuntimeQuestionTransitionError(
        interactionId,
        'expired',
        'interaction expired before presentation; fail closed',
      );
    }
    return outcome.interaction;
  }

  // ─── Claim: presented → claimed (single-use CAS) ───────────

  /**
   * Atomically claim a presented interaction. Requires the EXACT
   * interaction id + current single-use claim token + expected version.
   * Success consumes the token (NULL), persists answers, records decidedBy
   * (only where an authoritative actor identity was supplied) + decidedAt,
   * and increments the version. Exactly one claimant wins: changes = 1.
   * Every other outcome throws RuntimeQuestionTransitionError (fail closed).
   */
  claim(input: ClaimRuntimeQuestionInput): RuntimeQuestionInteraction {
    if (typeof input.interactionId !== 'string' || input.interactionId.length === 0) {
      throw new RuntimeQuestionTransitionError('(unknown)', 'pending', 'claim requires the exact interaction id');
    }
    if (typeof input.claimToken !== 'string' || input.claimToken.length === 0) {
      throw new RuntimeQuestionTransitionError(input.interactionId, 'presented', 'claim requires the claim token');
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new RuntimeQuestionTransitionError(input.interactionId, 'presented', 'claim requires the expected version');
    }
    const answers = boundRuntimeAnswers(input.answers);
    if (answers.length === 0 || answers.every((group) => group.length === 0)) {
      throw new RuntimeQuestionTransitionError(input.interactionId, 'presented', 'claim requires at least one answer');
    }
    const decidedBy = optionalIdentity(input.decidedBy);
    const now = new Date(input.nowMs ?? Date.now()).toISOString();

    // Like present(): the TTL-expiry transition must COMMIT even though the
    // claim is refused, so expiry is reported via an outcome sentinel and
    // the throw happens after commit (a throw inside would roll it back).
    const outcome = this.inTransaction(() => {
      const row = this.getRow(input.interactionId);
      if (row === undefined) {
        throw new RuntimeQuestionTransitionError(input.interactionId, 'pending', 'unknown interaction id');
      }
      const status = String(row.status) as RuntimeQuestionStatus;
      if (status === 'pending') {
        throw new RuntimeQuestionTransitionError(input.interactionId, status, 'pending interactions cannot be claimed');
      }
      if (status !== 'presented') {
        throw new RuntimeQuestionTransitionError(
          input.interactionId,
          status,
          'only presented interactions are answerable; claimed/terminal rows are permanently non-answerable',
        );
      }
      if (String(row.expires_at) <= now) {
        this.transitionToExpired(input.interactionId, now);
        return { expired: true as const, interaction: undefined as unknown as RuntimeQuestionInteraction };
      }
      const result = this.db
        .prepare(
          `UPDATE runtime_question_interactions
              SET status = 'claimed', claim_token = NULL, answers_json = ?,
                  decided_by = ?, decided_at = ?, claimed_at = ?,
                  version = version + 1, updated_at = ?
            WHERE interaction_id = ? AND status = 'presented'
              AND claim_token = ? AND version = ?`,
        )
        .run(
          JSON.stringify(answers),
          decidedBy,
          now,
          now,
          now,
          input.interactionId,
          input.claimToken,
          input.expectedVersion,
        ) as unknown as { changes: number };
      if (Number(result.changes) !== 1) {
        const current = this.getRow(input.interactionId);
        const currentStatus = current === undefined ? 'expired' : String(current.status);
        throw new RuntimeQuestionTransitionError(
          input.interactionId,
          currentStatus as RuntimeQuestionStatus,
          'claim CAS failed: stale token, stale version, wrong interaction, or no longer presented',
        );
      }
      const updated = this.getRow(input.interactionId);
      if (updated === undefined)
        throw new Error(`Runtime question interaction ${input.interactionId} was not persisted`);
      return { expired: false as const, interaction: this.rowToInteraction(updated) };
    });
    if (outcome.expired) {
      throw new RuntimeQuestionTransitionError(input.interactionId, 'expired', 'claim arrived after TTL; fail closed');
    }
    return outcome.interaction;
  }

  /**
   * Atomically claim a presented interaction for rejection. Rejection has no
   * answer groups, so it has a separate method rather than weakening claim().
   * Exactly one claimant wins through the same token/version CAS semantics.
   */
  claimRejection(input: ClaimRuntimeQuestionRejectionInput): RuntimeQuestionInteraction {
    if (typeof input.interactionId !== 'string' || input.interactionId.length === 0) {
      throw new RuntimeQuestionTransitionError(
        '(unknown)',
        'pending',
        'rejection claim requires the exact interaction id',
      );
    }
    if (typeof input.claimToken !== 'string' || input.claimToken.length === 0) {
      throw new RuntimeQuestionTransitionError(
        input.interactionId,
        'presented',
        'rejection claim requires the claim token',
      );
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new RuntimeQuestionTransitionError(
        input.interactionId,
        'presented',
        'rejection claim requires the expected version',
      );
    }
    const decidedBy = optionalIdentity(input.decidedBy);
    const now = new Date(input.nowMs ?? Date.now()).toISOString();
    return this.inTransaction(() => {
      const row = this.getRow(input.interactionId);
      if (row === undefined) {
        throw new RuntimeQuestionTransitionError(input.interactionId, 'pending', 'unknown interaction id');
      }
      const status = String(row.status) as RuntimeQuestionStatus;
      if (status !== 'presented') {
        throw new RuntimeQuestionTransitionError(
          input.interactionId,
          status,
          'only presented interactions are answerable; claimed/terminal rows are permanently non-answerable',
        );
      }
      const result = this.db
        .prepare(
          `UPDATE runtime_question_interactions
              SET status = 'claimed', claim_token = NULL,
                  decided_by = ?, decided_at = ?, claimed_at = ?,
                  version = version + 1, updated_at = ?
            WHERE interaction_id = ? AND status = 'presented'
              AND claim_token = ? AND version = ?`,
        )
        .run(decidedBy, now, now, now, input.interactionId, input.claimToken, input.expectedVersion) as unknown as {
        changes: number;
      };
      if (Number(result.changes) !== 1) {
        const current = this.getRow(input.interactionId);
        const currentStatus = current === undefined ? 'expired' : String(current.status);
        throw new RuntimeQuestionTransitionError(
          input.interactionId,
          currentStatus as RuntimeQuestionStatus,
          'rejection claim CAS failed: stale token, stale version, wrong interaction, or no longer presented',
        );
      }
      const updated = this.getRow(input.interactionId);
      if (updated === undefined)
        throw new Error(`Runtime question interaction ${input.interactionId} was not persisted`);
      return this.rowToInteraction(updated);
    });
  }

  // ─── TTL expiry (fail closed) ──────────────────────────────

  /**
   * Expire all unclaimed (pending/presented) interactions at or past TTL.
   * Expired rows are terminal: never presentable, never claimable.
   */
  expireUnclaimed(nowMs?: number): ExpireUnclaimedResult {
    const now = new Date(nowMs ?? Date.now()).toISOString();
    return this.inTransaction(() => {
      const rows = this.db
        .prepare(
          `SELECT interaction_id FROM runtime_question_interactions
            WHERE status IN ('pending', 'presented') AND expires_at <= ?`,
        )
        .all(now) as Row[];
      const ids = rows.map((row) => String(row.interaction_id));
      for (const id of ids) this.transitionToExpired(id, now);
      return { expiredCount: ids.length, expiredIds: ids };
    });
  }

  // ─── Contract-defined terminal markers (003B drives these) ─

  /**
   * Represent delivery-side terminal states. Present in 003A ONLY so the
   * persistence model can hold them; NOT driven by OpenCode here — no path
   * in this milestone calls these with live delivery results. Delivery
   * reconciliation (leases, retries, restart replay) is AR-TOOL-ASK-003B.
   */
  markDelivered(
    interactionId: string,
    status: 'answered' | 'rejected' | 'delivery-unknown',
    nowMs?: number,
  ): RuntimeQuestionInteraction {
    const now = new Date(nowMs ?? Date.now()).toISOString();
    return this.inTransaction(() => {
      const row = this.getRow(interactionId);
      if (row === undefined) throw new Error(`Runtime question interaction ${interactionId} not found`);
      if (String(row.status) !== 'claimed') {
        throw new RuntimeQuestionTransitionError(
          interactionId,
          String(row.status) as RuntimeQuestionStatus,
          `only claimed interactions can be marked ${status}`,
        );
      }
      this.db
        .prepare(
          `UPDATE runtime_question_interactions
              SET status = ?, updated_at = ? WHERE interaction_id = ?`,
        )
        .run(status, now, interactionId);
      const updated = this.getRow(interactionId);
      if (updated === undefined) throw new Error(`Runtime question interaction ${interactionId} was not persisted`);
      return this.rowToInteraction(updated);
    });
  }

  /** Mark a non-terminal interaction orphaned (runtime context lost). */
  markOrphaned(interactionId: string, nowMs?: number): RuntimeQuestionInteraction {
    const now = new Date(nowMs ?? Date.now()).toISOString();
    return this.inTransaction(() => {
      const row = this.getRow(interactionId);
      if (row === undefined) throw new Error(`Runtime question interaction ${interactionId} not found`);
      const status = String(row.status) as RuntimeQuestionStatus;
      if (
        status === 'claimed' ||
        status === 'answered' ||
        status === 'rejected' ||
        status === 'expired' ||
        status === 'orphaned' ||
        status === 'delivery-unknown'
      ) {
        throw new RuntimeQuestionTransitionError(interactionId, status, 'terminal interactions cannot be orphaned');
      }
      this.db
        .prepare(
          `UPDATE runtime_question_interactions
              SET status = 'orphaned', claim_token = NULL, updated_at = ?
            WHERE interaction_id = ?`,
        )
        .run(now, interactionId);
      const updated = this.getRow(interactionId);
      if (updated === undefined) throw new Error(`Runtime question interaction ${interactionId} was not persisted`);
      return this.rowToInteraction(updated);
    });
  }

  // ─── Reads ─────────────────────────────────────────────────

  get(interactionId: string): RuntimeQuestionInteraction | undefined {
    const row = this.getRow(interactionId);
    return row === undefined ? undefined : this.rowToInteraction(row);
  }

  getByRuntimeIds(openCodeSessionId: string, openCodeRequestId: string): RuntimeQuestionInteraction | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM runtime_question_interactions
          WHERE opencode_session_id = ? AND opencode_request_id = ?`,
      )
      .get(openCodeSessionId, openCodeRequestId) as Row | undefined;
    return row === undefined ? undefined : this.rowToInteraction(row);
  }

  listByConversation(conversationId: string): readonly RuntimeQuestionInteraction[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM runtime_question_interactions
          WHERE conversation_id = ? ORDER BY created_at ASC`,
        )
        .all(conversationId) as Row[]
    ).map((row) => this.rowToInteraction(row));
  }

  /** Read-only pending/presented interactions for projection consumers. */
  listPending(nowMs: number = Date.now()): readonly RuntimeQuestionInteraction[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM runtime_question_interactions
          WHERE status IN ('pending', 'presented') AND expires_at > ?
          ORDER BY created_at ASC`,
        )
        .all(new Date(nowMs).toISOString()) as Row[]
    ).map((row) => this.rowToInteraction(row));
  }

  // ─── Internals ─────────────────────────────────────────────

  private getRow(interactionId: string): Row | undefined {
    return this.db.prepare(`SELECT * FROM runtime_question_interactions WHERE interaction_id = ?`).get(interactionId) as
      | Row
      | undefined;
  }

  private transitionToExpired(interactionId: string, now: string): void {
    this.db
      .prepare(
        `UPDATE runtime_question_interactions
            SET status = 'expired', claim_token = NULL, updated_at = ?
          WHERE interaction_id = ? AND status IN ('pending', 'presented')`,
      )
      .run(now, interactionId);
  }

  private inTransaction<T>(operation: () => T): T {
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* Preserve the original error. */
      }
      this.onPersistenceError?.(error);
      throw error;
    }
  }

  private rowToInteraction(row: Row): RuntimeQuestionInteraction {
    return {
      interactionId: String(row.interaction_id),
      conversationId: String(row.conversation_id),
      openCodeSessionId: String(row.opencode_session_id),
      openCodeRequestId: String(row.opencode_request_id),
      ...(row.execution_id == null ? {} : { executionId: String(row.execution_id) }),
      ...(row.turn_id == null ? {} : { turnId: String(row.turn_id) }),
      ...(row.provider_id == null ? {} : { providerId: String(row.provider_id) }),
      ...(row.model_id == null ? {} : { modelId: String(row.model_id) }),
      questions: JSON.parse(String(row.questions_json)) as RuntimeQuestionInteraction['questions'],
      status: String(row.status) as RuntimeQuestionStatus,
      version: Number(row.version),
      claimToken: row.claim_token == null ? null : String(row.claim_token),
      expiresAt: String(row.expires_at),
      ...(row.presented_at == null ? {} : { presentedAt: String(row.presented_at) }),
      ...(row.claimed_at == null ? {} : { claimedAt: String(row.claimed_at) }),
      ...(row.answers_json == null
        ? {}
        : { answers: JSON.parse(String(row.answers_json)) as RuntimeQuestionInteraction['answers'] }),
      ...(row.decided_by == null ? {} : { decidedBy: String(row.decided_by) }),
      ...(row.decided_at == null ? {} : { decidedAt: String(row.decided_at) }),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

/**
 * Optional identity: carried only where the runtime actually supplied a
 * non-empty string. Empty/missing stays absent — never inferred.
 */
function optionalIdentity(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
