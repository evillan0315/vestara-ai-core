import { BOLD, GOLD, GREEN, RED, GRAY, RESET } from '../output/format.js';

export async function runBenchmarkConversation(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Conversation Benchmark${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { ConversationScanner } = await import('@vestara/conversation-runtime');
    const scanner = new ConversationScanner(process.cwd());
    const report = scanner.scan();
    console.log(`  ${GREEN}✓${RESET} Scan complete:`);
    console.log(`    Packages:    ${report.summary.present}/${report.summary.total}`); console.log(`    Built:       ${report.summary.withDist}/${report.summary.total}`); console.log(`    Tested:      ${report.summary.withTests}/${report.summary.total}`); console.log(`    Source:      ${report.summary.totalSourceLines} lines`); console.log();
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}
