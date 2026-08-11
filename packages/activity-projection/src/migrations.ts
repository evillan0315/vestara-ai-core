import { buildManifest, fingerprint, type MigrationManifest, type MigrationStep } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';

/**
 * Versioned evolution of the Activity Room's durable store (`activity.db`).
 * The table is a projection cache of the append-only activity log; it is
 * reloaded into the working store on boot so the room survives restart
 * (AAR-001 production-readiness, foundation 2: durable continuity).
 */

const ACTIVITY_BASELINE_DDL = `
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_sequence ON activity_events(sequence);
    `;

export const ACTIVITY_MIGRATIONS: readonly MigrationStep[] = [
  {
    name: 'activity_events.baseline',
    produces: [fingerprint('activity_events', ['id', 'sequence', 'kind', 'payload_json'])],
    up: (db: Database) => {
      db.exec(ACTIVITY_BASELINE_DDL);
    },
  },
];

export const ACTIVITY_MANIFEST: MigrationManifest = buildManifest('activity', [ACTIVITY_MIGRATIONS]);
