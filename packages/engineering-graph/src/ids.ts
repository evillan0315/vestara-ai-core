/**
 * Universal entity identifiers.
 *
 * Every engineering object in the Workspace is addressed as `kind://id`.
 * The id portion is raw (readable); callers must URL-encode the full id when
 * embedding it in a query string.
 *
 * Examples:
 *   project://core
 *   plan://P-24
 *   task://P-24:T-15
 *   agent://developer
 *   artifact://changeset/42
 *   file://packages/runtime/src/index.ts
 *   doc://Architecture/Runtime.md
 */

export const ENTITY_KINDS = [
  'project',
  'workspace',
  'repository',
  'package',
  'marketplace-package',
  'package-version',
  'publisher',
  'installed-package',
  'extension',
  'permission',
  'module',
  'folder',
  'file',
  'document',
  'documentation-rule',
  'documentation-standard',
  'documentation-plan',
  'documentation-task',
  'documentation-proposal',
  'documentation-report',
  'specification',
  'blueprint',
  'adr',
  'plan',
  'task',
  'execution',
  'session',
  'timeline',
  'event',
  'artifact',
  'review',
  'verification',
  'approval',
  'agent',
  'worker',
  'capability',
  'filesystem',
  'git-commit',
  'git-branch',
  'docker',
  'kubernetes',
  'api',
  'service',
  'runtime',
  'diagnostic',
  'health',
  'metric',
  'alert',
  'log',
  'memory',
  'prompt',
  'model',
  'provider',
  'conversation',
  'user',
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

/** Build a universal entity id: `kind://id`. */
export function entityId(kind: EntityKind, id: string): string {
  return `${kind}://${id}`;
}

export interface ParsedEntityId {
  kind: EntityKind | null;
  id: string;
}

/** Split a universal entity id into its kind and raw id. */
export function parseEntityId(raw: string): ParsedEntityId {
  const idx = raw.indexOf('://');
  if (idx === -1) return { kind: null, id: raw };
  const kind = raw.slice(0, idx);
  const id = raw.slice(idx + 3);
  return { kind: isEntityKind(kind) ? kind : null, id };
}

export function isValidEntityId(raw: string): boolean {
  const { kind, id } = parseEntityId(raw);
  return kind !== null && id.length > 0;
}

/** Extract the raw id from a universal id (null when malformed). */
export function idOf(raw: string): string | null {
  const { kind, id } = parseEntityId(raw);
  return kind ? id : null;
}

/** URL-safe form of a universal entity id for query strings. */
export function encodeEntityId(raw: string): string {
  return encodeURIComponent(raw);
}
