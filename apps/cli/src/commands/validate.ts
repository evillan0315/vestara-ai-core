/**
 * `vestara validate` — CAP-001 Validation Run command.
 *
 * Opens a workspace, produces understanding, and outputs a clean
 * orientation summary designed for the validation protocol.
 * The observer uses this alongside the manual protocol questions
 * to capture developer confidence and decision outcomes.
 */

import { WorkspaceRuntime } from '@vestara/workspace';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

function label(val: string): string {
  return `${BOLD}${val}${RESET}`;
}

export async function runValidate(path: string): Promise<void> {
  const startTime = Date.now();

  console.log();
  console.log(`${BOLD}${GOLD}CAP-001 Validation — Orientation${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();

  const runtime = new WorkspaceRuntime({});
  let session: any;

  try {
    console.log(`${GRAY}Opening workspace...${RESET}`);
    await runtime.open(path);
    session = runtime.getSession();
  } catch (err: any) {
    console.log(`  ${RED}Failed to open workspace:${RESET} ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const u = session.understanding;
  if (!u) {
    console.log(`  ${RED}Understanding not yet available.${RESET}`);
    console.log(`  ${GRAY}The understanding engine may still be producing the first snapshot.${RESET}`);
    return;
  }

  const elapsed = Date.now() - startTime;

  // ── Identity ──────────────────────────────────────────────
  console.log(`  ${label('Identity')}`);
  console.log(`    Repository: ${u.identity.name}`);
  console.log(
    `    Language:   ${u.identity.primaryLanguage}${u.identity.languageConfidence > 0 ? ` (${(u.identity.languageConfidence * 100).toFixed(0)}% confidence)` : ''}`,
  );
  if (u.identity.framework) console.log(`    Framework:  ${u.identity.framework}`);
  console.log();

  // ── Architecture ──────────────────────────────────────────
  const archLabel =
    u.architecture.kind === 'monorepo'
      ? 'Monorepo'
      : u.architecture.kind === 'multi-module'
        ? 'Multi-Module'
        : 'Single Module';

  console.log(`  ${label('Architecture')}`);
  console.log(`    Kind:       ${archLabel}`);
  if (u.architecture.entryPoints.length > 0) {
    console.log(`    Entry pts:  ${u.architecture.entryPoints.length}`);
    for (const ep of u.architecture.entryPoints.slice(0, 5)) {
      console.log(`      ${GRAY}→${RESET} ${ep.path} ${GRAY}(${ep.role})${RESET}`);
    }
  }
  if (u.architecture.dependencyCycles.length > 0) {
    console.log(
      `    ${RED}⚠ ${u.architecture.dependencyCycles.length} circular dependenc${u.architecture.dependencyCycles.length > 1 ? 'ies' : 'y'}${RESET}`,
    );
  }
  console.log();

  // ── Health ────────────────────────────────────────────────
  const h = u.maturity.healthScore;
  const healthColor = h >= 7 ? GREEN : h >= 4 ? GOLD : RED;
  console.log(`  ${label('Health')}`);
  console.log(`    Score:      ${healthColor}${h.toFixed(1)}/10${RESET} (${u.maturity.level})`);
  console.log(`    Tests:      ${u.maturity.testCoverage}`);
  console.log(`    Code:       ${u.maturity.codeQuality}`);
  console.log(`    Docs:       ${u.maturity.documentationLevel}`);
  if (u.maturity.risks.length > 0) {
    console.log(`    Risks:`);
    for (const r of u.maturity.risks) {
      const sevColor = r.severity === 'high' ? RED : r.severity === 'medium' ? GOLD : GRAY;
      console.log(
        `      ${sevColor}[${r.severity}]${RESET} ${r.summary}${r.severity === 'high' ? ` ${RED}⚠${RESET}` : ''}`,
      );
    }
  }
  console.log();

  // ── Activity ──────────────────────────────────────────────
  console.log(`  ${label('Activity')}`);
  if (u.activity.currentMilestone) console.log(`    Milestone:  ${u.activity.currentMilestone}`);
  if (u.activity.recentChanges.length > 0) {
    console.log(`    Recent:`);
    for (const c of u.activity.recentChanges.slice(0, 5)) {
      console.log(`      ${GRAY}•${RESET} ${c.description} ${GRAY}(${c.author})${RESET}`);
    }
  }
  if (u.activity.activeBranches.length > 0) {
    console.log(`    Branches:   ${u.activity.activeBranches.join(', ')}`);
  }
  if (u.activity.uncommittedWork) {
    console.log(`    ${GOLD}⚠ Uncommitted changes${RESET}`);
  }
  console.log();

  // ── Decisions ─────────────────────────────────────────────
  if (u.memory.recentDecisions.length > 0) {
    console.log(`  ${label('Recent Decisions')}`);
    for (const d of u.memory.recentDecisions.slice(0, 5)) {
      console.log(`    ${GRAY}•${RESET} ${d.title}`);
    }
    console.log();
  }

  // ── Summary ───────────────────────────────────────────────
  console.log(`  ${label('Summary')}`);
  console.log(`    ${u.summary}`);
  console.log();

  // ── Snapshot info ─────────────────────────────────────────
  console.log(`  ${label('Snapshot')}`);
  console.log(`    ID:    ${u.id}`);
  console.log(`    Time:  ${elapsed}ms`);
  console.log(`    State: ${u.state.status}${u.state.isCached ? ' (cached)' : ''}`);
  console.log();

  // ── Next action ───────────────────────────────────────────
  const highRisks = u.maturity.risks.filter((r: any) => r.severity === 'high');
  const hasUncommitted = u.activity.uncommittedWork;
  console.log(`  ${label('What to consider')}`);
  if (highRisks.length > 0)
    console.log(`    ${RED}⚠ Address ${highRisks.length} high-severity risk${highRisks.length > 1 ? 's' : ''}${RESET}`);
  if (hasUncommitted) console.log(`    ${GOLD}⚠ Commit or stash uncommitted changes before starting work${RESET}`);
  if (u.architecture.dependencyCycles.length > 0)
    console.log(
      `    ${GOLD}⚠ Review circular dependenc${u.architecture.dependencyCycles.length > 1 ? 'ies' : 'y'} in dependency graph${RESET}`,
    );
  if (!u.activity.recentChanges.length)
    console.log(`${GRAY}No recent activity detected — explore recent files to understand current state${RESET}`);
  console.log();

  console.log(`${GRAY}Orientation complete in ${elapsed}ms${RESET}`);
  console.log();
}
