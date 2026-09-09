/**
 * Canonical permission risk and status vocabulary.
 *
 * Runtime-neutral: describes the risk level and lifecycle status of a
 * permission request without encoding OpenCode-specific event semantics.
 */

/**
 * Risk classification for a permission request.
 *
 * Used by policy engines to determine the default decision.
 */
export type PermissionRisk = 'safe' | 'sensitive' | 'dangerous';

/**
 * Lifecycle status of a permission request.
 */
export type PermissionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/**
 * Scope of a permission approval.
 *
 * 'once'  — single use, next request requires re-approval
 * 'session' — persists for the duration of the runtime session
 */
export type ApprovalScope = 'once' | 'session';
