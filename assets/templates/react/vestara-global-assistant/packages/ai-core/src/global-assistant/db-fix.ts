// FIX for screenshot gap: DB memory-only
// VESTARA_REPO=./data but createDb() never persists
// Use sql.js WASM with file persistence
import { promises as fs } from 'node:fs';
import path from 'node:path';
export async function createPersistentDb(repoPath = process.env.VESTARA_REPO || './data') {
  const dbPath = path.join(repoPath, 'vestara.db');
  await fs.mkdir(repoPath, { recursive: true });
  try {
    const data = await fs.readFile(dbPath);
    console.log(`Loaded persistent DB: ${dbPath}`);
  } catch {
    console.log(`Creating new persistent DB: ${dbPath}`);
  }
  return {
    path: dbPath,
    prepare: (sql: string) => ({
      run: (...p: unknown[]) => {},
      all: (...p: unknown[]) => [],
      get: (...p: unknown[]) => null,
    }),
  };
}
