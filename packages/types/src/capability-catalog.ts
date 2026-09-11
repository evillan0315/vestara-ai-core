/**
 * VES-LEAN-003C: Capability Catalog Contract
 *
 * Read-only capability inventory projected from existing metadata sources:
 *   - RuntimeProfile / CapabilityDescriptor (activation classification)
 *   - VestaraPackageManifest (package metadata)
 *   - CANONICAL_AGENTS (agent capabilities)
 *   - CapabilityService (VSDE maturity)
 *
 * This is a PROJECTION, not an authority.
 * ActivationPlan remains the runtime activation authority.
 *
 * Ownership: @vestara/types
 */

import type { CapabilityActivation, CapabilityDescriptor, CapabilityRequirement } from './runtime-profile';

// ─── Parking State ──────────────────────────────────────────

/**
 * Operational classification for capabilities outside normal activation.
 * Orthogonal to the frozen lifecycle: Known → Installed → Enabled → Active.
 *
 * PARKED means:
 *   - deliberately excluded from normal dogfood runtime/build/test/mutation
 *   - remains known, inspectable, documented
 *   - NOT deleted, deprecated, or unavailable
 */
export type ParkingState =
  | 'active' // Part of the current runtime profile
  | 'parked' // Deliberately excluded from dogfood
  | 'experimental' // Available but not production-ready
  | 'unknown'; // Insufficient evidence to classify

// ─── Capability Category ────────────────────────────────────

/**
 * High-level capability category for catalog organization.
 */
export type CapabilityCategory =
  | 'core' // Kernel, infrastructure, shared services
  | 'assistant' // Global/Floating Assistant
  | 'activity-room' // Activity Room
  | 'diagnostics' // Runtime diagnostics
  | 'execution' // Workflow, task, agent execution
  | 'provider' // AI provider/model resolution
  | 'tools' // Tool capabilities (shell, git, browser, etc.)
  | 'evidence' // Evidence, verification, artifacts
  | 'memory' // Memory, knowledge, context
  | 'integration' // External integrations (Telegram, voice, etc.)
  | 'ui' // UI components, design system
  | 'os' // OS/boot/host runtime
  | 'marketplace' // Extension marketplace
  | 'other'; // Uncategorized

// ─── Health Status ──────────────────────────────────────────

/**
 * Capability health status projected from existing evidence.
 * Never manufactured — only projected from canonical sources.
 */
export type CapabilityHealth =
  | 'verified' // Has passing verification evidence
  | 'pass' // Tests pass, no formal verification
  | 'fail' // Known failures
  | 'degraded' // Partial functionality
  | 'unknown'; // No evidence available

// ─── Capability Catalog Entry ───────────────────────────────

/**
 * A single entry in the capability catalog.
 * Projected from RuntimeProfile + package metadata.
 */
export interface CapabilityCatalogEntry {
  /** Unique capability identifier (matches CapabilityDescriptor.id). */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** Concise description of what the capability does. */
  readonly description: string;

  /** High-level category for organization. */
  readonly category: CapabilityCategory;

  /** Parking state (active, parked, experimental, unknown). */
  readonly parkingState: ParkingState;

  /** Runtime requirement from the current profile. */
  readonly requirement: CapabilityRequirement;

  /** Runtime activation strategy. */
  readonly activation: CapabilityActivation;

  /** Package(s) that implement this capability. */
  readonly packages: readonly string[];

  /** Transitive dependencies. */
  readonly dependencies: readonly string[];

  /** Health/evidence status. */
  readonly health: CapabilityHealth;

  /** Documentation references (file paths or URLs). */
  readonly documentation?: readonly string[];

  /** Evidence/verification references. */
  readonly evidence?: readonly string[];
}

// ─── Capability Catalog ─────────────────────────────────────

/**
 * The complete capability catalog for a Vestara installation.
 * Read-only projection — not an activation authority.
 */
export interface CapabilityCatalog {
  /** Profile this catalog was derived from. */
  readonly profileId: string;

  /** All known capabilities. */
  readonly capabilities: readonly CapabilityCatalogEntry[];

  /** Summary counts. */
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly parked: number;
    readonly experimental: number;
    readonly unknown: number;
  };
}

// ─── Catalog Projection ─────────────────────────────────────

/**
 * Project a CapabilityDescriptor into a CapabilityCatalogEntry.
 * Enriches activation data with catalog metadata.
 */
export function projectCatalogEntry(
  descriptor: CapabilityDescriptor,
  options: {
    description?: string;
    category?: CapabilityCategory;
    packages?: readonly string[];
    health?: CapabilityHealth;
    documentation?: readonly string[];
    evidence?: readonly string[];
  } = {},
): CapabilityCatalogEntry {
  const parkingState: ParkingState =
    descriptor.requirement === 'disabled'
      ? 'parked'
      : descriptor.requirement === 'required'
        ? 'active'
        : descriptor.requirement === 'optional'
          ? 'active'
          : 'unknown';

  return {
    id: descriptor.id,
    name: descriptor.name,
    description: options.description ?? '',
    category: options.category ?? 'other',
    parkingState,
    requirement: descriptor.requirement,
    activation: descriptor.activation,
    packages: options.packages ?? [],
    dependencies: [...(descriptor.dependencies ?? [])],
    health: options.health ?? 'unknown',
    documentation: options.documentation,
    evidence: options.evidence,
  };
}

/**
 * Build a complete CapabilityCatalog from a RuntimeProfile.
 */
export function buildCatalog(
  profileId: string,
  descriptors: readonly CapabilityDescriptor[],
  enrichments?: Map<string, Partial<Parameters<typeof projectCatalogEntry>[1]>>,
): CapabilityCatalog {
  const capabilities = descriptors.map((d) => projectCatalogEntry(d, enrichments?.get(d.id) ?? {}));

  const summary = {
    total: capabilities.length,
    active: capabilities.filter((c) => c.parkingState === 'active').length,
    parked: capabilities.filter((c) => c.parkingState === 'parked').length,
    experimental: capabilities.filter((c) => c.parkingState === 'experimental').length,
    unknown: capabilities.filter((c) => c.parkingState === 'unknown').length,
  };

  return { profileId, capabilities, summary };
}
