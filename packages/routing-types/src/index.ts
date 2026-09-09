/**
 * @vestara/routing-types — Canonical routing vocabulary.
 *
 * This package is a dependency-free leaf containing the minimum stable domain
 * contracts for provider, model, runtime identity and routing selection.
 *
 * INVARIANTS:
 *   - Leaf package: no runtime behavior, no services, no persistence
 *   - Zero @vestara/* dependencies
 *   - Runtime-neutral: no OpenCode-specific concepts
 *   - Branding prevents accidental ProviderId/ModelId substitution
 */

export {
  type ModelId,
  modelId,
  type ProviderId,
  type ProviderModelRef,
  providerId,
} from './provider-model.js';

export type {
  ProviderAvailability,
  ProviderOperationalState,
  RoutingConstraints,
} from './provider-state.js';

export {
  type EngineeringRoutingPolicy,
  type EngineeringRoutingSelection,
  type FallbackPolicy,
  type FallbackStage,
  isRoutingCapability,
  type RejectedCandidate,
  ROUTING_CAPABILITIES,
  type RoleRoutingPolicy,
  type RoutingAssignment,
  type RoutingAssignmentStatus,
  type RoutingCandidate,
  type RoutingCapability,
  type RoutingDecisionEvidence,
  type RoutingMode,
  type RoutingRequest,
  type RoutingResolution,
  type VersionedRoutingSelection,
} from './routing.js';
