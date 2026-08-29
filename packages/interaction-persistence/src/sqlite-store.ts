/**
 * AR-REC-C2 I1-2: SqliteInteractionStore
 *
 * Concrete durable adapter for interaction persistence.
 * Self-managed SQLite, own file (.vestara/interactions.db), own migration.
 *
 * Follows the FileThreadStore / SqliteEngineeringEventStore pattern.
 *
 * Invariants:
 *   - interactions are immutable (no UPDATE after INSERT)
 *   - responses are immutable (no UPDATE after INSERT)
 *   - at most one response per interaction (PRIMARY KEY constraint)
 *   - response_id globally unique (UNIQUE index)
 *   - publication ledger tracks delivery state only
 *   - lifecycle is derived, not persisted
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import type { Database, SqlValue } from 'sql.js';
import type {
  InteractionPersistencePort,
  PendingPublication,
  PersistedInteraction,
  PersistedResponse,
} from './interaction-persistence-port';
import { INTERACTION_MANIFEST } from './migrations';

export class SqliteInteractionStore implements InteractionPersistencePort {
  private constructor(
    private readonly db: Database,
    private readonly dbPath: string,
  ) {}

  static async open(dbPath: string): Promise<SqliteInteractionStore> {
    const initSqlJs = (await import('sql.js')).default;
    const sqlJsDir = path.dirname(require.resolve('sql.js'));
    const SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlJsDir, file) });
    const data = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
    const raw = data ? new SQL.Database(data) : new SQL.Database();
    migrate(raw, INTERACTION_MANIFEST, {
      persist: (migrated) => {
        fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
        fs.writeFileSync(path.resolve(dbPath), Buffer.from(migrated.export()));
      },
    });
    return new SqliteInteractionStore(raw, path.resolve(dbPath));
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  private exec(sql: string, params?: readonly SqlValue[]): void {
    this.db.run(sql, params ?? []);
    this.persist();
  }

  private queryOne<T>(sql: string, params?: readonly SqlValue[]): T | undefined {
    const stmt = this.db.prepare(sql);
    if (params) stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row as T;
    }
    stmt.free();
    return undefined;
  }

  private queryAll<T>(sql: string, params?: readonly SqlValue[]): T[] {
    const results: T[] = [];
    const stmt = this.db.prepare(sql);
    if (params) stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  async put(interaction: StructuredInteraction): Promise<void> {
    const choicesJson = JSON.stringify(interaction.choices);
    const presentedEventId = `interaction:presented:${interaction.interactionId}`;

    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run(
        `INSERT INTO interactions
         (interaction_id, conversation_id, presenting_participant_id, presenting_participant_name, created_at, content, choices_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          interaction.interactionId,
          interaction.conversationId ?? null,
          interaction.presentingParticipantId,
          interaction.presentingParticipantName,
          interaction.createdAt,
          interaction.content,
          choicesJson,
        ],
      );

      this.db.run(
        `INSERT INTO interaction_publication_ledger (event_id, interaction_id, published_at)
         VALUES (?, ?, NULL)`,
        [presentedEventId, interaction.interactionId],
      );

      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
    this.persist();
  }

  async get(interactionId: InteractionId): Promise<PersistedInteraction | undefined> {
    const row = this.queryOne<{
      interaction_id: string;
      conversation_id: string | null;
      presenting_participant_id: string;
      presenting_participant_name: string;
      created_at: string;
      content: string;
      choices_json: string;
      published_at: string | null;
    }>(
      `SELECT i.*, l.published_at
       FROM interactions i
       LEFT JOIN interaction_publication_ledger l
         ON l.event_id = 'interaction:presented:' || i.interaction_id
       WHERE i.interaction_id = ?`,
      [interactionId],
    );
    if (!row) return undefined;

    return {
      interaction: {
        interactionId: row.interaction_id as InteractionId,
        ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
        presentingParticipantId: row.presenting_participant_id,
        presentingParticipantName: row.presenting_participant_name,
        createdAt: row.created_at,
        content: row.content,
        choices: JSON.parse(row.choices_json),
      },
      publishedAt: row.published_at,
    };
  }

  async has(interactionId: InteractionId): Promise<boolean> {
    const row = this.queryOne<{ cnt: number }>('SELECT 1 as cnt FROM interactions WHERE interaction_id = ?', [
      interactionId,
    ]);
    return row !== undefined;
  }

  async recordResponse(interactionId: InteractionId, response: InteractionResponse): Promise<InteractionResponse> {
    const respondedEventId = `interaction:responded:${interactionId}`;

    // Validate outside transaction (sql.js prepare() interferes with explicit transactions)
    const interactionRow = this.queryOne<{ choices_json: string }>(
      'SELECT choices_json FROM interactions WHERE interaction_id = ?',
      [interactionId],
    );
    if (!interactionRow) {
      throw new Error(`Interaction not found: ${interactionId}`);
    }
    const choices = JSON.parse(interactionRow.choices_json) as readonly { choiceId: string }[];
    const validChoice = choices.some((c) => c.choiceId === response.selectedChoiceId);
    if (!validChoice) {
      throw new Error(`Invalid ChoiceId: ${response.selectedChoiceId}`);
    }

    // Atomic insert — UNIQUE constraint on interaction_id enforces at most one response
    this.db.run('BEGIN TRANSACTION');
    try {
      this.db.run(
        `INSERT INTO interaction_responses
         (interaction_id, response_id, selected_choice_id, responding_participant_id, responding_participant_name, responded_at, correlation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          response.interactionId,
          response.responseId,
          response.selectedChoiceId,
          response.respondingParticipantId,
          response.respondingParticipantName,
          response.respondedAt,
          response.correlationId ?? null,
        ],
      );

      // Create publication marker
      this.db.run(
        `INSERT INTO interaction_publication_ledger (event_id, interaction_id, published_at)
         VALUES (?, ?, NULL)`,
        [respondedEventId, interactionId],
      );

      this.db.run('COMMIT');
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
    this.persist();
    return response;
  }

  async getResponse(interactionId: InteractionId): Promise<PersistedResponse | undefined> {
    const row = this.queryOne<{
      interaction_id: string;
      response_id: string;
      selected_choice_id: string;
      responding_participant_id: string;
      responding_participant_name: string;
      responded_at: string;
      correlation_id: string | null;
      published_at: string | null;
    }>(
      `SELECT r.*, l.published_at
       FROM interaction_responses r
       LEFT JOIN interaction_publication_ledger l
         ON l.event_id = 'interaction:responded:' || r.interaction_id
       WHERE r.interaction_id = ?`,
      [interactionId],
    );
    if (!row) return undefined;

    return {
      response: {
        responseId: row.response_id as InteractionResponse['responseId'],
        interactionId: row.interaction_id as InteractionId,
        selectedChoiceId: row.selected_choice_id as ChoiceId,
        respondingParticipantId: row.responding_participant_id,
        respondingParticipantName: row.responding_participant_name,
        respondedAt: row.responded_at,
        ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
      },
      publishedAt: row.published_at,
    };
  }

  async hasResponse(interactionId: InteractionId): Promise<boolean> {
    const row = this.queryOne<{ cnt: number }>('SELECT 1 as cnt FROM interaction_responses WHERE interaction_id = ?', [
      interactionId,
    ]);
    return row !== undefined;
  }

  async markPublished(eventId: string): Promise<void> {
    this.exec(
      `UPDATE interaction_publication_ledger SET published_at = ? WHERE event_id = ? AND published_at IS NULL`,
      [new Date().toISOString(), eventId],
    );
  }

  async getPendingPublications(limit: number): Promise<readonly PendingPublication[]> {
    return this.queryAll<{ event_id: string; interaction_id: string }>(
      `SELECT event_id, interaction_id
       FROM interaction_publication_ledger
       WHERE published_at IS NULL
       ORDER BY rowid ASC
       LIMIT ?`,
      [limit],
    ).map((row) => ({
      eventId: row.event_id,
      interactionId: row.interaction_id as InteractionId,
    }));
  }
}
