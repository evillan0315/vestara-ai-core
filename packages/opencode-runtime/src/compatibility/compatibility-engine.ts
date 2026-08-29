// OpenCode contract compatibility engine — renderer-free.
//
// Detects structural drift between a pinned OpenCode OpenAPI document and a
// candidate (live or fetched) document, classifies each change by severity,
// and emits verifier-readable compatibility evidence. No network or renderer
// dependency: the diff engine operates on plain JSON.

export type OpenCodeContractChangeSeverity = 'informational' | 'compatible' | 'potentially-breaking' | 'breaking';

export type OpenCodeContractChangeKind =
  | 'endpoint-removed'
  | 'endpoint-added'
  | 'method-removed'
  | 'method-added'
  | 'request-required-property-added'
  | 'response-required-property-removed'
  | 'property-type-changed'
  | 'property-removed'
  | 'property-added-optional'
  | 'property-added-required'
  | 'enum-value-added'
  | 'enum-value-removed'
  | 'response-content-type-changed'
  | 'sse-endpoint-removed'
  | 'schema-removed'
  | 'schema-added'
  | 'response-status-removed';

export interface OpenCodeContractChange {
  readonly severity: OpenCodeContractChangeSeverity;
  readonly kind: OpenCodeContractChangeKind;
  readonly path: string;
  readonly summary: string;
}

export interface OpenCodeCompatibilityResult {
  readonly compatible: boolean;
  readonly breakingChanges: readonly OpenCodeContractChange[];
  readonly potentiallyBreaking: readonly OpenCodeContractChange[];
  readonly warnings: readonly OpenCodeContractChange[];
  readonly informational: readonly OpenCodeContractChange[];
  readonly changeCount: number;
  readonly pinnedSchemaChecksum: string;
  readonly candidateSchemaChecksum: string;
  readonly checksumMatches: boolean;
  readonly openCodeVersion?: string;
  readonly checkedAt: string;
}

// ─── Deterministic normalization + hashing ─────────────────────

