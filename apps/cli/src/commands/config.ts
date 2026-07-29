/**
 * Config CLI command — set workspace preferences from the CLI.
 *
 * Writes to .vestara/prefs.db so changes persist across sessions
 * and are visible to the API server and the workspace runtime.
 *
 * Architecture Traceability:
 *   AI-CON-004 → Preference Service
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const GOLD = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';

const VALID_KEYS = [
  'model',
  'provider',
  'theme',
  'defaultAgent',
  'autoIndex',
  'verifyOnImplement',
  'predictBeforePlan',
];

const DEFAULTS: Record<string, string> = {
  provider: 'opencode',
  model: 'deepseek-v4-flash-free',
  theme: 'dark',
  defaultAgent: 'developer',
  autoIndex: 'true',
  verifyOnImplement: 'true',
  predictBeforePlan: 'false',
};

export async function runConfigSet(key: string, value: string): Promise<void> {
  if (!VALID_KEYS.includes(key)) {
    console.log(`${RED}Unknown config key: "${key}"${RESET}`);
    console.log(`${GRAY}Valid keys: ${VALID_KEYS.join(', ')}${RESET}\n`);
    process.exit(1);
  }

  const prefsPath = path.join(process.cwd(), '.vestara', 'prefs.db');
  if (!fs.existsSync(prefsPath)) {
    console.log(`${RED}No preferences database found at ${prefsPath}${RESET}`);
    console.log(`${GRAY}Run 'vestara open .' to initialize a workspace first.${RESET}\n`);
    process.exit(1);
  }

  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(prefsPath);
    const db = new SQL.Database(buffer);

    // Ensure the preferences table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);

    const stmt = db.prepare('INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, ?)');
    stmt.bind([key, value, new Date().toISOString()]);
    stmt.step();
    stmt.free();

    // Persist back to disk
    const data = db.export();
    fs.writeFileSync(prefsPath, Buffer.from(data));
    db.close();

    console.log(`${GREEN}✓${RESET} Set ${GOLD}${key}${RESET} = ${value}`);
    console.log(`${GRAY}Changes take effect on next provider initialization.${RESET}\n`);
  } catch (err: any) {
    console.log(`${RED}Error setting config: ${err.message}${RESET}\n`);
    process.exit(1);
  }
}

export async function runConfigReset(key: string): Promise<void> {
  if (!VALID_KEYS.includes(key)) {
    console.log(`${RED}Unknown config key: "${key}"${RESET}`);
    console.log(`${GRAY}Valid keys: ${VALID_KEYS.join(', ')}${RESET}\n`);
    process.exit(1);
  }

  const defaultValue = DEFAULTS[key];
  if (defaultValue === undefined) {
    console.log(`${RED}No default value defined for "${key}"${RESET}\n`);
    process.exit(1);
  }

  const prefsPath = path.join(process.cwd(), '.vestara', 'prefs.db');
  if (!fs.existsSync(prefsPath)) {
    console.log(`${RED}No preferences database found at ${prefsPath}${RESET}`);
    console.log(`${GRAY}Run 'vestara open .' to initialize a workspace first.${RESET}\n`);
    process.exit(1);
  }

  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(prefsPath);
    const db = new SQL.Database(buffer);

    db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);

    const stmt = db.prepare('INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, ?)');
    stmt.bind([key, defaultValue, new Date().toISOString()]);
    stmt.step();
    stmt.free();

    const data = db.export();
    fs.writeFileSync(prefsPath, Buffer.from(data));
    db.close();

    console.log(`${GREEN}✓${RESET} Reset ${GOLD}${key}${RESET} to default: ${defaultValue}\n`);
  } catch (err: any) {
    console.log(`${RED}Error resetting config: ${err.message}${RESET}\n`);
    process.exit(1);
  }
}
