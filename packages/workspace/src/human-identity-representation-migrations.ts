import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/** Append-only schema for the principal-scoped governed identity representation. */
export const HUMAN_IDENTITY_REPRESENTATION_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'human_identity_representation.baseline',
    produces: [
      fingerprint('human_identity_representations', [
        'principal_id',
        'preferred_name',
        'status',
        'source',
        'created_at',
        'updated_at',
      ]),
    ],
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS human_identity_representations (
          principal_id TEXT PRIMARY KEY REFERENCES human_principals(id),
          preferred_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          source TEXT NOT NULL DEFAULT 'explicit',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
];

export const HUMAN_IDENTITY_REPRESENTATION_MANIFEST: MigrationManifest = buildManifest(
  'plans-human-identity-representation',
  [HUMAN_IDENTITY_REPRESENTATION_MIGRATIONS],
);
