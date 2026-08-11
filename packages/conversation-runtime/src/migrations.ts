import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the conversation database files
 * (`conversations/saved-chats.db` and `conversations/conversations.db`).
 * All tables stable; future changes must be added as migrations.
 */

const SESSION_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        context TEXT DEFAULT '{}',
        referenced_artifacts TEXT DEFAULT '[]',
        summaries TEXT DEFAULT '[]',
        actions TEXT DEFAULT '[]',
        memory_updates TEXT DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS session_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        tokens INTEGER,
        latency INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_audio_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        duration INTEGER,
        data TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON conversation_sessions(user_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_transcript_session ON session_transcripts(session_id, created_at);
    `;

const CONVERSATION_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        tokens INTEGER,
        cost REAL,
        latency INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id, created_at);
    `;

export const CONVERSATION_SESSION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'conversation_sessions.baseline',
    produces: [
      fingerprint('conversation_sessions', [
        'id',
        'user_id',
        'profile_id',
        'started_at',
        'ended_at',
        'context',
        'referenced_artifacts',
        'summaries',
        'actions',
        'memory_updates',
      ]),
      fingerprint('session_transcripts', [
        'id',
        'session_id',
        'role',
        'content',
        'provider',
        'model',
        'tokens',
        'latency',
        'created_at',
      ]),
      fingerprint('session_audio_timeline', ['id', 'session_id', 'timestamp', 'type', 'duration', 'data']),
    ],
    up: (db: Database) => {
      db.exec(SESSION_BASELINE_DDL);
    },
  },
];

export const CONVERSATION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'conversations.baseline',
    produces: [
      fingerprint('conversations', ['id', 'user_id', 'title', 'status', 'created_at', 'updated_at']),
      fingerprint('conversation_messages', [
        'id',
        'conversation_id',
        'role',
        'content',
        'provider',
        'model',
        'tokens',
        'cost',
        'latency',
        'created_at',
      ]),
    ],
    up: (db: Database) => {
      db.exec(CONVERSATION_BASELINE_DDL);
    },
  },
];

const USER_PROFILE_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        name TEXT,
        role TEXT,
        experience TEXT,
        preferred_stack TEXT,
        communication_style TEXT DEFAULT 'balanced',
        goals TEXT,
        preferences TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        conversation_count INTEGER DEFAULT 0,
        last_session_id TEXT
      )
    `;

export const USER_PROFILE_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'user_profiles.baseline',
    produces: [
      fingerprint('user_profiles', [
        'id',
        'name',
        'role',
        'experience',
        'preferred_stack',
        'communication_style',
        'goals',
        'preferences',
        'created_at',
        'updated_at',
        'conversation_count',
        'last_session_id',
      ]),
    ],
    up: (db: Database) => {
      db.exec(USER_PROFILE_BASELINE_DDL);
    },
  },
];

export const USER_PROFILE_MANIFEST: MigrationManifest = buildManifest('user-profiles', [USER_PROFILE_MIGRATIONS]);

export const CONVERSATION_SESSION_MANIFEST: MigrationManifest = buildManifest('conversation-sessions', [
  CONVERSATION_SESSION_MIGRATIONS,
]);
export const CONVERSATION_MANIFEST: MigrationManifest = buildManifest('conversations', [CONVERSATION_MIGRATIONS]);
