/**
 * AR-REC-C2 I1-2: Interaction Persistence Migrations
 *
 * Creates three tables:
 *   - interactions: immutable presentation facts
 *   - interaction_responses: immutable response facts
 *   - interaction_publication_ledger: delivery/recovery state only
 */

import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

const INTERACTION_BASELINE_DDL = `
  CREATE TABLE IF NOT EXISTS interactions (
    interaction_id TEXT PRIMARY KEY,
    conversation_id TEXT,
    presenting_participant_id TEXT NOT NULL,
    presenting_participant_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    content TEXT NOT NULL,
    choices_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_conversation
    ON interactions(conversation_id);

  CREATE TABLE IF NOT EXISTS interaction_responses (
    interaction_id TEXT PRIMARY KEY,
    response_id TEXT NOT NULL,
    selected_choice_id TEXT NOT NULL,
    responding_participant_id TEXT NOT NULL,
    responding_participant_name TEXT NOT NULL,
    responded_at TEXT NOT NULL,
    correlation_id TEXT,
    FOREIGN KEY (interaction_id) REFERENCES interactions(interaction_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_responses_response_id
    ON interaction_responses(response_id);

  CREATE TABLE IF NOT EXISTS interaction_publication_ledger (
    event_id TEXT PRIMARY KEY,
    interaction_id TEXT NOT NULL,
    published_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_publication_ledger_pending
    ON interaction_publication_ledger(published_at)
    WHERE published_at IS NULL;
`;

export const INTERACTION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'interaction.baseline',
    produces: [
      fingerprint('interactions', [
        'interaction_id',
        'conversation_id',
        'presenting_participant_id',
        'presenting_participant_name',
        'created_at',
        'content',
        'choices_json',
      ]),
      fingerprint('interaction_responses', [
        'interaction_id',
        'response_id',
        'selected_choice_id',
        'responding_participant_id',
        'responding_participant_name',
        'responded_at',
        'correlation_id',
      ]),
      fingerprint('interaction_publication_ledger', ['event_id', 'interaction_id', 'published_at']),
    ],
    up: (db: Database) => {
      db.exec(INTERACTION_BASELINE_DDL);
    },
  },
];

export const INTERACTION_MANIFEST: MigrationManifest = buildManifest('interactions', [INTERACTION_MIGRATIONS]);
