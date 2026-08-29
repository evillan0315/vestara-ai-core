/**
 * Activity Room (AAR-001) API module.
 *
 * Owns the projection service, the durable append-only activity store, and the
 * broadcast hub for the Activity Room. The room persists every record to
 * `activity.db` (via the activity migration manifest) so it reconstructs its
 * state after a restart (production-readiness foundation 2: durable
 * continuity). The API never re-redacts or reinterprets stored records; it
 * serializes the normalized typed records as-is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ACTIVITY_MANIFEST,
  ActivityProjectionService,
  type ActivityStore,
  ActivityStreamHub,
  type ActivityStreamHubOptions,
  InMemoryActivityStore,
  SqliteActivityStore,
} from '@vestara/activity-projection';
import { migrate } from '@vestara/sqlite-migrations';

export interface ActivityRoom {
  readonly store: ActivityStore;
  readonly service: ActivityProjectionService;
  readonly hub: ActivityStreamHub;
}

function persistDb(db: any, dbPath: string): void {
  try {
    const data = db.export();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch {
    /* best-effort */
  }
}

/** In-memory room used by tests and as a pre-init fallback. */
export function createActivityRoom(hubOptions: ActivityStreamHubOptions = {}): ActivityRoom {
  const store = new InMemoryActivityStore();
  const hub = new ActivityStreamHub(hubOptions);
  const service = new ActivityProjectionService({
    store,
    onAppended: (record) => hub.broadcast(record),
  });
  return { store, service, hub };
}

/**
 * Initialize the durable Activity Room for a repo: open `activity.db`, run the
 * migration chain, and hydrate the working store so the room survives restart.
 * Call once at API boot before any route or WebSocket uses the room.
 */
export async function initActivityRoom(
  repoPath: string,
  hubOptions: ActivityStreamHubOptions = {},
): Promise<ActivityRoom> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const dbPath = path.join(repoPath, '.vestara', 'activity.db');
  let db: any;
  try {
    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
    }
  } catch {
    /* corrupt or unreadable — start fresh */
  }
  db = db ?? new SQL.Database();

  migrate(db, ACTIVITY_MANIFEST, {
    persist: (migrated) => persistDb(migrated, dbPath),
  });

  const store = new SqliteActivityStore(db, {
    persist: () => persistDb(db, dbPath),
  });
  const hub = new ActivityStreamHub(hubOptions);
  const service = new ActivityProjectionService({
    store,
    onAppended: (record) => hub.broadcast(record),
  });
  room = { store, service, hub };
  return room;
}

let room: ActivityRoom | undefined;

/** Process-lifetime singleton shared by routes and the WebSocket handler. */
export function getActivityRoom(): ActivityRoom {
  room ??= createActivityRoom();
  return room;
}
