/**
 * Canonical provider operational state vocabulary.
 *
 * Runtime-neutral: describes the health/availability of a provider
 * without encoding OpenCode-specific status codes.
 */

export type ProviderOperationalState =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'cooling-down'
  | 'disabled'
  | 'authentication-required'
  | 'rate-limited';

export interface ProviderAvailability {
  readonly installed: boolean;
  readonly authenticated: boolean;
  readonly reachable: boolean;
  readonly available: boolean;
  readonly allowed: boolean;
  readonly busy: boolean;
  readonly state: ProviderOperationalState;
  readonly latencyMs?: number;
  readonly lastSuccessfulRequest?: string;
  readonly rateLimitResetAt?: string;
}

export interface RoutingConstraints {
  readonly locality: 'local-only' | 'prefer-local' | 'allow-cloud';
  readonly dataPolicy: 'no-source-upload' | 'metadata-only' | 'source-allowed';
  readonly costPolicy: 'free-only' | 'budgeted' | 'unrestricted';
  readonly maximumEstimatedCost?: number;
  readonly maximumLatencyMs?: number;
  readonly requireIndependentVerifier: boolean;
}
