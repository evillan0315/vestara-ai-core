/**
 * @vestara/permission-contracts — Canonical permission vocabulary.
 *
 * This package is a dependency-free leaf containing the minimum stable domain
 * contracts for permission actions, risk classification, policy decisions,
 * and approval semantics.
 *
 * INVARIANTS:
 *   - Leaf package: no runtime behavior, no services, no persistence
 *   - Zero @vestara/* dependencies
 *   - Runtime-neutral: no OpenCode-specific concepts
 *   - Closed vocabularies: no `(string & {})` escape hatches
 */

export {
  classifyPermissionRisk,
  normalizePermissionAction,
} from './normalize.js';
export {
  ALL_PERMISSION_ACTIONS,
  isPermissionAction,
  type PermissionAction,
} from './permission-action.js';
export type {
  PermissionDecisionInput,
  PermissionRecord,
  PermissionRequest,
  PolicyEvaluation,
  VestaraPermissionDecision,
} from './permission-request.js';
export type {
  ApprovalScope,
  PermissionRisk,
  PermissionStatus,
} from './permission-status.js';
export type { PolicyDecision } from './policy-decision.js';
