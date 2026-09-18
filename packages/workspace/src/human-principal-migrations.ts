import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the HumanPrincipal domain tables (HUMAN-CONTEXT-002).
 *
 * Identity only: human_principals carries id/status/timestamps and nothing
 * else. Presentation (displayName/avatar), profile, membership, roles, and
 * authority grants must never be added here.
 *
 * Append-only rule: this group is trailing in PLANS_MANIFEST (see
 * agent-migrations.ts) so recorded versions in existing plans.db databases
 * never shift. Never move this step before existing groups.
 */

export const HUMAN_PRINCIPAL_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'human_principal.baseline',
    produces: [
      fingerprint('human_principals', ['id', 'status', 'created_at', 'updated_at']),
      fingerprint('human_external_identities', ['provider', 'subject', 'principal_id', 'linked_at']),
      fingerprint('human_credential_bindings', ['credential_id', 'principal_id', 'created_at']),
    ],
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS human_principals (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS human_external_identities (
          provider TEXT NOT NULL,
          subject TEXT NOT NULL,
          principal_id TEXT NOT NULL REFERENCES human_principals(id),
          linked_at TEXT NOT NULL,
          PRIMARY KEY (provider, subject)
        );
        CREATE INDEX IF NOT EXISTS idx_hei_principal ON human_external_identities(principal_id);
        CREATE TABLE IF NOT EXISTS human_credential_bindings (
          credential_id TEXT PRIMARY KEY,
          principal_id TEXT NOT NULL REFERENCES human_principals(id),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_hcb_principal ON human_credential_bindings(principal_id);
      `);
    },
  },
];

/** Standalone human-principal manifest (for direct-construction tests). */
export const HUMAN_PRINCIPAL_MANIFEST: MigrationManifest = buildManifest('plans-human-principal', [
  HUMAN_PRINCIPAL_MIGRATIONS,
]);