/** Recursively sort object keys and normalize arrays for deterministic hashing. */
export function canonicalizeOpenApi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeOpenApi);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalizeOpenApi(record[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Normalize an OpenAPI document before hashing: strip volatile metadata that
 * does not affect the contract surface (descriptions, examples, server URLs,
 * operation ids, summary, tags order), then canonicalize.
 */
export function normalizeOpenApiDocument(document: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  stripVolatile(clone, 'info', ['title', 'version', 'description']);
  delete clone.servers;
  delete clone['x-generated-at'];
  delete clone['x-server'];
  stripPathsVolatile(clone.paths as Record<string, unknown> | undefined);
  return canonicalizeOpenApi(clone) as Record<string, unknown>;
}

function stripVolatile(root: Record<string, unknown>, key: string, keep: readonly string[]): void {
  const value = root[key];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    for (const k of keep) if (k in record) kept[k] = record[k];
    root[key] = kept;
  }
}

function stripPathsVolatile(paths: Record<string, unknown> | undefined): void {
  if (!paths) return;
  for (const pathKey of Object.keys(paths)) {
    const item = paths[pathKey];
    if (!item || typeof item !== 'object') continue;
    const operations = item as Record<string, unknown>;
    for (const method of Object.keys(operations)) {
      if (method === 'parameters') continue;
      const op = operations[method];
      if (!op || typeof op !== 'object') continue;
      const opRecord = op as Record<string, unknown>;
      delete opRecord.summary;
      delete opRecord.description;
      delete opRecord.operationId;
      delete opRecord.tags;
      delete opRecord['x-'];
      const responses = opRecord.responses;
      if (responses && typeof responses === 'object') {
        for (const statusKey of Object.keys(responses as Record<string, unknown>)) {
          const resp = (responses as Record<string, unknown>)[statusKey];
          if (resp && typeof resp === 'object') {
            const respRecord = resp as Record<string, unknown>;
            delete respRecord.description;
            const content = respRecord.content;
            if (content && typeof content === 'object') {
              for (const media of Object.keys(content as Record<string, unknown>)) {
                const mediaRecord = (content as Record<string, unknown>)[media];
                if (mediaRecord && typeof mediaRecord === 'object') {
                  delete (mediaRecord as Record<string, unknown>).examples;
                  delete (mediaRecord as Record<string, unknown>).example;
                }
              }
            }
          }
        }
      }
      const requestBody = opRecord.requestBody;
      if (requestBody && typeof requestBody === 'object') {
        const rb = requestBody as Record<string, unknown>;
        delete rb.description;
        const content = rb.content;
        if (content && typeof content === 'object') {
          for (const media of Object.keys(content as Record<string, unknown>)) {
            const mediaRecord = (content as Record<string, unknown>)[media];
            if (mediaRecord && typeof mediaRecord === 'object') {
              delete (mediaRecord as Record<string, unknown>).examples;
              delete (mediaRecord as Record<string, unknown>).example;
            }
          }
        }
      }
    }
  }
}

// ─── Diff engine ───────────────────────────────────────────────

export interface OpenCodeDocumentPair {
  readonly pinned: Record<string, unknown>;
  readonly candidate: Record<string, unknown>;
}

/** Compare two normalized OpenAPI documents and classify every change. */
export function diffOpenApiDocuments(pair: OpenCodeDocumentPair): readonly OpenCodeContractChange[] {
  const changes: OpenCodeContractChange[] = [];
  const pinnedPaths = (pair.pinned.paths ?? {}) as Record<string, unknown>;
  const candidatePaths = (pair.candidate.paths ?? {}) as Record<string, unknown>;
  const pinnedSchemas = ((pair.pinned.components as Record<string, unknown> | undefined)?.schemas ?? {}) as Record<
    string,
    unknown
  >;
  const candidateSchemas = ((pair.candidate.components as Record<string, unknown> | undefined)?.schemas ??
    {}) as Record<string, unknown>;

  for (const path of Object.keys(pinnedPaths)) {
    if (!(path in candidatePaths)) {
      const sse = path.includes('event') || path.includes('stream');
      changes.push({
        severity: 'breaking',
        kind: sse ? 'sse-endpoint-removed' : 'endpoint-removed',
        path,
        summary: `Endpoint removed${sse ? ' (SSE)' : ''}: ${path}`,
      });
      continue;
    }
    const pinnedOps = pinnedPaths[path] as Record<string, unknown>;
    const candidateOps = candidatePaths[path] as Record<string, unknown>;
    for (const method of Object.keys(pinnedOps)) {
      if (method === 'parameters') continue;
      if (!(method in candidateOps)) {
        changes.push({
          severity: 'breaking',
          kind: 'method-removed',
          path: `${method.toUpperCase()} ${path}`,
          summary: `HTTP method removed: ${method.toUpperCase()} ${path}`,
        });
      }
    }
  }

  for (const path of Object.keys(candidatePaths)) {
    if (!(path in pinnedPaths)) {
      changes.push({
        severity: 'compatible',
        kind: 'endpoint-added',
        path,
        summary: `Endpoint added: ${path}`,
      });
    }
  }

  for (const schemaName of Object.keys(pinnedSchemas)) {
    if (!(schemaName in candidateSchemas)) {
      changes.push({
        severity: 'breaking',
        kind: 'schema-removed',
        path: `components.schemas.${schemaName}`,
        summary: `Schema removed: ${schemaName}`,
      });
      continue;
    }
    diffSchema(
      schemaName,
      pinnedSchemas[schemaName] as Record<string, unknown>,
      candidateSchemas[schemaName] as Record<string, unknown>,
      `components.schemas.${schemaName}`,
      changes,
    );
  }

  for (const schemaName of Object.keys(candidateSchemas)) {
    if (!(schemaName in pinnedSchemas)) {
      changes.push({
        severity: 'compatible',
        kind: 'schema-added',
        path: `components.schemas.${schemaName}`,
        summary: `Schema added: ${schemaName}`,
      });
    }
  }

  return changes;
}

function diffSchema(
  name: string,
  pinned: Record<string, unknown>,
  candidate: Record<string, unknown>,
  path: string,
  changes: OpenCodeContractChange[],
): void {
  const pinnedType = stringifyType(pinned.type);
  const candidateType = stringifyType(candidate.type);
  if (pinnedType && candidateType && pinnedType !== candidateType) {
    changes.push({
      severity: 'breaking',
      kind: 'property-type-changed',
      path,
      summary: `Type changed: ${path} ${pinnedType} → ${candidateType}`,
    });
    return;
  }

  const pinnedEnum = Array.isArray(pinned.enum) ? pinned.enum : undefined;
  const candidateEnum = Array.isArray(candidate.enum) ? candidate.enum : undefined;
  if (pinnedEnum && candidateEnum) {
    const pinnedSet = new Set(pinnedEnum.map(String));
    const candidateSet = new Set(candidateEnum.map(String));
    for (const value of candidateEnum) {
      if (!pinnedSet.has(String(value))) {
        changes.push({
          severity: 'compatible',
          kind: 'enum-value-added',
          path,
          summary: `Enum value added: ${path} +${String(value)}`,
        });
      }
    }
    for (const value of pinnedEnum) {
      if (!candidateSet.has(String(value))) {
        changes.push({
          severity: 'breaking',
          kind: 'enum-value-removed',
          path,
          summary: `Enum value removed: ${path} -${String(value)}`,
        });
      }
    }
  }

  const pinnedRequired = Array.isArray(pinned.required) ? pinned.required.map(String) : [];
  const candidateRequired = Array.isArray(candidate.required) ? candidate.required.map(String) : [];
  const pinnedProps = (pinned.properties ?? {}) as Record<string, unknown>;
  const candidateProps = (candidate.properties ?? {}) as Record<string, unknown>;

  for (const propName of Object.keys(pinnedProps)) {
    if (!(propName in candidateProps)) {
      changes.push({
        severity: 'breaking',
        kind: 'property-removed',
        path: `${path}.${propName}`,
        summary: `Property removed: ${path}.${propName}`,
      });
      continue;
    }
    const pinnedProp = pinnedProps[propName] as Record<string, unknown>;
    const candidateProp = candidateProps[propName] as Record<string, unknown>;
    if (candidateProp && typeof candidateProp === 'object') {
      diffSchema(name, pinnedProp, candidateProp, `${path}.${propName}`, changes);
    }
  }

  for (const propName of Object.keys(candidateProps)) {
    if (!(propName in pinnedProps)) {
      const required = candidateRequired.includes(propName);
      changes.push({
        severity: required ? 'potentially-breaking' : 'compatible',
        kind: required ? 'property-added-required' : 'property-added-optional',
        path: `${path}.${propName}`,
        summary: `Property added${required ? ' (required)' : ''}: ${path}.${propName}`,
      });
      continue;
    }
    const requiredNow = candidateRequired.includes(propName);
    const wasRequired = pinnedRequired.includes(propName);
    if (requiredNow && !wasRequired) {
      changes.push({
        severity: 'potentially-breaking',
        kind: 'response-required-property-removed',
        path: `${path}.${propName}`,
        summary: `Property became required: ${path}.${propName}`,
      });
    }
  }
}

function stringifyType(type: unknown): string | undefined {
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return type.join('|');
  return undefined;
}

// ─── Classification + result assembly ──────────────────────────

export function classifyOpenApiDiff(changes: readonly OpenCodeContractChange[]): {
  breaking: OpenCodeContractChange[];
  potentiallyBreaking: OpenCodeContractChange[];
  warnings: OpenCodeContractChange[];
  informational: OpenCodeContractChange[];
} {
  return {
    breaking: changes.filter((c) => c.severity === 'breaking'),
    potentiallyBreaking: changes.filter((c) => c.severity === 'potentially-breaking'),
    warnings: changes.filter((c) => c.severity === 'compatible'),
    informational: changes.filter((c) => c.severity === 'informational'),
  };
}

/** Hash a normalized document deterministically (FIPS-safe sha256). */
export async function hashNormalizedDocument(document: Record<string, unknown>): Promise<string> {
  const { createHash } = await import('node:crypto');
  const serialized = JSON.stringify(document);
  return createHash('sha256').update(serialized).digest('hex');
}

export interface CheckCompatibilityInput {
  readonly pinned: Record<string, unknown>;
  readonly candidate: Record<string, unknown>;
  readonly openCodeVersion?: string;
}

/** Run the full compatibility check: normalize → hash → diff → classify. */
export async function checkOpenApiCompatibility(input: CheckCompatibilityInput): Promise<OpenCodeCompatibilityResult> {
  const pinnedNormalized = normalizeOpenApiDocument(input.pinned);
  const candidateNormalized = normalizeOpenApiDocument(input.candidate);
  const pinnedChecksum = await hashNormalizedDocument(pinnedNormalized);
  const candidateChecksum = await hashNormalizedDocument(candidateNormalized);
  const changes = diffOpenApiDocuments({ pinned: pinnedNormalized, candidate: candidateNormalized });
  const { breaking, potentiallyBreaking, warnings, informational } = classifyOpenApiDiff(changes);
  return {
    compatible: breaking.length === 0,
    breakingChanges: breaking,
    potentiallyBreaking,
    warnings,
    informational,
    changeCount: changes.length,
    pinnedSchemaChecksum: pinnedChecksum,
    candidateSchemaChecksum: candidateChecksum,
    checksumMatches: pinnedChecksum === candidateChecksum,
    openCodeVersion: input.openCodeVersion,
    checkedAt: new Date().toISOString(),
  };
}

/** Enum compatibility — generated unions must tolerate upstream additions. */
export function knownOpenCodeEnum<T extends string>(value: string, known: readonly T[]): T | `unknown:${string}` {
  const found = (known as readonly string[]).find((candidate) => candidate === value);
  return found !== undefined ? (value as T) : (`unknown:${value}` as `unknown:${string}`);
}
