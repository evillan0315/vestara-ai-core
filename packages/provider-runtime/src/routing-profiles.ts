import type { EngineeringRoutingPolicy, RoutingConstraints, RoutingMode } from './routing-types.js';

export type RoutingProfileId = 'local' | 'balanced' | 'best-quality' | 'fast' | 'strict-engineering' | 'manual';

export interface RoutingProfile {
  readonly id: RoutingProfileId;
  readonly name: string;
  readonly description: string;
  readonly policy: EngineeringRoutingPolicy;
}

const baseConstraints: RoutingConstraints = {
  locality: 'allow-cloud',
  dataPolicy: 'source-allowed',
  costPolicy: 'unrestricted',
  requireIndependentVerifier: false,
};

function createPolicy(
  id: RoutingProfileId,
  mode: RoutingMode,
  constraints: RoutingConstraints,
): EngineeringRoutingPolicy {
  return {
    id,
    mode,
    implementation: {
      requiredCapabilities: ['implementation', 'filesystem-read', 'filesystem-write', 'command-execution', 'streaming'],
    },
    verification: { requiredCapabilities: ['verification', 'code-review', 'filesystem-read', 'command-execution'] },
    roles: {
      planner: { requiredCapabilities: ['planning', 'structured-output'] },
      architect: { requiredCapabilities: ['planning', 'code-review', 'filesystem-read'] },
      documentation: { requiredCapabilities: ['conversation', 'filesystem-read', 'filesystem-write'] },
    },
    fallback: {
      enabled: id !== 'manual',
      permittedStages: ['before-execution', 'before-first-output', 'mid-turn', 'verification'],
      requireApprovalAfterSideEffects: true,
      cooldownMs: 30_000,
    },
    constraints,
  };
}

export const ROUTING_PROFILES: readonly RoutingProfile[] = [
  {
    id: 'local',
    name: 'Local',
    description: 'Privacy-first routing through local providers only.',
    policy: createPolicy('local', 'local-first', {
      ...baseConstraints,
      locality: 'local-only',
      dataPolicy: 'no-source-upload',
    }),
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Balances capability, latency, and cost.',
    policy: createPolicy('balanced', 'balanced', baseConstraints),
  },
  {
    id: 'best-quality',
    name: 'Best Quality',
    description: 'Prefers the highest-capability compatible model.',
    policy: createPolicy('best-quality', 'quality-first', baseConstraints),
  },
  {
    id: 'fast',
    name: 'Fast',
    description: 'Prefers low-latency compatible models.',
    policy: createPolicy('fast', 'automatic', { ...baseConstraints, maximumLatencyMs: 2_000 }),
  },
  {
    id: 'strict-engineering',
    name: 'Strict Engineering',
    description: 'Requires an independent verification assignment.',
    policy: createPolicy('strict-engineering', 'quality-first', {
      ...baseConstraints,
      requireIndependentVerifier: true,
    }),
  },
  {
    id: 'manual',
    name: 'Manual',
    description: 'Requires explicit provider/model choices and disables automatic fallback.',
    policy: createPolicy('manual', 'manual', baseConstraints),
  },
] as const;

export function getRoutingProfile(id: RoutingProfileId): RoutingProfile {
  const profile = ROUTING_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown routing profile: "${id}"`);
  return profile;
}
