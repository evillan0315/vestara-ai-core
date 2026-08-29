import { OpenTuiRenderer } from '@vestara/tui-renderer';
import { createElement } from 'react';
import { TuiShell } from './app.js';
import { parseBootstrapConfig } from './bootstrap.js';
import { TuiController } from './controller.js';
import { createTuiHost } from './host.js';
import { parseCliArgs, printCapabilities, runHealthCheck, TUI_PACKAGE_VERSION } from './modes.js';
import { renderRoot } from './root.js';

export interface RunTuiOptions {
  endpoint?: string;
  repoPath?: string;
  executable?: string;
  targetFps?: number;
  useMouse?: boolean;
}

/**
 * Launch the Vestara terminal TUI. Runs as a standalone Bun executable: the
 * parent CLI spawns this binary; it never loads inside the Node API runtime.
 */
export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  const endpoint = options.endpoint ?? process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001';
  const repoPath = options.repoPath ?? process.env.VESTARA_REPO ?? process.cwd();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Vestara TUI requires an interactive terminal');
  }

  const renderer = new OpenTuiRenderer({
    targetFps: options.targetFps,
    useMouse: options.useMouse,
    exitOnCtrlC: true,
  });
  const controller = new TuiController({ endpoint });
  const host = createTuiHost(renderer, { endpoint, repoPath, controller });
  const app = createElement(TuiShell, { host, endpoint, repoPath });

  await renderRoot(renderer, app);
}

/**
 * Executable entrypoint. Supports noninteractive modes (health check, version,
 * capabilities) and the interactive TUI. Reads the versioned bootstrap document
 * from a temp file (--bootstrap) so credentials never appear on the command line.
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const args = parseCliArgs(argv);

  if (args['health-check'] !== undefined) {
    const configPath = argString(args, 'config');
    const result = await runHealthCheck({ configPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }

  if (args.version) {
    process.stdout.write(`${TUI_PACKAGE_VERSION}\n`);
    return 0;
  }

  if (args['print-capabilities'] !== undefined) {
    const capabilities = await printCapabilities();
    process.stdout.write(`${JSON.stringify(capabilities, null, 2)}\n`);
    return 0;
  }

  const endpoint = argString(args, 'endpoint');
  const repoPath = argString(args, 'repo');

  // Read the bootstrap document if provided; otherwise fall back to env vars.
  const bootstrapPath = argString(args, 'bootstrap');
  if (bootstrapPath !== undefined) {
    const { readFileSync } = await import('node:fs');
    try {
      const parsed = parseBootstrapConfig(JSON.parse(readFileSync(bootstrapPath, 'utf8')));
      await runTui({ endpoint: parsed.connection.apiUrl, repoPath: parsed.workspace?.root });
    } catch (error) {
      process.stderr.write(`TUI bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    return 0;
  }

  await runTui({ endpoint, repoPath });
  return 0;
}

export { OpenTuiRenderer } from '@vestara/tui-renderer';
export { TuiShell } from './app.js';
export { createTuiHost } from './host.js';

function argString(args: Record<string, string | boolean>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

// Execute when run as the entrypoint (bundled executable or `bun run`).
// In a compiled Bun executable argv[1] is a `$bunfs` path; in `bun run <file>`
// it is the script path. Comparing against import.meta.url reliably identifies
// the entrypoint in both cases.
const entryUrl = process.argv[1] ? new URL(process.argv[1], `file://${process.cwd()}/`) : undefined;
if (entryUrl && new URL(import.meta.url).pathname === entryUrl.pathname) {
  void main().then((code) => process.exit(code));
}
