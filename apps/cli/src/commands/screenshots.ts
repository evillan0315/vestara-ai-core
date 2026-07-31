import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export type ScreenshotAction = 'run' | 'update' | 'report' | 'clean' | 'check';
export type ScreenshotViewport = 'mobile' | 'tablet' | 'desktop';

export interface ScreenshotInvocation {
  readonly action: ScreenshotAction;
  readonly script: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly json: boolean;
}

const ACTION_SCRIPTS: Readonly<Record<ScreenshotAction, string>> = {
  run: 'screenshots',
  update: 'screenshots:update',
  report: 'screenshots:report',
  clean: 'screenshots:clean',
  check: 'screenshots:check',
};

const VALUE_OPTIONS = new Set([
  '--viewport',
  '--theme',
  '--routes',
  '--base-url',
  '--tolerance',
  '--max-diff',
  '--stability-ms',
  '--role',
  '--workspace',
]);
const BOOLEAN_OPTIONS = new Set(['--wait-network', '--ci', '--json']);

function validateArguments(args: readonly string[], hasAction: boolean): void {
  for (let index = hasAction ? 1 : 0; index < args.length; index += 1) {
    const argument = args[index];
    if (VALUE_OPTIONS.has(argument)) {
      index += 1;
      if (!args[index] || args[index].startsWith('--')) throw new Error(`${argument} requires a value`);
    } else if (!BOOLEAN_OPTIONS.has(argument)) {
      throw new Error(`Unknown screenshots option: ${argument}`);
    }
  }
}

function optionValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function findRepositoryRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    const manifest = path.join(current, 'package.json');
    if (fs.existsSync(manifest)) {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as { name?: string };
      if (parsed.name === 'vestara-ai-core') return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not locate the vestara-ai-core repository from ${start}`);
}

function validateChoice<T extends string>(
  value: string | undefined,
  flag: string,
  choices: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (!choices.includes(value as T)) throw new Error(`${flag} must be one of: ${choices.join(', ')}`);
  return value as T;
}

function validateNumber(value: string | undefined, flag: string, minimum: number, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function validateRoutes(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const routes = value.split(',').map((route) => route.trim());
  if (routes.some((route) => !/^[a-z0-9][a-z0-9_-]*$/.test(route))) {
    throw new Error('--routes must be a comma-separated list of route IDs');
  }
  return routes.join(',');
}

function validateBaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('--base-url must use HTTP or HTTPS');
  return url.toString().replace(/\/$/, '');
}

export function buildScreenshotInvocation(args: readonly string[], start = process.cwd()): ScreenshotInvocation {
  const hasAction = Boolean(args[0] && !args[0].startsWith('--'));
  const actionValue = hasAction ? args[0] : 'run';
  if (!(actionValue in ACTION_SCRIPTS)) {
    throw new Error('Usage: vestara screenshots run|update|report|clean|check [options]');
  }
  validateArguments(args, hasAction);
  const action = actionValue as ScreenshotAction;
  const viewport = validateChoice(optionValue(args, '--viewport'), '--viewport', ['mobile', 'tablet', 'desktop']);
  const theme = validateChoice(optionValue(args, '--theme'), '--theme', ['dark', 'light']);
  const routes = validateRoutes(optionValue(args, '--routes'));
  const tolerance = validateNumber(optionValue(args, '--tolerance'), '--tolerance', 0, 1);
  const maxDiff = validateNumber(optionValue(args, '--max-diff'), '--max-diff', 0, 100);
  const stability = validateNumber(optionValue(args, '--stability-ms'), '--stability-ms', 0, 60_000);
  const baseUrl = validateBaseUrl(optionValue(args, '--base-url'));
  const role = optionValue(args, '--role');
  if (role && !/^[a-z0-9][a-z0-9_-]*$/.test(role)) throw new Error('--role must be a valid role ID');

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (action === 'run') env.SCREENSHOT_MODE = 'compare';
  if (action === 'update') env.SCREENSHOT_MODE = 'update';
  if (viewport) env.SCREENSHOT_VIEWPORT = viewport;
  if (theme) env.SCREENSHOT_THEME = theme;
  if (routes) env.SCREENSHOT_ROUTES = routes;
  if (tolerance) env.SCREENSHOT_TOLERANCE = tolerance;
  if (maxDiff) env.SCREENSHOT_MAX_DIFF = maxDiff;
  if (stability) env.SCREENSHOT_STABILITY_MS = stability;
  if (baseUrl) env.PLAYWRIGHT_BASE_URL = baseUrl;
  if (role) env.SCREENSHOT_ROLE = role;
  if (args.includes('--wait-network')) env.SCREENSHOT_WAIT_NETWORK = '1';
  if (args.includes('--ci')) env.CI = 'true';

  return {
    action,
    script: ACTION_SCRIPTS[action],
    cwd: findRepositoryRoot(optionValue(args, '--workspace') ?? start),
    env,
    json: args.includes('--json'),
  };
}

function printUsage(): void {
  console.log(`${GOLD}Usage:${RESET} vestara screenshots run|update|report|clean|check [options]`);
  console.log(`${GRAY}  --viewport mobile|tablet|desktop   Select a viewport group`);
  console.log(`  --theme dark|light                  Capture one theme`);
  console.log(`  --routes dashboard,docs             Capture selected route IDs`);
  console.log(`  --base-url http://localhost:5173    Target an existing UI server`);
  console.log(`  --tolerance 0..1 --max-diff 0..100  Configure pixel comparison`);
  console.log(`  --wait-network --ci --json           Configure execution/output${RESET}`);
}

export async function runScreenshots(args: readonly string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  try {
    const invocation = buildScreenshotInvocation(args);
    if (!invocation.json) {
      console.log(`\n${BOLD}${GOLD}Vestara Screenshot Automation${RESET}`);
      console.log(`${GRAY}Action: ${invocation.action} · Script: ${invocation.script}${RESET}\n`);
    }
    const result = spawnSync('pnpm', ['--filter', '@vestara/workspace-ui', invocation.script], {
      cwd: invocation.cwd,
      env: invocation.env,
      encoding: 'utf8',
      stdio: invocation.json ? 'pipe' : 'inherit',
    });
    const exitCode = result.status ?? (result.error ? 1 : 0);
    if (invocation.json) {
      console.log(
        JSON.stringify(
          {
            action: invocation.action,
            command: invocation.script,
            success: exitCode === 0,
            exitCode,
            stdout: result.stdout?.trim() ?? '',
            stderr: result.stderr?.trim() ?? result.error?.message ?? '',
          },
          null,
          2,
        ),
      );
    } else if (exitCode === 0) {
      console.log(`\n${GREEN}✓ Screenshot ${invocation.action} completed.${RESET}\n`);
    } else {
      console.error(`\n${RED}Screenshot ${invocation.action} failed with exit code ${exitCode}.${RESET}\n`);
    }
    if (exitCode !== 0) process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${RED}${message}${RESET}`);
    process.exitCode = 1;
  }
}
