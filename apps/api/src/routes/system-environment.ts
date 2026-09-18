/**
 * Read-only environment registry (SETTINGS-ENV-E1).
 *
 * GET /api/system/environment → curated EnvironmentVariableView[].
 *
 * Observation only: no mutation, no dotenv authority, no process.env
 * enumeration. Only explicitly registered names are projected; unknown
 * host/session variables stay invisible. Sensitive values are NEVER
 * serialized — presence only ({ hasValue, masked: true }).
 *
 * Attribution uses only provable resolvers:
 *   - process environment (boot-loaded via `node --env-file=.env`,
 *     systemd EnvironmentFile/Environment, or the parent shell)
 *   - WorkspaceConfigurationService.resolve() layers (user/workspace/
 *     session/command/default) for entries with a mapped config key
 *   - code fallbacks (defaultValue) where the call site is verified
 *
 * There is no .env.local layer and no per-file precedence anywhere in the
 * repository — the UI must not invent it.
 */

import type * as http from 'node:http';
import { WORKSPACE_SETTING_DEFINITIONS } from '@vestara/configuration';
import { isSensitiveKey } from '@vestara/external-runtime';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export type EnvironmentVariableScope = 'workspace' | 'api-process' | 'opencode' | 'build' | 'systemd-unit';

export type EnvironmentEffectiveSource =
  | 'default'
  | 'user'
  | 'workspace'
  | 'session'
  | 'command'
  | 'environment'
  | 'configuration'
  | 'credential-store'
  | 'unknown';

export interface EnvironmentVariableView {
  readonly name: string;
  readonly scope: EnvironmentVariableScope;
  readonly description: string;
  readonly effectiveSource: EnvironmentEffectiveSource;
  readonly sourcePath?: string;
  readonly hasValue: boolean;
  /** True for secret-bearing names. When true, effectiveValue is ABSENT. */
  readonly sensitive: boolean;
  readonly masked: boolean;
  /** Non-sensitive effective value only. Never present when sensitive. */
  readonly effectiveValue?: string;
  /** Always false in E1 (read-only milestone — no mutation authority). */
  readonly editable: boolean;
  /** Effective layer won over a lower layer (env over file/default). */
  readonly overridden: boolean;
  /**
   * Always false in E1: with no mutation path, persisted state cannot drift
   * from the boot snapshot. Computed (persisted ≠ snapshot) from E2 on.
   */
  readonly restartRequired: boolean;
}

interface RegistryEntry {
  readonly name: string;
  readonly scope: EnvironmentVariableScope;
  readonly description: string;
  /** Defaults to isSensitiveKey(name) from @vestara/external-runtime. */
  readonly sensitive?: boolean;
  /** Verified code fallback when the variable is unset. */
  readonly defaultValue?: string;
  /**
   * Dotted WORKSPACE_SETTING_DEFINITIONS key used for override attribution.
   * Only when the VESTARA_ overlay transform maps onto it exactly
   * (suffix lowercased, underscores → dots).
   */
  readonly configKey?: string;
}

