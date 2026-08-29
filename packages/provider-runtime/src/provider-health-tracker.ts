import type { ProviderAvailability, ProviderOperationalState } from './routing-types.js';

export interface ProviderHealthTrackerOptions {
  readonly failureThreshold?: number;
  readonly recoveryThreshold?: number;
  readonly cooldownMs?: number;
}

interface MutableHealthState {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  state: ProviderOperationalState;
  cooldownUntil?: number;
  lastSuccessfulRequest?: string;
  latencyMs?: number;
  authenticated: boolean;
  enabled: boolean;
  rateLimitResetAt?: string;
}

export class ProviderHealthTracker {
  private readonly states = new Map<string, MutableHealthState>();
  private readonly failureThreshold: number;
  private readonly recoveryThreshold: number;
  private readonly cooldownMs: number;

  constructor(options: ProviderHealthTrackerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.recoveryThreshold = options.recoveryThreshold ?? 2;
    this.cooldownMs = options.cooldownMs ?? 30_000;
  }

  recordSuccess(providerId: string, latencyMs: number, now = new Date()): void {
    const state = this.state(providerId);
    state.consecutiveFailures = 0;
    state.consecutiveSuccesses++;
    state.latencyMs = latencyMs;
    state.lastSuccessfulRequest = now.toISOString();
    if (state.consecutiveSuccesses >= this.recoveryThreshold || state.state === 'healthy') state.state = 'healthy';
  }

  recordFailure(providerId: string, now = new Date()): void {
    const state = this.state(providerId);
    state.consecutiveSuccesses = 0;
    state.consecutiveFailures++;
    if (state.consecutiveFailures >= this.failureThreshold) {
      state.state = 'cooling-down';
      state.cooldownUntil = now.getTime() + this.cooldownMs;
    } else {
      state.state = 'degraded';
    }
  }

  recordRateLimit(providerId: string, resetAt: Date): void {
    const state = this.state(providerId);
    state.state = 'rate-limited';
    state.rateLimitResetAt = resetAt.toISOString();
  }

  setAuthenticated(providerId: string, authenticated: boolean): void {
    const state = this.state(providerId);
    state.authenticated = authenticated;
    if (!authenticated) state.state = 'authentication-required';
  }

  setEnabled(providerId: string, enabled: boolean): void {
    const state = this.state(providerId);
    state.enabled = enabled;
    if (!enabled) state.state = 'disabled';
  }

  availability(providerId: string, now = new Date()): ProviderAvailability {
    const state = this.state(providerId);
    if (state.state === 'cooling-down' && state.cooldownUntil !== undefined && now.getTime() >= state.cooldownUntil) {
      state.state = 'degraded';
      state.cooldownUntil = undefined;
    }
    if (state.state === 'rate-limited' && state.rateLimitResetAt && now >= new Date(state.rateLimitResetAt)) {
      state.state = 'degraded';
      state.rateLimitResetAt = undefined;
    }

    const reachable = state.state === 'healthy' || state.state === 'degraded';
    return {
      installed: true,
      authenticated: state.authenticated,
      reachable,
      available: reachable && state.enabled && state.authenticated,
      allowed: state.enabled,
      busy: false,
      state: state.state,
      latencyMs: state.latencyMs,
      lastSuccessfulRequest: state.lastSuccessfulRequest,
      rateLimitResetAt: state.rateLimitResetAt,
    };
  }

  private state(providerId: string): MutableHealthState {
    let state = this.states.get(providerId);
    if (!state) {
      state = {
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        state: 'healthy',
        authenticated: true,
        enabled: true,
      };
      this.states.set(providerId, state);
    }
    return state;
  }
}
