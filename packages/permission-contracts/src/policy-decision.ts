/**
 * Canonical policy decision vocabulary.
 *
 * The three-valued policy decision used by Vestara's authorization layer.
 * This is the output of policy evaluation, NOT the runtime enforcement.
 */

/**
 * Policy decision for a permission request.
 *
 * 'allow' — auto-approve, no user interaction required
 * 'ask'   — surface to user for interactive decision
 * 'deny'  — auto-reject, no user interaction
 */
export type PolicyDecision = 'allow' | 'ask' | 'deny';
