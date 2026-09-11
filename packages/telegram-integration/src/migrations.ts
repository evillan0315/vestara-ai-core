/**
 * Telegram Integration — SQLite Migration Manifest
 *
 * Versioned schema for persisting pairing, workspace bindings,
 * and conversation bindings across process restarts.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform
 */

import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

const TELEGRAM_BASELINE_DDL = `
  CREATE TABLE IF NOT EXISTS telegram_pairing_requests (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    telegram_display_name TEXT NOT NULL,
    token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    approved_at TEXT,
    principal_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tg_pairing_user ON telegram_pairing_requests(telegram_user_id);
  CREATE INDEX IF NOT EXISTS idx_tg_pairing_token ON telegram_pairing_requests(token);
  CREATE INDEX IF NOT EXISTS idx_tg_pairing_status ON telegram_pairing_requests(status);

  CREATE TABLE IF NOT EXISTS telegram_identity_bindings (
    id TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL UNIQUE,
    telegram_display_name TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    principal_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_tg_binding_principal ON telegram_identity_bindings(principal_id);

  CREATE TABLE IF NOT EXISTS telegram_workspace_bindings (
    id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    workspace_name TEXT NOT NULL,
    preferred INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    UNIQUE(principal_id, workspace_id)
  );
  CREATE INDEX IF NOT EXISTS idx_tg_ws_principal ON telegram_workspace_bindings(principal_id);

  CREATE TABLE IF NOT EXISTS telegram_conversation_bindings (
    id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    telegram_chat_type TEXT NOT NULL,
    telegram_chat_title TEXT,
    vestara_conversation_id TEXT NOT NULL,
    vestara_conversation_title TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    default_model TEXT,
    default_provider TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tg_conv_chat ON telegram_conversation_bindings(telegram_chat_id);
  CREATE INDEX IF NOT EXISTS idx_tg_conv_principal ON telegram_conversation_bindings(principal_id);
  CREATE INDEX IF NOT EXISTS idx_tg_conv_status ON telegram_conversation_bindings(status);
`;

export const TELEGRAM_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'telegram.baseline',
    produces: [
      fingerprint('telegram_pairing_requests', [
        'id',
        'telegram_user_id',
        'token',
        'status',
        'created_at',
        'expires_at',
      ]),
      fingerprint('telegram_identity_bindings', ['id', 'telegram_user_id', 'principal_id', 'active']),
      fingerprint('telegram_workspace_bindings', ['id', 'principal_id', 'workspace_id', 'preferred']),
      fingerprint('telegram_conversation_bindings', [
        'id',
        'principal_id',
        'telegram_chat_id',
        'vestara_conversation_id',
        'status',
      ]),
    ],
    up: (db: Database) => {
      db.exec(TELEGRAM_BASELINE_DDL);
    },
  },
];

export const TELEGRAM_MANIFEST: MigrationManifest = buildManifest('telegram', [TELEGRAM_MIGRATIONS]);
