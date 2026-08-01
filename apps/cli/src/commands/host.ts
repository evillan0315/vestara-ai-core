import * as path from 'node:path';
import { FileBootStateStore } from '@vestara/boot-runtime';
import { HostRuntime } from '@vestara/host-runtime';
import { GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

function optionValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function apiJson(pathname: string, args: readonly string[]): Promise<any> {
  const endpoint = optionValue(args, '--endpoint') ?? process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001';
  const response = await fetch(new URL(pathname, endpoint), { signal: AbortSignal.timeout(1_000) });
  if (!response.ok) throw new Error(`Runtime API returned ${response.status}`);
  return response.json();
}

export async function runHostCommand(args: readonly string[]): Promise<void> {
  const action = args[0] ?? 'status';
  if (action !== 'status') throw new Error('Usage: vestara host status [--json] [--endpoint URL]');
  let result: any;
  try {
    result = await apiJson('/api/host', args);
  } catch {
    const runtime = new HostRuntime();
    await runtime.initialize();
    result = { runtime: runtime.info, host: runtime.currentSnapshot(), source: 'local-inspection' };
    await runtime.stop();
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const host = result.host;
  console.log(`${GOLD}Vestara Host${RESET}`);
  console.log(`${GREEN}✓${RESET} ${host.hostname} · ${host.distribution ?? host.platform} · ${host.architecture}`);
  console.log(
    `${GRAY}Kernel ${host.kernelRelease} · ${host.cpu.logicalCores} CPUs · ${formatBytes(host.memory.totalBytes)} RAM${RESET}`,
  );
  console.log(
    `${GRAY}${host.devices.length} block devices · ${host.mounts.length} mounts · systemd ${host.systemdAvailable ? 'available' : 'unavailable'}${RESET}`,
  );
}

export async function runBootCommand(args: readonly string[]): Promise<void> {
  const action = args[0] ?? 'status';
  if (action !== 'status') throw new Error('Usage: vestara boot status [--json] [--endpoint URL]');
  let result: any;
  try {
    result = await apiJson('/api/boot', args);
  } catch {
    const store = new FileBootStateStore(path.join(process.cwd(), '.vestara', 'os', 'boot-state.json'));
    const boot = await store.load();
    if (!boot) {
      console.error(`${RED}No Vestara boot state found. Start the API host runtime first.${RESET}`);
      process.exitCode = 1;
      return;
    }
    result = { boot, source: 'local-state' };
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const boot = result.boot;
  const icon = boot.status === 'ready' ? `${GREEN}✓` : boot.status === 'failed' ? `${RED}✖` : `${GOLD}●`;
  console.log(`${GOLD}Vestara Boot${RESET}`);
  console.log(`${icon}${RESET} ${boot.status} · ${boot.currentStage} · ${boot.bootId}`);
  for (const transition of boot.transitions) console.log(`${GRAY}${transition.timestamp}  ${transition.stage}${RESET}`);
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024 / 1024)} GB`;
}
