import { buildManifest, migrate } from '@vestara/sqlite-migrations';
import { PLANS_MANIFEST } from '@vestara/workspace';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Regression guard for `SCHEMA_METADATA_INCONSISTENT` on `plans.db`.
 *
 * New migration steps must be appended, never inserted before existing groups:
 * inserting `orchestration.tasks.external_verification_wait` before the
 * workspace domain shifted `workspace.baseline` from v7 to v8 and made
 * `verifyAppliedLog` fail closed on existing databases.
 */

const HISTORICAL_V9 = [
  'agents.baseline',
  'agents.agent_type',
  'agents.runtime_agent',
  'orchestration.baseline',
  'orchestration.projects.verification_reopens',
  'orchestration.tasks.approval_reason',
  'workspace.baseline',
  'impact_assessments.baseline',
  'agents.origin',
];

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function columns(db: Database, table: string): string[] {
  return (db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? []).map((row) => String(row[1]));
}

describe('PLANS_MANIFEST version stability (append-only)', () => {
  it('preserves the versions already recorded in existing plans.db databases', () => {
    const names = PLANS_MANIFEST.steps.map((step) => step.name);
    // v1..v9 must be byte-for-byte what existing databases already recorded.
    expect(names.slice(0, HISTORICAL_V9.length)).toEqual(HISTORICAL_V9);
    // v10 is the appended external-verification step.
    expect(names[9]).toBe('orchestration.tasks.external_verification_wait');
    // CI observation/decision records are appended after it (never inserted).
    expect(names).toContain('ci_observer.observations');
    expect(names.indexOf('ci_observer.observations')).toBeGreaterThan(
      names.indexOf('orchestration.tasks.external_verification_wait'),
    );
    // Append-only: the historical names never move position.
    for (const [index, name] of HISTORICAL_V9.entries()) expect(names[index]).toBe(name);
  });

  it('upgrades an existing v9 database without a metadata inconsistency', () => {
    // Reproduce the pre-fix database: the historical chain (v1..v9).
    const legacy = buildManifest('plans-legacy', [PLANS_MANIFEST.steps.slice(0, HISTORICAL_V9.length)]);
    const db = new SQL.Database();
    const installed = migrate(db, legacy);
    expect(installed.to).toBe(HISTORICAL_V9.length);

    // The current manifest must accept that database and apply only appended
    // steps — never rewrite or reject the recorded versions.
    const result = migrate(db, PLANS_MANIFEST);
    expect(result.from).toBe(HISTORICAL_V9.length);
    expect(result.to).toBe(PLANS_MANIFEST.steps.length);
    expect(result.applied[0]).toBe('orchestration.tasks.external_verification_wait');
    expect(result.applied).toContain('ci_observer.observations');
    expect(
      ['wait_ref', 'wait_repository', 'wait_commit_sha', 'wait_resumed_at', 'wait_decision_ref'].every((column) =>
        columns(db, 'orchestrated_tasks').includes(column),
      ),
    ).toBe(true);
    expect(columns(db, 'ci_observations').length).toBeGreaterThan(0);
    expect(columns(db, 'ci_decisions').length).toBeGreaterThan(0);
    expect(columns(db, 'ci_webhook_deliveries').length).toBeGreaterThan(0);
  });
});
