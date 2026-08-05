// OpenCodeRuntime — managed Vestara runtime for the OpenCode integration.
//
// Lifecycle: created → initializing → checking-upstream → connecting-events →
// running → degraded/reconnecting → stopping → stopped. Owns config validation,
// upstream health checks, event-stream connection state, and reconnection with
// bounded exponential backoff.

import { Runtime, type RuntimeConfig, type RuntimeHooks } from '@vestara/runtime';
import type { OpenCodeClient } from '../client/opencode-client';
import type { OpenCodeRuntimeConfig } from '../config';

export type OpenCodeRuntimeHealth =
  | {
      readonly status: 'healthy';
      readonly version?: string;
      readonly eventStreamConnected: boolean;
      readonly latencyMs: number;
    }
  | {
      readonly status: 'degraded';
      readonly reason: string;
      readonly eventStreamConnected: boolean;
    }
  | {
      readonly status: 'unhealthy';
      readonly reason: string;
    };

export type OpenCodeConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface OpenCodeRuntimeHooks extends RuntimeHooks {
  onHealthChange?: (health: OpenCodeRuntimeHealth) => void;
  onConnectionState?: (state: OpenCodeConnectionState) => void;
}

export class OpenCodeRuntime extends Runtime {
  private readonly client: OpenCodeClient;
  private readonly openCodeConfig: OpenCodeRuntimeConfig;
  private readonly openCodeHooks: OpenCodeRuntimeHooks;
  private connectionState: OpenCodeConnectionState = 'disconnected';
  private eventStreamConnected = false;
  private reconnectAttempt = 0;
  private stopping = false;

  constructor(
    config: RuntimeConfig,
    client: OpenCodeClient,
    openCodeConfig: OpenCodeRuntimeConfig,
    hooks?: OpenCodeRuntimeHooks,
  ) {
    super(config, {
      onInitialize: async () => {
        this.openCodeHooks.onConnectionState?.('connecting');
        if (hooks?.onInitialize) await hooks.onInitialize();
      },
      onStop: async () => {
        this.stopping = true;
        this.eventStreamConnected = false;
        this.openCodeHooks.onConnectionState?.('disconnected');
        if (hooks?.onStop) await hooks.onStop();
      },
      onDestroy: hooks?.onDestroy,
    });
    this.client = client;
    this.openCodeConfig = openCodeConfig;
    this.openCodeHooks = hooks ?? {};
  }

  get openCodeHealth(): OpenCodeRuntimeHealth {
    if (this.connectionState === 'connected' || this.connectionState === 'reconnecting') {
      return { status: 'degraded', reason: this.connectionState, eventStreamConnected: this.eventStreamConnected };
    }
    return { status: 'unhealthy', reason: 'not connected' };
  }

  get connection(): OpenCodeConnectionState {
    return this.connectionState;
  }

  /** Probe upstream health and update runtime health state. */
  async checkUpstream(): Promise<OpenCodeRuntimeHealth> {
    const started = Date.now();
    try {
      const health = await this.client.getHealth();
      const latencyMs = Date.now() - started;
      const result: OpenCodeRuntimeHealth = {
        status: 'healthy',
        version: health.version,
        eventStreamConnected: this.eventStreamConnected,
        latencyMs,
      };
      this.updateHealthState(result);
      return result;
    } catch {
      const result: OpenCodeRuntimeHealth = { status: 'unhealthy', reason: 'upstream unreachable' };
      this.updateHealthState(result);
      return result;
    }
  }

  markEventStream(connected: boolean): void {
    this.eventStreamConnected = connected;
    this.connectionState = connected ? 'connected' : 'disconnected';
    this.openCodeHooks.onConnectionState?.(this.connectionState);
  }

  /** Bounded exponential backoff delay for reconnects. */
  nextReconnectDelayMs(): number {
    const attempt = Math.min(this.reconnectAttempt, 8);
    const delay = this.openCodeConfig.reconnectDelayMs * 2 ** attempt;
    this.reconnectAttempt += 1;
    return Math.min(delay, this.openCodeConfig.maxReconnectDelayMs);
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempt = 0;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  private updateHealthState(health: OpenCodeRuntimeHealth): void {
    this.openCodeHooks.onHealthChange?.(health);
  }
}
