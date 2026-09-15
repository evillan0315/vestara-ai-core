/**
 * CI-OBS-001B — CI identity types.
 *
 * Provider-neutral identities for correlating CI verification with
 * repository, commit, workflow run, job, check, and attempt.
 *
 * These are NOT the same as repository-contracts identities. The adapter
 * layer resolves between CI identities and repository identities. Holding
 * this boundary prevents CI domain concerns from polluting repository
 * identity and vice versa.
 *
 * Invariant: A bare string comparison across identity kinds must never
 * succeed — identities are branded at the type level.
 */

declare const brand: unique symbol;
type Opaque<T, B> = T & { readonly [brand]: B };

/** Workflow run identity — one run of a CI pipeline. */
export type CIRunId = Opaque<string, 'CIRunId'>;

/** Job identity — one unit of work within a CI run. */
export type CIJobId = Opaque<string, 'CIJobId'>;

/** Check identity — one status check (test suite, build, lint, etc.). */
export type CICheckId = Opaque<string, 'CICheckId'>;

/** Attempt number — monotonic, 1-based. Distinguishes reruns. */
export type CIAttempt = Opaque<number, 'CIAttempt'>;

/**
 * Commit identity — provider-neutral, VCS-agnostic.
 *
 * A CICommitId is an opaque string that uniquely identifies a commit
 * within a repository. The canonical contract does NOT assume SHA-1,
 * SHA-256, or any specific hash algorithm. The adapter layer validates
 * format according to the provider's native requirements (e.g. GitHub
 * requires 40-hex SHA-1; other providers may use different formats).
 *
 * Keeping this structurally unconstrained at the contract level prevents
 * the canonical domain from encoding VCS-specific assumptions.
 */
export type CICommitId = string;

/**
 * @deprecated Use CICommitId instead. Retained for transition period.
 * The adapter layer resolves CISha to CICommitId.
 */
export type CISha = CICommitId;

/**
 * Repository reference for CI context.
 *
 * Minimal — carries only what CI observation needs. Not a full
 * RepositoryIdentity. The adapter resolves this to repository-contracts
 * when appropriate.
 */
export interface CIRepositoryRef {
  /** Owner/name or equivalent provider-neutral identifier. */
  readonly owner: string;
  /** Repository name. */
  readonly name: string;
  /** Provider identifier (e.g. 'github', 'gitlab'). Informational only. */
  readonly provider?: string;
}

/** Construct a CIRepositoryRef. Pure. */
export function makeCIRepositoryRef(owner: string, name: string, provider?: string): CIRepositoryRef {
  return { owner, name, provider };
}

/** Valid CIRunId is non-empty. Pure. */
export function isValidCIRunId(id: unknown): id is CIRunId {
  return typeof id === 'string' && id.length > 0;
}

/** Valid CIJobId is non-empty. Pure. */
export function isValidCIJobId(id: unknown): id is CIJobId {
  return typeof id === 'string' && id.length > 0;
}

/** Valid CICheckId is non-empty. Pure. */
export function isValidCICheckId(id: unknown): id is CICheckId {
  return typeof id === 'string' && id.length > 0;
}

/**
 * Valid CICommitId is a non-empty string.
 *
 * The canonical contract does NOT enforce SHA-1 length or hex format —
 * that is the adapter's responsibility. A non-empty string is the
 * minimum structural requirement for a commit identity.
 */
export function isValidCICommitId(id: unknown): id is CICommitId {
  return typeof id === 'string' && id.length > 0;
}

/**
 * @deprecated Use isValidCICommitId instead. Retained for transition.
 * Accepts any non-empty string (same as isValidCICommitId).
 */
export function isValidCISha(sha: unknown): sha is CISha {
  return isValidCICommitId(sha);
}

/** Valid CIAttempt is a positive integer. Pure. */
export function isValidCIAttempt(attempt: unknown): attempt is CIAttempt {
  return typeof attempt === 'number' && Number.isInteger(attempt) && attempt >= 1;
}

/** Valid CIRepositoryRef has non-empty owner and name. Pure. */
export function isValidCIRepositoryRef(ref: unknown): ref is CIRepositoryRef {
  if (!ref || typeof ref !== 'object') return false;
  const r = ref as Record<string, unknown>;
  return typeof r.owner === 'string' && r.owner.length > 0 && typeof r.name === 'string' && r.name.length > 0;
}
