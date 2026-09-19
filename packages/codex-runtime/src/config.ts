export interface CodexRuntimeConfigInput {
  readonly appServerUrl?: string;
  readonly authToken?: string;
  readonly requestTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
}

export interface CodexRuntimeConfig {
  readonly appServerUrl: string;
  readonly authToken?: string;
  readonly requestTimeoutMs: number;
  readonly healthTimeoutMs: number;
}

export const CODEX_RUNTIME_DEFAULTS = {
  appServerUrl: 'ws://127.0.0.1:4500',
  requestTimeoutMs: 30_000,
  healthTimeoutMs: 3_000,
} as const;

export class CodexConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodexConfigError';
  }
}

export function codexConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CodexRuntimeConfigInput {
  return {
    appServerUrl: env.CODEX_APP_SERVER_URL,
    authToken: env.CODEX_APP_SERVER_AUTH_TOKEN,
    requestTimeoutMs: parsePositiveInteger(env.CODEX_APP_SERVER_REQUEST_TIMEOUT_MS),
    healthTimeoutMs: parsePositiveInteger(env.CODEX_APP_SERVER_HEALTH_TIMEOUT_MS),
  };
}

export function resolveCodexRuntimeConfig(input: CodexRuntimeConfigInput = {}): CodexRuntimeConfig {
  const appServerUrl = input.appServerUrl ?? CODEX_RUNTIME_DEFAULTS.appServerUrl;
  const url = new URL(appServerUrl);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new CodexConfigError(`Codex App Server URL must use ws:// or wss://, received ${url.protocol}`);
  }

  return {
    appServerUrl: url.toString(),
    authToken: emptyToUndefined(input.authToken),
    requestTimeoutMs: input.requestTimeoutMs ?? CODEX_RUNTIME_DEFAULTS.requestTimeoutMs,
    healthTimeoutMs: input.healthTimeoutMs ?? CODEX_RUNTIME_DEFAULTS.healthTimeoutMs,
  };
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
