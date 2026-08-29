import { migrate } from '@vestara/sqlite-migrations';
import { PLANS_MANIFEST } from '@vestara/workspace';

/**
 * Open the shared `plans.db` for the CLI and run the migration chain as this
 * entrypoint's composition root (incident #0001). The chain is the single
 * schema-evolution authority; storages never mutate schema themselves.
 */
export async function openSharedDb(dbPath?: string): Promise<any> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const fs = await import('node:fs');
  const path = await import('node:path');
  const resolvedPath = dbPath ?? path.join(process.cwd(), '.vestara', 'plans', 'plans.db');
  let db: any;
  try {
    if (fs.existsSync(resolvedPath)) {
      const buffer = fs.readFileSync(resolvedPath);
      db = new SQL.Database(buffer);
    }
  } catch {}
  db = db ?? new SQL.Database();
  migrate(db, PLANS_MANIFEST, {
    persist: (migrated) => {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
      fs.writeFileSync(resolvedPath, Buffer.from(migrated.export()));
    },
  });
  return db;
}
