import { GRAY } from '../output/format.js';

export async function runMetrics(): Promise<void> {
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;
  const heapTotal = Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100;
  console.log(); console.log('  Vestara Metrics'); console.log('  ────────────────────────────────────'); console.log();
  console.log(`  ${GRAY}Runtime${RESET}`); console.log(`    Memory:    ${heapUsed}MB / ${heapTotal}MB`); console.log(`    Node:      ${process.version}`); console.log(`    Platform:  ${process.platform}`); console.log();
  console.log(`  ${GRAY}Onboarding${RESET}`); console.log(`    Conversation Engine: active`); console.log(`    Audio Pipeline:      Available`); console.log();
  console.log(`  ${GRAY}Pipeline (latest benchmarks)${RESET}`); console.log(`    See pnpm benchmark for live timings`); console.log(); console.log(`  ${GRAY}Tests${RESET}`); console.log(`    Run pnpm test for latest results`); console.log();
}
