/**
 * VES-LEAN-003C: Capability Catalog Service
 *
 * Builds and serves the read-only capability catalog.
 * Projects from RuntimeProfile + package metadata.
 *
 * This is a PROJECTION, not an authority.
 * ActivationPlan remains the runtime activation authority.
 *
 * Ownership: @vestara/workspace
 */

import type {
  CapabilityCatalog,
  CapabilityCatalogEntry,
  CapabilityCategory,
  CapabilityHealth,
  ParkingState,
} from '@vestara/types';
import { buildCatalog, DOGFOOD_PROFILE } from '@vestara/types';

// ─── Enrichment Data ────────────────────────────────────────

/**
 * Static enrichment data for capabilities.
 * Maps capability ID to catalog metadata not available in CapabilityDescriptor.
 */
const ENRICHMENTS = new Map<
  string,
  {
    description: string;
    category: CapabilityCategory;
    packages: string[];
    health: CapabilityHealth;
    documentation?: string[];
  }
>([
  // ── Core ──────────────────────────────────────────────
  [
    'kernel',
    {
      description: 'Lifecycle coordinator — boots services, manages health, orchestrates shutdown',
      category: 'core',
      packages: ['@vestara/kernel'],
      health: 'verified',
    },
  ],
  [
    'configuration',
    {
      description: 'Key-value configuration with layered resolution (env, file, workspace)',
      category: 'core',
      packages: ['@vestara/configuration'],
      health: 'verified',
    },
  ],
  [
    'logger',
    {
      description: 'Structured logging with child loggers and level control',
      category: 'core',
      packages: ['@vestara/logger'],
      health: 'verified',
    },
  ],
  [
    'metrics',
    {
      description: 'Runtime metrics collection (gauges, counters)',
      category: 'core',
      packages: ['@vestara/metrics'],
      health: 'verified',
    },
  ],
  [
    'event-bus',
    {
      description: 'In-process pub/sub event bus with pattern matching and retry',
      category: 'core',
      packages: ['@vestara/event-bus'],
      health: 'verified',
    },
  ],
  [
    'service-registry',
    {
      description: 'Service registration, capability discovery, dependency graph',
      category: 'core',
      packages: ['@vestara/service-registry'],
      health: 'verified',
    },
  ],
  [
    'health',
    {
      description: 'Periodic health checks and overall health aggregation',
      category: 'core',
      packages: ['@vestara/health'],
      health: 'verified',
    },
  ],
  [
    'permissions',
    {
      description: 'RBAC permission checks and role resolution',
      category: 'core',
      packages: ['@vestara/permissions'],
      health: 'verified',
    },
  ],
  [
    'recovery',
    {
      description: 'Exponential backoff recovery with escalation',
      category: 'core',
      packages: ['@vestara/kernel'],
      health: 'verified',
    },
  ],
  [
    'task-scheduler',
    {
      description: 'Cron-like periodic task scheduling',
      category: 'core',
      packages: ['@vestara/kernel'],
      health: 'verified',
    },
  ],
  [
    'job-scheduler',
    {
      description: 'Worker/job orchestration and queue management',
      category: 'core',
      packages: ['@vestara/scheduler'],
      health: 'verified',
    },
  ],
  [
    'worker-manager',
    {
      description: 'Worker lifecycle, quarantine, failure budgets',
      category: 'core',
      packages: ['@vestara/kernel'],
      health: 'verified',
    },
  ],
  [
    'job-manager',
    {
      description: 'Job submit/cancel/queue inspection',
      category: 'core',
      packages: ['@vestara/kernel'],
      health: 'verified',
    },
  ],

  // ── Global Assistant ──────────────────────────────────
  [
    'global-assistant',
    {
      description: 'Global/Floating AI Assistant with conversation, context, and execution',
      category: 'assistant',
      packages: ['@vestara/workspace'],
      health: 'pass',
    },
  ],
  [
    'conversation',
    {
      description: 'Conversation management with context assembly and provider execution',
      category: 'assistant',
      packages: ['@vestara/conversation', '@vestara/conversation-runtime'],
      health: 'pass',
    },
  ],
  [
    'workspace-runtime',
    {
      description: 'Workspace identity, discovery, fingerprinting, and session management',
      category: 'core',
      packages: ['@vestara/workspace'],
      health: 'pass',
    },
  ],
  [
    'provider-resolution',
    {
      description: 'AI provider/model routing and resolution',
      category: 'provider',
      packages: ['@vestara/provider-runtime', '@vestara/provider-opencode'],
      health: 'pass',
    },
  ],
  [
    'agent-harness',
    {
      description: 'Durable agent execution loop with tool invocation and verification',
      category: 'execution',
      packages: ['@vestara/agent-harness'],
      health: 'pass',
    },
  ],
  [
    'tool-runtime',
    {
      description: 'Unified tool schema, policy, invocation, and evidence boundary',
      category: 'tools',
      packages: ['@vestara/tool-runtime'],
      health: 'pass',
    },
  ],
  [
    'evidence',
    {
      description: 'Content-addressed evidence collection, manifests, and verification bundles',
      category: 'evidence',
      packages: ['@vestara/evidence'],
      health: 'pass',
    },
  ],
  [
    'memory',
    {
      description: 'Four-layer memory system (working, episodic, semantic, long-term)',
      category: 'memory',
      packages: ['@vestara/memory'],
      health: 'pass',
    },
  ],
  [
    'interaction',
    {
      description: 'Structured interaction service for approval flows',
      category: 'execution',
      packages: ['@vestara/interaction-app', '@vestara/interaction-persistence'],
      health: 'pass',
    },
  ],
  [
    'worktree',
    {
      description: 'Git worktree lease management for isolated agent execution',
      category: 'execution',
      packages: ['@vestara/worktree-runtime'],
      health: 'pass',
    },
  ],
  [
    'thread-store',
    {
      description: 'Thread persistence for agent harness',
      category: 'execution',
      packages: ['@vestara/thread-runtime'],
      health: 'pass',
    },
  ],
  [
    'engineering-events',
    {
      description: 'Durable append-only engineering event store',
      category: 'core',
      packages: ['@vestara/engineering-event-store'],
      health: 'pass',
    },
  ],
  [
    'routing',
    {
      description: 'Provider routing persistence and assignment',
      category: 'provider',
      packages: ['@vestara/provider-runtime'],
      health: 'pass',
    },
  ],
  [
    'workflow-orchestrator',
    {
      description: 'Multi-agent workflow orchestration with projects, plans, and tasks',
      category: 'execution',
      packages: ['@vestara/workflow-orchestrator'],
      health: 'pass',
    },
  ],
  [
    'plans-db',
    {
      description: 'Engineering plans and artifacts persistence',
      category: 'core',
      packages: ['@vestara/workspace'],
      health: 'pass',
    },
  ],
  [
    'verification',
    {
      description: 'Deterministic evidence collection and verification engine',
      category: 'evidence',
      packages: ['@vestara/verification'],
      health: 'pass',
    },
  ],

  // ── Activity Room ─────────────────────────────────────
  [
    'activity-room',
    {
      description: 'Real-time activity projection with participants, stream, and attention',
      category: 'activity-room',
      packages: ['@vestara/activity-room'],
      health: 'pass',
    },
  ],
  [
    'm9-ingestion',
    {
      description: 'EventBus to M9 durable store ingestion bridge',
      category: 'activity-room',
      packages: ['@vestara/activity-room'],
      health: 'pass',
    },
  ],
  [
    'm11a-api',
    {
      description: 'Production read-only Activity Room HTTP API',
      category: 'activity-room',
      packages: ['@vestara/activity-room'],
      health: 'pass',
    },
  ],
  [
    'm11b-websocket',
    {
      description: 'Production Activity Room WebSocket realtime transport',
      category: 'activity-room',
      packages: ['@vestara/activity-room'],
      health: 'pass',
    },
  ],
  [
    'agent-lifecycle-bridge',
    {
      description: 'Harness events to canonical agent lifecycle events',
      category: 'activity-room',
      packages: ['@vestara/activity-room'],
      health: 'pass',
    },
  ],

  // ── Diagnostics ───────────────────────────────────────
  [
    'diagnostics',
    {
      description: 'Runtime diagnostics, health inspection, and system diagnosis',
      category: 'diagnostics',
      packages: ['@vestara/workspace'],
      health: 'pass',
    },
  ],

  // ── Optional ──────────────────────────────────────────
  [
    'engineering-memory',
    {
      description: 'Engineering memory capturing harness events as durable memories',
      category: 'memory',
      packages: ['@vestara/memory'],
      health: 'unknown',
    },
  ],
  [
    'documentation',
    {
      description: 'Multi-repository documentation governance and discovery',
      category: 'integration',
      packages: ['@vestara/documentation'],
      health: 'unknown',
    },
  ],
  [
    'marketplace',
    {
      description: 'Extension marketplace for capability discovery and installation',
      category: 'marketplace',
      packages: ['@vestara/marketplace', '@vestara/extension-runtime', '@vestara/extension-contracts'],
      health: 'unknown',
    },
  ],

  // ── Disabled/Parked ───────────────────────────────────
  [
    'boot-runtime',
    {
      description: 'OS-0 boot coordination and boot-state persistence',
      category: 'os',
      packages: ['@vestara/boot-runtime'],
      health: 'unknown',
    },
  ],
  [
    'host-runtime',
    {
      description: 'OS-0 host inspection and system information',
      category: 'os',
      packages: ['@vestara/host-runtime'],
      health: 'unknown',
    },
  ],
  [
    'browser-runtime',
    {
      description: 'Governed browser automation with Playwright/agent-browser driver',
      category: 'tools',
      packages: ['@vestara/browser-runtime'],
      health: 'unknown',
    },
  ],
  [
    'telegram',
    {
      description: 'Telegram bot integration for remote Activity Room access',
      category: 'integration',
      packages: ['@vestara/telegram-integration'],
      health: 'unknown',
    },
  ],
  [
    'opencode-go-provider',
    {
      description: 'OpenCode Go AI provider variant',
      category: 'provider',
      packages: ['@vestara/provider-opencode'],
      health: 'unknown',
    },
  ],
  [
    'openai-provider',
    {
      description: 'OpenAI direct API provider',
      category: 'provider',
      packages: ['@vestara/provider-opencode'],
      health: 'unknown',
    },
  ],
  [
    'worker-cluster',
    {
      description: 'Distributed worker cluster for parallel agent execution',
      category: 'execution',
      packages: ['@vestara/workspace'],
      health: 'unknown',
    },
  ],
  [
    'dashboard-runtime',
    {
      description: 'Dashboard widget runtime and lifecycle management',
      category: 'ui',
      packages: ['@vestara/widget-runtime'],
      health: 'unknown',
    },
  ],
]);

