/**
 * HumanPrincipal — canonical human identity (HUMAN-CONTEXT-002).
 *
 * Identity only. A principal answers "who is this human?" and nothing else.
 *
 * Binding invariants (HUMAN-CONTEXT-001, frozen):
 *   Credential ≠ Principal — a bearer credential BINDS to a principal;
 *     the credential record is never principal authority.
 *   Principal ≠ Membership — workspace membership/roles live elsewhere
 *     and reference the principal; they are never fields on it.
 *   Principal ≠ Profile — biography, skills, preferences, goals, memory
 *     are future HumanProfile subdomains, never principal columns.
 *   Principal ≠ Authority — resolving a principal grants nothing.
 *   Identity ≠ Presentation — displayName/avatar and other presentation
 *     metadata are projection conveniences, never identity authority.
 *     They are not stored on the principal and never round-trip into it.
 *
 * Architecture Traceability:
 *   HUMAN-CONTEXT-001 — Human Profile Authority & Domain Contract Audit (frozen)
 *   UIM-002 — Canonical Human Principal & User Contracts (planned)
 */

export type HumanPrincipalStatus = 'invited' | 'active' | 'suspended' | 'disabled' | 'deleted';

/** Lifecycle order for status transitions (forward-only except reactivation). */
export const HUMAN_PRINCIPAL_STATUSES: readonly HumanPrincipalStatus[] = [
  'invited',
  'active',
  'suspended',
  'disabled',
  'deleted',
];

/**
 * Provider-neutral reference to an external identity bound to a principal.
 * The adapter (Google OIDC, GitHub OAuth, …) lives at the boundary;
 * the core stores only (provider, subject, linkage metadata).
 * Email/username strings are claims, never proof — linkage is explicit.
 */
export interface HumanExternalIdentity {
  provider: string;
  subject: string;
  principalId: string;
  linkedAt: string;
}

export interface HumanPrincipal {
  readonly id: string;
  /** Lifecycle state. The only mutable identity field besides linkage. */
  readonly status: HumanPrincipalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HumanPrincipalInput {
  status?: HumanPrincipalStatus;
}

export interface HumanPrincipalUpdate {
  status: HumanPrincipalStatus;
}

/**
 * Presentation metadata is explicitly NOT identity authority.
 * Constructed by callers for convenience (drawers, headers, greetings);
 * never persisted in principal tables, never read back as identity.
 */
export interface HumanPrincipalPresentation {
  displayName?: string;
  avatar?: string;
}

export interface HumanPrincipalProjection {
  readonly principal: HumanPrincipal;
  readonly presentation: HumanPrincipalPresentation;
  /** External identities attached at projection time (read convenience). */
  readonly externalIdentities: readonly HumanExternalIdentity[];
}

/** Pure convenience constructor. Carries zero authority. */
export function projectHumanPrincipal(
  principal: HumanPrincipal,
  presentation: HumanPrincipalPresentation = {},
  externalIdentities: readonly HumanExternalIdentity[] = [],
): HumanPrincipalProjection {
  return { principal, presentation, externalIdentities };
}

/**
 * Credential → principal binding record.
 * `credentialId` is the opaque credential handle (e.g. `users.id`);
 * secrets/tokens are never stored here. The binding resolves identity;
 * credential role/authority stays with the credential record.
 */
export interface HumanCredentialBinding {
  readonly credentialId: string;
  readonly principalId: string;
  readonly createdAt: string;
}

export function isHumanPrincipalStatus(value: unknown): value is HumanPrincipalStatus {
  return (
    value === 'invited' || value === 'active' || value === 'suspended' || value === 'disabled' || value === 'deleted'
  );
}
