/**
 * OpenCode runtime service — shared client for the API routes.
 *
 * `api/opencode/*`, `api/agents`, and `api/providers` all read the same OpenCode
 * headless runtime through this service. Credentials resolve from configuration
 * once and are never returned to clients. The `OPENCODE_PROXY_ENABLED` gate is
 * respected so the whole surface behaves consistently with `api/opencode/*`.
 */

import {
  disabledError,
  OpenCodeConfigError,
  OpenCodeHttpClient,
  resolveOpenCodeConfig,
} from '@vestara/opencode-runtime';
import { ensureOpencodeServer, noteOpencodeUsed } from './opencode-supervisor';

export interface OpenCodeRuntimeAgent {
  readonly name: string;
  readonly description?: string;
  readonly mode?: string;
  readonly native?: boolean;
}

export interface OpenCodeRuntimeProvider {
  readonly id: string;
  readonly name?: string;
  readonly source?: string;
  readonly modelCount: number;
  readonly models?: readonly string[];
}

export interface OpenCodeRuntimeHealth {
  readonly healthy: boolean;
  readonly version?: string;
}

let cachedConfig: ReturnType<typeof resolveOpenCodeConfig> | undefined;
let configFailed = false;

export class OpenCodeRuntimeService {
  private client(): OpenCodeHttpClient {
    if (!process.env.OPENCODE_PROXY_ENABLED || process.env.OPENCODE_PROXY_ENABLED === 'false') {
      throw disabledError();
    }
    if (!cachedConfig && !configFailed) {
      try {
        cachedConfig = resolveOpenCodeConfig({});
      } catch (error) {
        configFailed = true;
        throw error;
      }
    }
    if (!cachedConfig) throw new OpenCodeConfigError('OPENCODE_SERVER_PASSWORD is required');
    return new OpenCodeHttpClient(cachedConfig);
  }

  /** True when the runtime is configured and reachable. */
  async reachable(): Promise<boolean> {
    try {
      const client = this.client();
      await ensureOpencodeServer();
      noteOpencodeUsed();
      return true;
    } catch {
      return false;
    }
  }

  async listAgents(): Promise<OpenCodeRuntimeAgent[]> {
    const client = this.client();
    await ensureOpencodeServer();
    noteOpencodeUsed();
    return client.listAgents();
  }

  async listProviders(): Promise<OpenCodeRuntimeProvider[]> {
    const client = this.client();
    await ensureOpencodeServer();
    noteOpencodeUsed();
    return client.listProviders();
  }

  async health(): Promise<OpenCodeRuntimeHealth> {
    const client = this.client();
    await ensureOpencodeServer();
    noteOpencodeUsed();
    return client.getHealth();
  }
}

export const openCodeRuntimeService = new OpenCodeRuntimeService();
