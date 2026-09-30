/**
 * Governed human-readable representation for a canonical HumanPrincipal.
 *
 * Separate from HumanPrincipal: changing a preferred name never changes
 * identity, authentication, authorization, or membership.
 */
export type HumanIdentityRepresentationStatus = 'active' | 'unavailable';

export interface HumanIdentityRepresentation {
  readonly principalId: string;
  readonly preferredName: string;
  readonly status: HumanIdentityRepresentationStatus;
  /** Explicitly governed input; never provider-derived or inferred. */
  readonly source: 'explicit';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HumanIdentityRepresentationInput {
  preferredName: string;
  status?: HumanIdentityRepresentationStatus;
}
