import { BOLD, GOLD, GREEN, GRAY, RESET } from '../output/format.js';

export async function runGoldenPath(): Promise<void> {
  console.log(); console.log(`${BOLD}${GOLD}Golden Path Demo${RESET}`); console.log(`${GRAY}─────────────────────────────────────${RESET}`); console.log();
  try {
    const { GoldenPathDemo } = await import('@vestara/workspace');
    const demo = new GoldenPathDemo(); await demo.run();
    console.log(`  ${GREEN}✓${RESET} Demo complete.${RESET}`); console.log();
  } catch (err: any) { console.log(`  ${RED}Error: ${err.message}${RESET}\n`); }
}
