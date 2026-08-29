/**
 * `vestara brief` — the "what happened while I was offline?" query.
 *
 * Read-only. Reconstructs an organizational brief from durable evidence
 * (event store, plans DB, evidence bundles, git) — it never writes. This is a
 * prototype of the morning query; it deliberately reports what the durable
 * records cannot establish (provenance gaps) rather than filling them in.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOLD, CYAN, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

interface BriefOptions {
  hours: number;
  json: boolean;
}

function vestaraRoot(): string {
  const env = process.env.VESTARA_REPO;
  if (env?.trim()) return env.trim();
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.vestara', 'workspace.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

async function openDb(rel: string): Promise<{ db: any; SQL: any } | null> {
  const root = vestaraRoot();
  const file = path.join(root, '.vestara', rel);
  if (!fs.existsSync(file)) return null;
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return { db: new SQL.Database(fs.readFileSync(file)), SQL };
}

function q(db: any, sql: string, params: unknown[] = []): unknown[][] {
  try {
    return (db.exec(sql, params as never)[0]?.values as unknown[][]) ?? [];
  } catch {
    return [];
  }
}

function gitSince(root: string, since: string): string[] {
  try {
    const out = execFileSync('git', ['log', '--since', since, '--format=%h %ci %s'], {
      cwd: root,
      encoding: 'utf8',
    });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function workingTreeSummary(root: string): { modified: number; untracked: number } {
  try {
    const status = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
    const lines = status.trim().split('\n').filter(Boolean);
    return {
      modified: lines.filter((line) => line.startsWith(' M') || line.startsWith('M')).length,
      untracked: lines.filter((line) => line.startsWith('??')).length,
    };
  } catch {
    return { modified: 0, untracked: 0 };
  }
}

export async function runBrief(cliArgs?: string[]): Promise<void> {
  const options: BriefOptions = {
    hours: 24,
    json: cliArgs?.includes('--json') ?? false,
  };
  const hoursArg = cliArgs?.find((arg) => arg.startsWith('--hours='));
  if (hoursArg) {
    const parsed = Number(hoursArg.split('=')[1]);
    if (Number.isFinite(parsed) && parsed > 0) options.hours = parsed;
  }

  const since = `${options.hours} hours ago`;
  const data: Record<string, unknown> = {};

  // ─── Event store ─────────────────────────────────────────────
  const events = await openDb(path.join('events', 'engineering-events.db'));
  if (events) {
    const { db } = events;
    data.totalEvents = Number(q(db, 'SELECT COUNT(*) FROM engineering_events')[0]?.[0] ?? 0);
    data.windowEvents = Number(
      q(db, 'SELECT COUNT(*) FROM engineering_events WHERE at >= datetime("now", ?)', [
        `-${options.hours} hours`,
      ])[0]?.[0] ?? 0,
    );
    data.actors = q(
      db,
      'SELECT actor_id, COUNT(*) c FROM engineering_events WHERE at >= datetime("now", ?) GROUP BY actor_id ORDER BY c DESC LIMIT 10',
      [`-${options.hours} hours`],
    ).map((row) => [row[0], Number(row[1])]);
    data.failures = q(
      db,
      `SELECT substr(payload_json, 1, 220) FROM engineering_events
       WHERE type = 'harness.outcome.failed' AND at >= datetime("now", ?)
       ORDER BY at DESC LIMIT 5`,
      [`-${options.hours} hours`],
    ).map((row) => row[0]);
    data.failureCount = Number(
      q(
        db,
        `SELECT COUNT(*) FROM engineering_events WHERE type = 'harness.outcome.failed' AND at >= datetime("now", ?)`,
        [`-${options.hours} hours`],
      )[0]?.[0] ?? 0,
    );
    data.recovery = q(
      db,
      `SELECT at, substr(payload_json, 1, 120) FROM engineering_events
       WHERE actor_id = 'recovery-runtime' AND at >= datetime("now", ?)
       ORDER BY at DESC LIMIT 3`,
      [`-${options.hours} hours`],
    ).map((row) => [row[0], row[1]]);
  }

  // ─── Plans DB ────────────────────────────────────────────────
  const plans = await openDb(path.join('plans', 'plans.db'));
  if (plans) {
    const { db } = plans;
    data.agents = q(db, 'SELECT id, role, status FROM agents ORDER BY name').map((row) => [row[0], row[1], row[2]]);
    const hasExec = q(db, "SELECT 1 FROM sqlite_master WHERE name='agent_executions'").length > 0;
    if (hasExec) {
      data.recentExecutions = q(
        db,
        `SELECT agent_id, status, COUNT(*) c FROM agent_executions
         WHERE started_at >= datetime("now", ?) GROUP BY agent_id, status ORDER BY c DESC LIMIT 8`,
        [`-${options.hours} hours`],
      ).map((row) => [row[0], row[1], Number(row[2])]);
    }
  }

  // ─── Evidence bundles ────────────────────────────────────────
  const bundlesDir = path.join(vestaraRoot(), '.vestara', 'evidence', 'bundles');
  data.evidenceBundles = fs.existsSync(bundlesDir) ? fs.readdirSync(bundlesDir).length : 0;

  // ─── Git ─────────────────────────────────────────────────────
  const root = vestaraRoot();
  const implCommits = gitSince(root, since);
  const blueprintDir = path.join(path.dirname(root), 'vestara-blueprint');
  const coordDir = path.dirname(root);
  const blueprintCommits = fs.existsSync(blueprintDir) ? gitSince(blueprintDir, since) : [];
  const coordCommits = fs.existsSync(coordDir) ? gitSince(coordDir, since) : [];
  data.implCommits = implCommits;
  data.blueprintCommits = blueprintCommits;
  data.coordCommits = coordCommits;
  data.workingTree = workingTreeSummary(root);

  // ─── Render ──────────────────────────────────────────────────
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const hoursLabel = `${options.hours}h`;
  console.log();
  console.log(`${BOLD}${GOLD}Overnight Brief${RESET} ${GRAY}— last ${hoursLabel}${RESET}`);
  console.log(`${GRAY}──────────────────────────────────────────${RESET}`);
  console.log();

  console.log(`${BOLD}Workstreams${RESET}`);
  console.log(
    `  Events recorded:    ${CYAN}${String(data.windowEvents)}${RESET} in ${hoursLabel} (${GRAY}${String(data.totalEvents)} total${RESET})`,
  );
  if (data.actors && (data.actors as unknown[][]).length > 0) {
    for (const [actor, count] of data.actors as unknown[][]) {
      console.log(`  ${actor} → ${count}`);
    }
  }
  console.log();

  console.log(`${BOLD}Failures & recovery${RESET}`);
  const failureCount = Number(data.failureCount ?? 0);
  if (failureCount > 0) {
    console.log(`  ${RED}${failureCount} harness outcome(s) failed${RESET} in ${hoursLabel}`);
    for (const summary of ((data.failures as string[]) ?? []).slice(0, 3)) {
      console.log(`  ${GRAY}•${RESET} ${String(summary).slice(0, 160)}`);
    }
  } else {
    console.log(`  ${GREEN}No harness failures recorded.${RESET}`);
  }
  if (data.recovery && (data.recovery as unknown[][]).length > 0) {
    console.log(`  ${GRAY}Recovery runtime:${RESET}`);
    for (const [at, payload] of data.recovery as unknown[][]) {
      console.log(`    ${at} ${String(payload).slice(0, 100)}`);
    }
  }
  console.log();

  console.log(`${BOLD}Commits${RESET}`);
  const allCommits = [
    ...(data.coordCommits as string[]),
    ...(data.implCommits as string[]),
    ...(data.blueprintCommits as string[]),
  ];
  if (allCommits.length > 0) {
    for (const commit of allCommits.slice(0, 10)) console.log(`  ${GRAY}•${RESET} ${commit}`);
  } else {
    console.log(`  ${GRAY}No commits in the window.${RESET}`);
  }
  console.log();

  console.log(`${BOLD}Working tree (uncommitted)${RESET}`);
  const wt = data.workingTree as { modified: number; untracked: number };
  console.log(`  ${wt.modified} modified · ${wt.untracked} untracked`);
  console.log();

  console.log(`${BOLD}Organization status${RESET}`);
  console.log(`  Agents on roster:   ${CYAN}${String((data.agents as unknown[][])?.length ?? 0)}${RESET}`);
  console.log(`  Evidence bundles:   ${CYAN}${String(data.evidenceBundles ?? 0)}${RESET}`);
  console.log(
    `  Blueprint commits:  ${CYAN}${String((data.blueprintCommits as string[])?.length ?? 0)}${RESET} (attribution: git identity only)${GRAY}${RESET}`,
  );
  console.log();

  console.log(`${BOLD}Confidence${RESET}`);
  console.log(`  ${GRAY}Execution history is well preserved. Interactive-work and${RESET}`);
  console.log(`  ${GRAY}authorization provenance are incomplete; actors may not be${RESET}`);
  console.log(`  ${GRAY}distinguishable from the committing Git identity.${RESET}`);
  console.log();
}
