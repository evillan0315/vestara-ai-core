/**
 * VES-LEAN-002: Runtime Capability & Activation Profile Contract
 *
 * Establishes the canonical lifecycle vocabulary for runtime capabilities:
 *   Known → Installed → Enabled → Active
 *
 * Separates two independent dimensions:
 *   - Requirement: REQUIRED | OPTIONAL | DISABLED
 *   - Activation: EAGER | LAZY | NONE
 *
 * A RuntimeProfile selects which capabilities are ACTIVE and how they
 * are activated. It does NOT own capability implementation state.
 *
 * Invariant:
 *   Known != Installed != Enabled != Active
 *
 * Ownership: @vestara/types
 */

// ─── Lifecycle States ───────────────────────────────────────

/**
 * Capability lifecycle state.
 * A capability progresses through these states; they are not collapsed.
 */
export type CapabilityLifecycleState =
  | 'known'     // Vestara understands the capability contract
  | 'installed' // Implementation is available to this installation
  | 'enabled'   // Policy/configuration permits the capability
  | 'active';   // Selected for current runtime, resources constructed

// ─── Requirement Dimension ──────────────────────────────────

/**
 * Whether a capability is required by the runtime surface.
 * Independent of activation strategy.
 */
export type CapabilityRequirement =
  | 'required'  // Must be active for the selected runtime profile
  | 'optional'  // May be active; not required by the surface
  | 'disabled'; // Must NOT be active for the selected runtime profile

// ─── Activation Dimension ───────────────────────────────────

/**
 * How a capability is activated.
 * Independent of requirement classification.
 */
export type CapabilityActivation =
  | 'eager' // Constructed and started during boot
  | 'lazy'  // Constructed on first use, not at boot
  | 'none'; // Never constructed; no resources allocated

// ─── Capability Descriptor ──────────────────────────────────

/**
 * Describes a capability's classification within a runtime profile.
 *
 * Two independent dimensions:
 *   - requirement: REQUIRED / OPTIONAL / DISABLED
 *   - activation: EAGER / LAZY / NONE
 *
 * Valid combinations:
 *   REQUIRED/EAGER  — must be active, constructed at boot
 *   REQUIRED/LAZY   — must be active, constructed on first use
 *   OPTIONAL/EAGER  — may be active, constructed at boot
 *   OPTIONAL/LAZY   — may be active, constructed on first use
 *   DISABLED/NONE   — must not be active, never constructed
 */
export interface CapabilityDescriptor {
  /** Unique capability identifier (e.g. 'global-assistant', 'activity-room'). */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** Requirement classification. */
  readonly requirement: CapabilityRequirement;

  /** Activation strategy. */
  readonly activation: CapabilityActivation;

  /**
   * Transitive capability dependencies.
   * A capability with REQUIRED requirement requires all its dependencies
   * to also be ACTIVE (or LAZY with a defined activation path).
   */
  readonly dependencies?: readonly string[];
}

// ─── Runtime Profile ────────────────────────────────────────

/**
 * A runtime profile defines which capabilities are ACTIVE and how
 * they are activated for a specific deployment scenario.
 *
 * The profile is a selection mechanism, not an authority.
 * It does not own capability implementation state.
 *
 * Conceptual flow:
 *   Capability Registry → Installed/Enabled State → Runtime Profile
 *     → Dependency Resolution → Activation Plan → Composition
 */
export interface RuntimeProfile {
  /** Unique profile identifier (e.g. 'dogfood', 'full'). */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** Profile description. */
  readonly description: string;

  /**
   * Capability classifications for this profile.
   * Only capabilities present here are considered for activation.
   * Capabilities not listed here remain in their default state.
   */
  readonly capabilities: readonly CapabilityDescriptor[];
}

// ─── Activation Plan ────────────────────────────────────────

/**
 * Resolved activation plan for a specific profile.
 * Produced by dependency resolution over the profile's capabilities.
 */
export interface ActivationPlan {
  /** The profile this plan was derived from. */
  readonly profileId: string;

  /**
   * Capabilities that will be EAGER (constructed at boot).
   * Includes transitive dependencies of REQUIRED capabilities.
   */
  readonly eager: readonly string[];

  /**
   * Capabilities that will be LAZY (constructed on first use).
   * Includes transitive dependencies that are REQUIRED/LAZY.
   */
  readonly lazy: readonly string[];

