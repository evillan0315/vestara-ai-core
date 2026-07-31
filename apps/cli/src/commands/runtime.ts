import { createWorkspaceCommand } from '@vestara/configuration';
import { HttpWorkspaceRuntimeClient } from '@vestara/workspace';
import { GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

function optionValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runRuntimeCommand(args: readonly string[]): Promise<void> {
  const action = args[0] ?? 'status';
  const json = args.includes('--json');
  const client = new HttpWorkspaceRuntimeClient({ endpoint: optionValue(args, '--endpoint') });
  try {
    const status = await client.getStatus();
    let result: unknown = status;
    if (action === 'health') {
      const command = createWorkspaceCommand({
        workspaceId: status.workspaceId,
        source: 'cli',
        type: 'runtime.health-check',
      });
      result = await client.execute(command);
    } else if (action !== 'status') {
      throw new Error('Usage: vestara runtime status|health [--endpoint URL] [--json]');
    }
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${GOLD}Workspace Runtime${RESET}`);
      console.log(`${GREEN}✓${RESET} Connected to ${status.apiEndpoint}`);
      console.log(
        `${GRAY}Workspace: ${status.workspaceId} · Runtime: ${status.status} · Version: ${status.runtimeVersion}${RESET}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ connected: false, error: message }, null, 2));
    else console.error(`${RED}Workspace Runtime unavailable: ${message}${RESET}`);
    process.exitCode = 1;
  }
}
