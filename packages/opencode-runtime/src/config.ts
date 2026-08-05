// Typed configuration for the OpenCode server integration.
//
// Configuration is validated at startup. When the integration is enabled but
// required credentials or the server URL are missing, startup fails clearly
// rather than serving degraded routes.

export interface OpenCodePolicies {
  readonly allowShell: boolean;
  readonly allowConfigWrite: boolean;
  readonly allowProviderAuth: boolean;
  readonly allowInstanceDispose: boolean;
}

export interface OpenCodeRuntimeConfig {
  readonly baseUrl: URL;
  readonly username: string;
  readonly password: string;
  readonly requestTimeoutMs: number;
  readonly healthTimeoutMs: number;
  readonly reconnectDelayMs: number;
  readonly maxReconnectDelayMs: number;
  readonly policies: OpenCodePolicies;
}

export interface OpenCodeRuntimeConfigInput {
  readonly baseUrl?: string;
  readonly username?: string;
  readonly password?: string;
  readonly requestTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
  readonly policies?: Partial<OpenCodePolicies>;
}

export const OPENCODE_DEFAULTS = {
  baseUrl: 'http://127.0.0.1:4096',
  username: 'opencode',
  requestTimeoutMs: 30_000,
  healthTimeoutMs: 3_000,
  reconnectDelayMs: 2_000,
  maxReconnectDelayMs: 30_000,
  policies: {
    allowShell: false,
    allowConfigWrite: false,
    allowProviderAuth: false,
    allowInstanceDispose: false,
  },
} as const;

export class OpenCodeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenCodeConfigError';
  }
}

export function resolveOpenCodeConfig(input: OpenCodeRuntimeConfigInput = {}): OpenCodeRuntimeConfig {
  const baseUrl = input.baseUrl ?? process.env.OPENCODE_SERVER_URL ?? OPENCODE_DEFAULTS.baseUrl;
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new OpenCodeConfigError(`OPENCODE_SERVER_URL is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OpenCodeConfigError(`OPENCODE_SERVER_URL must use http(s), got ${url.protocol}`);
  }
  const username = input.username ?? process.env.OPENCODE_SERVER_USERNAME ?? OPENCODE_DEFAULTS.username;
  const password = input.password ?? process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) {
    throw new OpenCodeConfigError('OPENCODE_SERVER_PASSWORD is required when the OpenCode integration is enabled');
  }
  const policyInput = input.policies ?? {};
  return {
    baseUrl: url,
    username,
    password,
    requestTimeoutMs: input.requestTimeoutMs ?? OPENCODE_DEFAULTS.requestTimeoutMs,
    healthTimeoutMs: input.healthTimeoutMs ?? OPENCODE_DEFAULTS.healthTimeoutMs,
    reconnectDelayMs: input.reconnectDelayMs ?? OPENCODE_DEFAULTS.reconnectDelayMs,
    maxReconnectDelayMs: input.maxReconnectDelayMs ?? OPENCODE_DEFAULTS.maxReconnectDelayMs,
    policies: {
      allowShell: policyInput.allowShell ?? OPENCODE_DEFAULTS.policies.allowShell,
      allowConfigWrite: policyInput.allowConfigWrite ?? OPENCODE_DEFAULTS.policies.allowConfigWrite,
      allowProviderAuth: policyInput.allowProviderAuth ?? OPENCODE_DEFAULTS.policies.allowProviderAuth,
      allowInstanceDispose: policyInput.allowInstanceDispose ?? OPENCODE_DEFAULTS.policies.allowInstanceDispose,
    },
  };
}

export function openCodeConfigFromEnv(): OpenCodeRuntimeConfig {
  return resolveOpenCodeConfig({});
}
