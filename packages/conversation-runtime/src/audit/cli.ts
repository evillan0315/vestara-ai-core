/**
 * Conversation Audit CLI — Scans and reports on conversation feature health.
 *
 * Usage:
 *   node packages/conversation-runtime/dist/audit/cli.js [--json]
 *
 * Architecture Traceability:
 *   PCS-020 → Conversation Developer Agent tooling
 */

import { ConversationScanner } from './scanner';

const GOLD = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GRAY = '\x1b[90m';

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  const scanner = new ConversationScanner();
  const report = scanner.scan();

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log();
  console.log(`  ${BOLD}${GOLD}Conversation Feature Audit${RESET}`);
  console.log(`  ${GRAY}${report.rootPath}${RESET}`);
  console.log(`  ${GRAY}${report.timestamp}${RESET}`);
  console.log();

  // Package table
  console.log(`  ${BOLD}Packages${RESET}`);
  console.log(`  ${GRAY}────────────────────────────────────────────────────────────${RESET}`);
  for (const pkg of report.packages) {
    const icon = pkg.exists ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const distIcon = pkg.hasDist ? `${GREEN}✓${RESET}` : `${GRAY}○${RESET}`;
    const testIcon = pkg.hasTests ? `${GREEN}✓${RESET}` : `${GRAY}○${RESET}`;
    console.log(
      `  ${icon} ${pkg.name.padEnd(24)} src:${String(pkg.sourceFiles).padEnd(3)} lines:${String(pkg.totalLines).padEnd(6)} dist:${distIcon} tests:${testIcon}`,
    );
  }
  console.log();

  // Summary
  console.log(`  ${BOLD}Summary${RESET}`);
  console.log(`  ${GRAY}────────────────────────────────────────────────────────────${RESET}`);
  console.log(`  ${report.summary.present}/${report.summary.total} packages present`);
  console.log(`  ${report.summary.withDist}/${report.summary.total} packages built`);
  console.log(`  ${report.summary.withTests}/${report.summary.total} packages with tests`);
  console.log(`  ${report.summary.totalSourceLines} total source lines`);
  console.log();

  // Issues
  if (report.issues.length > 0) {
    console.log(`  ${BOLD}Issues${RESET}`);
    console.log(`  ${GRAY}────────────────────────────────────────────────────────────${RESET}`);
    for (const issue of report.issues) {
      const icon =
        issue.severity === 'error'
          ? `${RED}✗${RESET}`
          : issue.severity === 'warning'
            ? `${GOLD}⚠${RESET}`
            : `${GRAY}ℹ${RESET}`;
      console.log(`  ${icon} [${issue.package}] ${issue.message}`);
      if (issue.detail) console.log(`  ${GRAY}  ${issue.detail}${RESET}`);
    }
    console.log();
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log(`  ${BOLD}Recommendations${RESET}`);
    console.log(`  ${GRAY}────────────────────────────────────────────────────────────${RESET}`);
    for (const rec of report.recommendations) {
      console.log(`  ${GOLD}→${RESET} ${rec}`);
    }
    console.log();
  }

  // Latency targets
  console.log(`  ${BOLD}Latency Targets (v4.0)${RESET}`);
  console.log(`  ${GRAY}────────────────────────────────────────────────────────────${RESET}`);
  for (const [stage, target] of Object.entries(report.latency.v4Targets)) {
    console.log(`  ${GRAY}○${RESET} ${stage.padEnd(25)} < ${String(target.target).padEnd(5)}ms`);
  }
  console.log();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
