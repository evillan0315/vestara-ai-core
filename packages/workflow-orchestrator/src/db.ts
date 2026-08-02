/**
 * Minimal sql.js database helpers shared by the orchestration stores.
 * Parameterized SQL only — values are bound, never interpolated.
 */

import type { Database, SqlValue } from 'sql.js';

export function dbRun(db: Database, sql: string, params?: readonly SqlValue[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

export function dbGet(db: Database, sql: string, params?: readonly SqlValue[]): Record<string, unknown> | null {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export function dbAll(db: Database, sql: string, params?: readonly SqlValue[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function str(value: unknown): string {
  return value == null ? '' : String(value);
}

export function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function jsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function now(): string {
  return new Date().toISOString();
}
