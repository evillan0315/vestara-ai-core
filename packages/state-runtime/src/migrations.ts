import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the state database file (`vestara-state.db`).
 * All tables stable; future changes must be added as migrations.
 */

const STATE_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY, user_id TEXT DEFAULT 'local', title TEXT,
        status TEXT DEFAULT 'active', created_at TEXT, updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT,
        provider TEXT, model TEXT, tokens INTEGER DEFAULT 0,
        latency INTEGER DEFAULT 0, created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_msgs_conv ON messages(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    `;

export const STATE_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'state.baseline',
    produces: [
      fingerprint('conversations', ['id', 'user_id', 'title', 'status', 'created_at', 'updated_at']),
      fingerprint('messages', [
        'id',
        'conversation_id',
        'role',
        'content',
        'provider',
        'model',
        'tokens',
        'latency',
        'created_at',
      ]),
      fingerprint('settings', ['key', 'value', 'updated_at']),
    ],
    up: (db: Database) => {
      db.exec(STATE_BASELINE_DDL);
    },
  },
];

export const STATE_MANIFEST: MigrationManifest = buildManifest('state', [STATE_MIGRATIONS]);
