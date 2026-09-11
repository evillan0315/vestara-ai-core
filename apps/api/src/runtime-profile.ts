/**
 * VES-LEAN-002: Runtime Profile Resolver
 *
 * Resolves the active runtime profile from environment variables or
 * configuration. Provides the activation plan that the composition
 * root uses to select which capabilities to construct.
 *
 * Selection precedence:
 *   1. VESTARA_RUNTIME_PROFILE env var
 *   2. runtime.profile config key
 *   3. 'full' (default — preserves current behavior)
 *
 * Ownership: apps/api (composition root helper)
 */

import type { ActivationPlan, RuntimeProfile } from '@vestara/types';
import { DOGFOOD_PROFILE, resolveActivationPlan } from '@vestara/types';

// ─── Built-in Profiles ──────────────────────────────────────

/**
 * The 'full' profile — default. Preserves current monolithic behavior.
 * All capabilities are REQUIRED/EAGER unless otherwise classified.
 * This is the safe default that maintains backward compatibility.
 */
const FULL_PROFILE: RuntimeProfile = {
  id: 'full',
  name: 'Vestara Full',
  description: 'Full runtime: all capabilities active (current default behavior)',
  capabilities: [
    { id: 'kernel', name: 'Kernel', requirement: 'required', activation: 'eager' },
    {
      id: 'configuration',
      name: 'Configuration',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'logger', name: 'Logger', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    { id: 'metrics', name: 'Metrics', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    { id: 'event-bus', name: 'Event Bus', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'service-registry',
      name: 'Service Registry',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'health',
      name: 'Health Manager',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'service-registry'],
    },
    { id: 'permissions', name: 'Permissions', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'recovery',
      name: 'Recovery Manager',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'task-scheduler',
      name: 'Task Scheduler',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'job-scheduler',
      name: 'Job Scheduler',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'worker-manager',
      name: 'Worker Manager',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'job-manager', name: 'Job Manager', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'boot-runtime',
      name: 'Boot Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'host-runtime'],
    },
    {
      id: 'host-runtime',
      name: 'Host Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'browser-runtime',
      name: 'Browser Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'global-assistant',
      name: 'Global Assistant',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'conversation',
      name: 'Conversation',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'workspace-runtime',
      name: 'Workspace Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'provider-resolution',
      name: 'Provider Resolution',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'agent-harness',
      name: 'Agent Harness',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'tool-runtime',
      name: 'Tool Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'evidence',
      name: 'Evidence Pipeline',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'memory', name: 'Memory Service', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'interaction',
      name: 'Interaction Service',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'worktree',
      name: 'Worktree Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'thread-store',
      name: 'Thread Store',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'engineering-events',
      name: 'Engineering Events',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'routing', name: 'Provider Routing', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'workflow-orchestrator',
      name: 'Workflow Orchestrator',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'plans-db', name: 'Plans Database', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'verification',
      name: 'Verification Engine',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'activity-room',
      name: 'Activity Room',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'm9-ingestion',
      name: 'M9 Ingestion Bridge',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'm11a-api',
      name: 'M11A Activity Room API',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'm11b-websocket',
      name: 'M11B Activity Room WebSocket',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'agent-lifecycle-bridge',
      name: 'Agent Lifecycle Bridge',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'diagnostics', name: 'Diagnostics', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'engineering-memory',
      name: 'Engineering Memory',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'documentation',
      name: 'Documentation Service',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    { id: 'marketplace', name: 'Marketplace', requirement: 'required', activation: 'eager', dependencies: ['kernel'] },
    {
      id: 'opencode-go-provider',
      name: 'OpenCode Go Provider',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'openai-provider',
      name: 'OpenAI Provider',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'worker-cluster',
      name: 'Worker Cluster',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'dashboard-runtime',
      name: 'Dashboard Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'telegram',
      name: 'Telegram Integration',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
  ],
};

// ─── Profile Registry ───────────────────────────────────────

const PROFILES = new Map<string, RuntimeProfile>([
  ['full', FULL_PROFILE],
  ['dogfood', DOGFOOD_PROFILE],
]);

// ─── Resolution ─────────────────────────────────────────────

/**
 * Resolve the runtime profile from environment or configuration.
 *
 * Selection precedence:
 *   1. VESTARA_RUNTIME_PROFILE env var
 *   2. Default: 'full' (preserves current behavior)
 *
 * Returns both the profile and the resolved activation plan.
 */
export function resolveRuntimeProfile(env?: Record<string, string | undefined>): {
  profile: RuntimeProfile;
  plan: ActivationPlan;
} {
  const profileId = env?.VESTARA_RUNTIME_PROFILE ?? 'full';
  const profile = PROFILES.get(profileId);
  if (!profile) {
    throw new Error(`Unknown runtime profile: '${profileId}'. Available: ${[...PROFILES.keys()].join(', ')}`);
  }
  const plan = resolveActivationPlan(profile);
  return { profile, plan };
}

/**
 * Check if a capability is active in the given activation plan.
 */
export function isCapabilityActive(plan: ActivationPlan, capabilityId: string): boolean {
  return plan.eager.includes(capabilityId) || plan.lazy.includes(capabilityId);
}

/**
 * Check if a capability is eager in the given activation plan.
 */
export function isCapabilityEager(plan: ActivationPlan, capabilityId: string): boolean {
  return plan.eager.includes(capabilityId);
}

/**
 * Check if a capability is lazy in the given activation plan.
 */
export function isCapabilityLazy(plan: ActivationPlan, capabilityId: string): boolean {
  return plan.lazy.includes(capabilityId);
}

/**
 * Check if a capability is disabled in the given activation plan.
 */
export function isCapabilityDisabled(plan: ActivationPlan, capabilityId: string): boolean {
  return plan.disabled.includes(capabilityId);
}

/**
 * Get all active capability IDs from the plan.
 */
export function getActiveCapabilities(plan: ActivationPlan): string[] {
  return [...plan.eager, ...plan.lazy];
}

/**
 * Get all disabled capability IDs from the plan.
 */
export function getDisabledCapabilities(plan: ActivationPlan): string[] {
  return [...plan.disabled];
}
