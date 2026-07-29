import { BOLD, GOLD, GREEN, GRAY, RESET } from '../output/format.js';

export async function runBenchmarkConversation(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Conversation Benchmark${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { ConversationBenchmark } = await import('@vestara/conversation-runtime');
    const bench = new ConversationBenchmark(); const result = await bench.run();
    console.log(`  ${GREEN}✓${RESET} Benchmark complete:`); console.log(`    Avg latency: ${result.avgLatency}ms`); console.log(`    P95 latency: ${result.p95Latency}ms`); console.log(`    Throughput:  ${result.throughput} req/s`); console.log(`    Samples:     ${result.samples}`); console.log();
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}