const REGISTRY: readonly RegistryEntry[] = [
  // ─── API process ────────────────────────────────────────────
  {
    name: 'VESTARA_API_PORT',
    scope: 'api-process',
    description: 'API listen port (falls back to PORT, then 3001).',
    defaultValue: '3001',
  },
  {
    name: 'PORT',
    scope: 'api-process',
    description: 'Generic port fallback used when VESTARA_API_PORT is unset.',
    defaultValue: '3001',
  },
  { name: 'NODE_ENV', scope: 'api-process', description: 'Node environment mode.' },
  { name: 'VESTARA_REPO', scope: 'api-process', description: 'Workspace root override for repository discovery.' },
  { name: 'VESTARA_RUNTIME_PROFILE', scope: 'api-process', description: 'Runtime profile selection.' },
  {
    name: 'VESTARA_API_KEY',
    scope: 'api-process',
    description: 'Workspace API key consumed by the user store.',
    sensitive: true,
  },
  {
    name: 'VESTARA_BROWSER_DRIVER',
    scope: 'api-process',
    description: 'Browser automation driver (playwright | agent-browser).',
    configKey: 'browser.driver',
  },
  { name: 'VESTARA_BROWSER_URL', scope: 'api-process', description: 'Browser service base URL override.' },
  { name: 'VESTARA_SCREENSHOT_URL', scope: 'api-process', description: 'Screenshot service base URL override.' },
  {
    name: 'VESTARA_BROWSER_ALLOWED_ORIGINS',
    scope: 'api-process',
    description: 'Allowed browser origins (comma-separated).',
  },
  {
    name: 'VESTARA_BROWSER_IDLE_TIMEOUT_MS',
    scope: 'api-process',
    description: 'Idle browser session timeout in milliseconds.',
  },
  { name: 'VESTARA_BROWSER_MAX_SESSIONS', scope: 'api-process', description: 'Maximum concurrent browser sessions.' },
  {
    name: 'VESTARA_BROWSER_CLASSIFICATION',
    scope: 'api-process',
    description: 'Browser content classification policy.',
  },
  { name: 'VESTARA_BROWSER_RETENTION', scope: 'api-process', description: 'Browser artifact retention policy.' },
  { name: 'VESTARA_BROWSER_REDACTION', scope: 'api-process', description: 'Browser screenshot redaction policy.' },
  { name: 'VESTARA_BROWSER_ORIGIN_POLICIES', scope: 'api-process', description: 'Per-origin browser policies.' },
  {
    name: 'VESTARA_MARKETPLACE_ROOTS',
    scope: 'api-process',
    description: 'Additional marketplace roots (path-delimiter separated).',
  },
  {
    name: 'VESTARA_SKIP_MEMORY_INDEX',
    scope: 'api-process',
    description: "Set to '1' to skip the memory index build.",
  },
  {
    name: 'VESTARA_TELEGRAM_TUNNEL_COMMAND',
    scope: 'api-process',
    description: 'Tunnel provider command override for Telegram webhooks.',
  },
  {
    name: 'VESTARA_TELEGRAM_TUNNEL_ARGS',
    scope: 'api-process',
    description: 'Tunnel provider arguments override (whitespace separated).',
  },
  {
    name: 'VESTARA_OPENCODE_SUPERVISOR',
    scope: 'api-process',
    description: "Set to '0' to disable the OpenCode idle-stop supervisor.",
  },
  {
    name: 'VESTARA_OPENCODE_IDLE_STOP_MS',
    scope: 'api-process',
    description: 'Idle milliseconds before the OpenCode server is reclaimed.',
    defaultValue: '1800000',
  },
  { name: 'VESTARA_GA_TURN_TIMEOUT_MS', scope: 'api-process', description: 'Assistant turn timeout in milliseconds.' },
  { name: 'VESTARA_GA_MAX_TOOL_CALLS', scope: 'api-process', description: 'Assistant maximum tool calls per turn.' },
  {
    name: 'VESTARA_UI_TESTER_AUTOTRIGGER',
    scope: 'api-process',
    description: "Set to '1' to enable UI tester autotrigger.",
  },
  {
    name: 'VESTARA_CI_NOTIFY_INTERVAL_MS',
    scope: 'api-process',
    description: 'CI notification interval in milliseconds.',
  },
  {
    name: 'TELEGRAM_BOT_TOKEN',
    scope: 'api-process',
    description: 'Telegram Bot API token. Webhook features are absent when unset.',
    sensitive: true,
  },
  // ─── OpenCode / providers ───────────────────────────────────
  { name: 'OPENCODE_API_KEY', scope: 'opencode', description: 'OpenCode provider API key.', sensitive: true },
  { name: 'OPENAI_API_KEY', scope: 'opencode', description: 'OpenAI provider API key.', sensitive: true },
  {
    name: 'GITHUB_TOKEN',
    scope: 'opencode',
    description: 'GitHub token for CI reconciliation and adapters.',
    sensitive: true,
  },
  // ─── Build ──────────────────────────────────────────────────
  {
    name: 'VITE_API_URL',
    scope: 'build',
    description: 'UI API base URL, injected at build time. Not observable by the API runtime.',
  },
];