// ─── Catalog Service ────────────────────────────────────────

/**
 * Build the capability catalog for a given profile.
 * Projects from RuntimeProfile + static enrichment data.
 */
export function buildCapabilityCatalog(_profileId: string = 'dogfood'): CapabilityCatalog {
  // Only dogfood profile is available in the workspace package.
  // Full profile is in apps/api — catalog service focuses on dogfood.
  const profile = DOGFOOD_PROFILE;
  return buildCatalog(profile.id, profile.capabilities, ENRICHMENTS);
}

/**
 * Get a single capability by ID.
 */
export function getCapability(id: string, profileId: string = 'dogfood'): CapabilityCatalogEntry | undefined {
  const catalog = buildCapabilityCatalog(profileId);
  return catalog.capabilities.find((c) => c.id === id);
}

/**
 * Get capabilities by parking state.
 */
export function getCapabilitiesByParkingState(
  state: ParkingState,
  profileId: string = 'dogfood',
): readonly CapabilityCatalogEntry[] {
  const catalog = buildCapabilityCatalog(profileId);
  return catalog.capabilities.filter((c) => c.parkingState === state);
}

/**
 * Get capabilities by category.
 */
export function getCapabilitiesByCategory(
  category: CapabilityCategory,
  profileId: string = 'dogfood',
): readonly CapabilityCatalogEntry[] {
  const catalog = buildCapabilityCatalog(profileId);
  return catalog.capabilities.filter((c) => c.category === category);
}

/**
 * Search capabilities by name or description.
 */
export function searchCapabilities(query: string, profileId: string = 'dogfood'): readonly CapabilityCatalogEntry[] {
  const catalog = buildCapabilityCatalog(profileId);
  const lower = query.toLowerCase();
  return catalog.capabilities.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      c.description.toLowerCase().includes(lower) ||
      c.id.toLowerCase().includes(lower),
  );
}
