import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runGoldenPath(): Promise<void> {
  console.log();
  console.log(`${BOLD}${GOLD}Golden Path Demo${RESET}`);
  console.log(`${GRAY}─────────────────────────────────────${RESET}`);
  console.log();
  try {
    console.log(`  ${GREEN}✓${RESET} Running golden path...`);
    console.log();
    const { DefaultKernel } = await import('@vestara/kernel');
    const kernel = new DefaultKernel();
    await kernel.boot({ logLevel: 'warn' });
    console.log(`  ${GREEN}✓${RESET} Runtime booted`);
    console.log();
    await kernel.shutdown();
  } catch (err: any) {
    console.log(`  ${RED}Error: ${err.message}${RESET}\n`);
  }
}
