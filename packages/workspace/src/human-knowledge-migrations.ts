import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the HumanKnowledge domain tables (HUMAN-CONTEXT-003).
 *
 * Storage authority only: structured knowledge items with full provenance,
 * epistemic, sensitivity, and subject metadata. No publication, retrieval,
 * or policy state lives here.
 *
 * Append-only rule: this group trails all pre-existing groups in
 * PLANS_MANIFEST (see agent-migrations.ts) so recorded versions in existing
 * plans.db databases never shift. Never move this step before existing groups.
 */

export const HUMAN_KNOWLEDGE_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'human_knowledge.baseline',
    produces: [
      fingerprint('human_knowledge_items', [
        'id',
        'principal_id',
        'subdomain',
        'kind',
        'value',
        'source',
        'provenance',
        'time_range',
        'verification_status',
        'confidence',
        'sensitivity',
        'agent_readable',
        'primary_subject_ref',
        'related_subject_refs',
        'created_at',
        'updated_at',
      ]),
    ],
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS human_knowledge_items (
          id TEXT PRIMARY KEY,
          principal_id TEXT NOT NULL REFERENCES human_principals(id),
          subdomain TEXT NOT NULL,
          kind TEXT NOT NULL,
          value TEXT NOT NULL,
          source TEXT NOT NULL,
          provenance TEXT DEFAULT '[]',
          time_range TEXT,
          verification_status TEXT NOT NULL,
          confidence REAL NOT NULL,
          sensitivity TEXT NOT NULL DEFAULT 'PRIVATE',
          agent_readable INTEGER NOT NULL DEFAULT 0,
          primary_subject_ref TEXT,
          related_subject_refs TEXT DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_hki_principal ON human_knowledge_items(principal_id);
        CREATE INDEX IF NOT EXISTS idx_hki_subdomain ON human_knowledge_items(principal_id, subdomain);
      `);
    },
  },
];

/** Standalone human-knowledge manifest (for direct-construction tests). */
export const HUMAN_KNOWLEDGE_MANIFEST: MigrationManifest = buildManifest('plans-human-knowledge', [
  HUMAN_KNOWLEDGE_MIGRATIONS,
]);
