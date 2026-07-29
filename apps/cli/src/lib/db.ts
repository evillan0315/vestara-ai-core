export async function openSharedDb(dbPath?: string): Promise<any> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const fs = await import('node:fs');
  const path = await import('node:path');
  const resolvedPath = dbPath ?? path.join(process.cwd(), '.vestara', 'plans', 'plans.db');
  try {
    if (fs.existsSync(resolvedPath)) {
      const buffer = fs.readFileSync(resolvedPath);
      return new SQL.Database(buffer);
    }
  } catch {}
  return new SQL.Database();
}