  /**
   * Capabilities that will be DISABLED (never constructed).
   * Includes DISABLED/NONE and OPTIONAL/NONE capabilities.
   */
  readonly disabled: readonly string[];

  /**
   * Capabilities whose requirement could not be satisfied
   * because a required dependency is not available.
   */
  readonly unsatisfied: readonly string[];
}

// ─── Profile Resolution ─────────────────────────────────────

/**
 * Resolve an activation plan from a runtime profile.
 *
 * Algorithm:
 * 1. For each capability in the profile:
 *    - If requirement is 'disabled' → activation is 'none'
 *    - If requirement is 'required' and activation is 'eager' → eager
 *    - If requirement is 'required' and activation is 'lazy' → lazy
 *    - If requirement is 'optional' → follow declared activation
 * 2. Transitively resolve dependencies:
 *    - A REQUIRED capability's dependencies become REQUIRED
 *    - An OPTIONAL capability's dependencies become OPTIONAL
 * 3. Check that all REQUIRED dependencies are satisfiable
 * 4. Return the activation plan
 */
export function resolveActivationPlan(profile: RuntimeProfile): ActivationPlan {
  const eager = new Set<string>();
  const lazy = new Set<string>();
  const disabled = new Set<string>();
  const unsatisfied = new Set<string>();

  // Build a lookup map
  const byId = new Map<string, CapabilityDescriptor>();
  for (const cap of profile.capabilities) {
    byId.set(cap.id, cap);
  }

  // Phase 1: Direct classification
  for (const cap of profile.capabilities) {
    if (cap.requirement === 'disabled') {
      disabled.add(cap.id);
    } else if (cap.requirement === 'required') {
      if (cap.activation === 'eager') {
        eager.add(cap.id);
      } else if (cap.activation === 'lazy') {
        lazy.add(cap.id);
      } else {
        // REQUIRED/NONE — requirement cannot be satisfied
        unsatisfied.add(cap.id);
      }
    } else {
      // OPTIONAL — follow declared activation
      if (cap.activation === 'eager') {
        eager.add(cap.id);
      } else if (cap.activation === 'lazy') {
        lazy.add(cap.id);
      } else {
        disabled.add(cap.id);
      }
    }
  }

  // Phase 2: Transitive dependency resolution
  // REQUIRED dependencies of REQUIRED capabilities become REQUIRED
  // OPTIONAL dependencies of OPTIONAL capabilities become OPTIONAL
  const visited = new Set<string>();
  function resolveDeps(capId: string, parentRequirement: CapabilityRequirement): void {
    if (visited.has(capId)) return;
    visited.add(capId);
    const cap = byId.get(capId);
    if (!cap?.dependencies) return;
    for (const depId of cap.dependencies) {
      if (disabled.has(depId)) {
        // Dependency is disabled — parent cannot be satisfied
        if (parentRequirement === 'required') {
          unsatisfied.add(capId);
          eager.delete(capId);
          lazy.delete(capId);
        }
        continue;
      }
      if (parentRequirement === 'required') {
        // REQUIRED dependency — must be active
        if (!eager.has(depId) && !lazy.has(depId)) {
          // Not yet classified — make it eager by default
          eager.add(depId);
        }
      }
      resolveDeps(depId, parentRequirement);
    }
  }

  for (const cap of profile.capabilities) {
    if (cap.requirement !== 'disabled') {
      resolveDeps(cap.id, cap.requirement);
    }
  }

  return {
    profileId: profile.id,
    eager: [...eager],
    lazy: [...lazy],
    disabled: [...disabled],
    unsatisfied: [...unsatisfied],
  };
}

// ─── Dogfood Profile ────────────────────────────────────────

/**
 * The dogfood runtime profile.
 *
 * Production surface:
 *   - Global Assistant
 *   - Activity Room
 *   - Diagnostics
 *   - Minimum transitive infrastructure
 */
