// Noninteractive modes for the TUI executable: --health-check, --version,
// --print-capabilities. These never enter raw mode, never connect, never render.

import { createTestRenderer } from '@opentui/core/testing';
import { ACCENT_PALETTES, TUI_SEMANTIC_PALETTES } from '@vestara/design-system';
import { OpenTuiRenderer } from '@vestara/tui-renderer';
import { parseBootstrapConfig, TUI_BOOTSTRAP_SCHEMA_VERSION } from './bootstrap.js';
import { resolveTuiConfiguration, validateTuiConfiguration } from './configuration.js';

export const TUI_PACKAGE_ID = 'vestara.tui';
export const TUI_PACKAGE_VERSION = '0.1.0';
export const TUI_RENDERER = 'opentui';
export const TUI_RUNTIME = 'bun';

export interface TuiHealthCheckResult {
  ok: boolean;
  packageId: string;
  version: string;
  renderer: string;
  runtime: string;
  platform: string;
  terminalRequired: boolean;
  configurationValid: boolean;
  nativeRendererLoaded: boolean;
}

/** Map process.platform + arch to a compact platform tag (e.g. linux-x64). */
export function platformTag(platform = process.platform, arch = process.arch): string {
  return `${platform}-${arch}`;
}

export function parseCliArgs(argv: readonly string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const equals = arg.indexOf('=');
    if (equals > 0) {
      result[arg.slice(2, equals)] = arg.slice(equals + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        index++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

export async function runHealthCheck(options?: { configPath?: string }): Promise<TuiHealthCheckResult> {
  let configurationValid = true;
  if (options?.configPath) {
    try {
      const { readFileSync } = await import('node:fs');
      const raw = readFileSync(options.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      const validation = validateTuiConfiguration(parsed);
      configurationValid = validation.valid;
      if (configurationValid) resolveTuiConfiguration(parsed as never);
    } catch {
      configurationValid = false;
    }
  }

  // Verify the native OpenTUI renderer loads without entering raw mode.
  let nativeRendererLoaded = false;
  try {
    const setup = await createTestRenderer({ width: 4, height: 2, useThread: false });
    const renderer = new OpenTuiRenderer({ renderer: setup.renderer });
    await renderer.start();
    nativeRendererLoaded = true;
    renderer.destroy();
  } catch {
    nativeRendererLoaded = false;
  }

  return {
    ok: nativeRendererLoaded && configurationValid,
    packageId: TUI_PACKAGE_ID,
    version: TUI_PACKAGE_VERSION,
    renderer: TUI_RENDERER,
    runtime: TUI_RUNTIME,
    platform: platformTag(),
    terminalRequired: false,
    configurationValid,
    nativeRendererLoaded,
  };
}

export async function printCapabilities(): Promise<Record<string, unknown>> {
  const bootstrapSchema = TUI_BOOTSTRAP_SCHEMA_VERSION;
  const themes = Object.keys(TUI_SEMANTIC_PALETTES);
  const accents = Object.keys(ACCENT_PALETTES);
  return {
    packageId: TUI_PACKAGE_ID,
    version: TUI_PACKAGE_VERSION,
    renderer: TUI_RENDERER,
    runtime: TUI_RUNTIME,
    platform: platformTag(),
    bootstrapSchema,
    themes,
    accents,
    defaultView: 'chat',
    views: ['chat', 'sessions', 'plans', 'graph', 'execution', 'workflow', 'logs', 'artifacts', 'settings'],
    features: ['command-palette', 'keyboard-navigation', 'live-telemetry', 'clean-shutdown'],
  };
}

export { parseBootstrapConfig };