export interface ConfigAttribution {
  readonly source: 'default' | 'user' | 'workspace' | 'session' | 'command';
  readonly sourcePath?: string;
  readonly value: unknown;
}

export function projectRegistry(
  env: Readonly<Record<string, string | undefined>>,
  lookupConfig: (key: string) => ConfigAttribution | null,
): EnvironmentVariableView[] {
  return REGISTRY.map((entry) => projectEntry(entry, env, lookupConfig));
}

function projectEntry(
  entry: RegistryEntry,
  env: Readonly<Record<string, string | undefined>>,
  lookupConfig: (key: string) => ConfigAttribution | null,
): EnvironmentVariableView {
  const sensitive = entry.sensitive ?? isSensitiveKey(entry.name);
  const raw = env[entry.name];
  const envSet = raw !== undefined && raw !== '';

  // ─── Sensitive: presence only, value never serialized ───
  if (sensitive) {
    return {
      name: entry.name,
      scope: entry.scope,
      description: entry.description,
      effectiveSource: envSet ? 'environment' : 'unknown',
      hasValue: envSet,
      sensitive: true,
      masked: envSet,
      editable: false,
      overridden: false,
      restartRequired: false,
    };
  }

  const attribution = entry.configKey ? lookupConfig(entry.configKey) : null;
  const definitionDefault =
    entry.configKey !== undefined ? WORKSPACE_SETTING_DEFINITIONS[entry.configKey]?.defaultValue : undefined;

  // ─── Environment wins (matches ConfigurationManager overlay order) ───
  if (envSet) {
    const layerSet = attribution !== null && (attribution.source === 'user' || attribution.source === 'workspace');
    const differsFromDefault =
      (entry.defaultValue !== undefined && raw !== entry.defaultValue) ||
      (definitionDefault !== undefined && raw !== String(definitionDefault));
    return {
      name: entry.name,
      scope: entry.scope,
      description: entry.description,
      effectiveSource: 'environment',
      sourcePath: layerSet ? attribution?.sourcePath : undefined,
      hasValue: true,
      sensitive: false,
      masked: false,
      effectiveValue: raw as string,
      editable: false,
      overridden: layerSet || differsFromDefault,
      restartRequired: false,
    };
  }

  // ─── Configuration layers (already resolved + masked by the authority) ───
  if (attribution !== null && attribution.source !== 'default') {
    return {
      name: entry.name,
      scope: entry.scope,
      description: entry.description,
      effectiveSource: attribution.source,
      sourcePath: attribution.sourcePath,
      hasValue: true,
      sensitive: false,
      masked: false,
      effectiveValue: String(attribution.value),
      editable: false,
      overridden: false,
      restartRequired: false,
    };
  }

  // ─── Verified code fallback ───
  const fallback = entry.defaultValue ?? (definitionDefault !== undefined ? String(definitionDefault) : undefined);
  if (fallback !== undefined) {
    return {
      name: entry.name,
      scope: entry.scope,
      description: entry.description,
      effectiveSource: 'default',
      hasValue: false,
      sensitive: false,
      masked: false,
      effectiveValue: fallback,
      editable: false,
      overridden: false,
      restartRequired: false,
    };
  }

  // ─── Unknown stays unknown ───
  return {
    name: entry.name,
    scope: entry.scope,
    description: entry.description,
    effectiveSource: 'unknown',
    hasValue: false,
    sensitive: false,
    masked: false,
    editable: false,
    overridden: false,
    restartRequired: false,
  };
}

export async function handleSystemEnvironmentRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/system/environment') {
    // Same read policy as GET /api/settings: local-session read, no role gate.
    const resolved = ctx.settings.resolve();
    const views = projectRegistry(process.env, (key) => {
      const setting = resolved.settings.find((entry) => entry.key === key);
      if (!setting) return null;
      return { source: setting.source, sourcePath: setting.sourcePath, value: setting.value };
    });
    json(res, 200, { variables: views });
    return true;
  }
  return false;
}
