/**
 * VES-REPO-002 — Identity separation (REPO-INV-002).
 *
 * Seven identity kinds that must never be collapsed:
 *   RepositoryId ≠ WorkflowRunId ≠ ExecutionId ≠ RuntimeSessionId
 *   ≠ OperationId ≠ ChangeSetId ≠ SnapshotId
 *
 * Brands are compile-time distinct. The runtime-tagged {@link IdentityRef}
 * carries the same separation into runtime code (kind-tagged, never a bare
 * string comparison). A filesystem path is never an identity — see
 * {@link RepositoryIdentity}: the path-like `root` is an opaque locator,
 * while `repositoryId` is the durable identity.
 */

/** Opaque brand helper — distinct nominal types over string. */
declare const brand: unique symbol;
export type Opaque<T extends string, B> = T & { readonly [brand]: B };

export type RepositoryId = Opaque<string, 'RepositoryId'>;
export type WorkflowRunId = Opaque<string, 'WorkflowRunId'>;
export type ExecutionId = Opaque<string, 'ExecutionId'>;
export type RuntimeSessionId = Opaque<string, 'RuntimeSessionId'>;
export type OperationId = Opaque<string, 'OperationId'>;
export type ChangeSetId = Opaque<string, 'ChangeSetId'>;
export type SnapshotId = Opaque<string, 'SnapshotId'>;

/** Closed vocabulary of identity kinds. */
export type IdentityKind =
  | 'repository'
  | 'workflow-run'
  | 'execution'
  | 'runtime-session'
  | 'operation'
  | 'changeset'
  | 'snapshot';

export const IDENTITY_KINDS: readonly IdentityKind[] = [
  'repository',
  'workflow-run',
  'execution',
  'runtime-session',
  'operation',
  'changeset',
  'snapshot',
];

/**
 * Runtime-tagged identity reference. The `kind` tag travels with the `id`
 * so correlation code cannot silently compare across kinds.
 */
export interface IdentityRef {
  readonly kind: IdentityKind;
  readonly id: string;
}

/** Construct a kind-tagged identity reference. Pure — no I/O, no registry. */
export function makeIdentityRef(kind: IdentityKind, id: string): IdentityRef {
  return { kind, id };
}

/** True only when the reference carries the expected kind tag. */
export function isIdentityRefOfKind(ref: IdentityRef, kind: IdentityKind): boolean {
  return ref.kind === kind;
}

/** Opaque repository root locator. A path-shaped string, never the identity. */
export type RepositoryRoot = Opaque<string, 'RepositoryRoot'>;

/** Version-control system. Closed: only git is modeled. */
export type RepositoryVcs = 'git';

/**
 * Canonical repository identity. `repositoryId` is durable; `root` is a
 * locator that may change (moves, mounts) without changing identity.
 */
export interface RepositoryIdentity {
  readonly repositoryId: RepositoryId;
  readonly vcs: RepositoryVcs;
  readonly root: RepositoryRoot;
  readonly remote?: {
    readonly name: string;
    readonly url: string;
  };
}

/** Minimal structural validation — non-empty identity, locator, and VCS. */
export function isValidRepositoryIdentity(value: unknown): value is RepositoryIdentity {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.repositoryId === 'string' &&
    (record.repositoryId as string).length > 0 &&
    record.vcs === 'git' &&
    typeof record.root === 'string' &&
    (record.root as string).length > 0
  );
}