export const DOGFOOD_PROFILE: RuntimeProfile = {
  id: 'dogfood',
  name: 'Vestara Dogfood',
  description: 'Focused dogfood runtime: Global Assistant, Activity Room, Diagnostics',
  capabilities: [
    // ── Shared Core (REQUIRED / EAGER) ──────────────────────
    {
      id: 'kernel',
      name: 'Kernel',
      requirement: 'required',
      activation: 'eager',
      dependencies: [],
    },
    {
      id: 'configuration',
      name: 'Configuration',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'logger',
      name: 'Logger',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'metrics',
      name: 'Metrics',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'event-bus',
      name: 'Event Bus',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
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
    {
      id: 'permissions',
      name: 'Permissions',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'recovery',
      name: 'Recovery Manager',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'service-registry', 'event-bus'],
    },
    {
      id: 'task-scheduler',
      name: 'Task Scheduler',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus'],
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
      dependencies: ['kernel', 'job-scheduler'],
    },
    {
      id: 'job-manager',
      name: 'Job Manager',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'job-scheduler'],
    },

    // ── Global Assistant (REQUIRED / EAGER) ─────────────────
    {
      id: 'global-assistant',
      name: 'Global Assistant',
      requirement: 'required',
      activation: 'eager',
      dependencies: [
        'kernel', 'event-bus', 'service-registry', 'health',
        'conversation', 'workspace-runtime', 'provider-resolution',
        'agent-harness', 'tool-runtime', 'evidence', 'memory',
        'interaction', 'worktree',
      ],
    },
    {
      id: 'conversation',
      name: 'Conversation Service',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus', 'workspace-runtime'],
    },
    {
      id: 'workspace-runtime',
      name: 'Workspace Runtime',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'configuration'],
    },
    {
      id: 'provider-resolution',
      name: 'Provider Resolution',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus'],
    },
    {
      id: 'agent-harness',
      name: 'Agent Harness',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus', 'tool-runtime', 'evidence'],
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
    {
      id: 'memory',
      name: 'Memory Service',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'workspace-runtime'],
    },
    {
      id: 'interaction',
      name: 'Interaction Service',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus'],
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
    {
      id: 'routing',
      name: 'Provider Routing',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'provider-resolution'],
    },
    {
      id: 'workflow-orchestrator',
      name: 'Workflow Orchestrator',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus', 'engineering-events', 'worktree'],
    },
    {
      id: 'plans-db',
      name: 'Plans Database',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'verification',
      name: 'Verification Engine',
      requirement: 'required',
      activation: 'lazy',
      dependencies: ['kernel', 'evidence'],
    },

    // ── Activity Room (REQUIRED / EAGER) ────────────────────
    {
      id: 'activity-room',
      name: 'Activity Room',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus', 'engineering-events'],
    },
    {
      id: 'm9-ingestion',
      name: 'M9 Ingestion Bridge',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus', 'activity-room'],
    },
    {
      id: 'm11a-api',
      name: 'M11A Activity Room API',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'activity-room'],
    },
    {
      id: 'm11b-websocket',
      name: 'M11B Activity Room WebSocket',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'activity-room'],
    },
    {
      id: 'agent-lifecycle-bridge',
      name: 'Agent Lifecycle Bridge',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus', 'activity-room'],
    },

    // ── Diagnostics (REQUIRED / EAGER) ──────────────────────
    {
      id: 'diagnostics',
      name: 'Diagnostics',
      requirement: 'required',
      activation: 'eager',
      dependencies: ['kernel', 'health'],
    },

    // ── Optional / Lazy ─────────────────────────────────────
    {
      id: 'engineering-memory',
      name: 'Engineering Memory',
      requirement: 'optional',
      activation: 'eager',
      dependencies: ['kernel', 'event-bus'],
    },
    {
      id: 'documentation',
      name: 'Documentation Service',
      requirement: 'optional',
      activation: 'eager',
      dependencies: ['kernel'],
    },
    {
      id: 'marketplace',
      name: 'Marketplace',
      requirement: 'optional',
      activation: 'eager',
      dependencies: ['kernel'],
    },

    // ── Disabled for dogfood ────────────────────────────────
    {
      id: 'boot-runtime',
      name: 'Boot Runtime',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'host-runtime',
      name: 'Host Runtime',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'browser-runtime',
      name: 'Browser Runtime',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'telegram',
      name: 'Telegram Integration',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'opencode-go-provider',
      name: 'OpenCode Go Provider',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'openai-provider',
      name: 'OpenAI Provider',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'worker-cluster',
      name: 'Worker Cluster',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
    {
      id: 'dashboard-runtime',
      name: 'Dashboard Runtime',
      requirement: 'disabled',
      activation: 'none',
      dependencies: [],
    },
  ],
};
