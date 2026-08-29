import { describe, expect, it } from 'vitest';
import {
  canonicalizeOpenApi,
  checkOpenApiCompatibility,
  diffOpenApiDocuments,
  hashNormalizedDocument,
  knownOpenCodeEnum,
  normalizeOpenApiDocument,
} from '../src/compatibility/compatibility-engine';
import {
  contractEventType,
  renderCompatibilityEvidence,
  toCompatibilityEvidence,
} from '../src/compatibility/compatibility-evidence';

const baseSchema = {
  openapi: '3.1.0',
  info: { title: 'opencode', version: '1.0.0', description: 'opencode api' },
  paths: {
    '/session/{sessionID}/message': {
      get: {
        responses: {
          200: {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Message' } } },
          },
        },
      },
      post: { responses: { 204: { description: 'ok' } } },
    },
    '/event': { get: { responses: { 200: { description: 'sse' } } } },
  },
  components: {
    schemas: {
      Message: {
        type: 'object',
        required: ['id', 'text'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          status: { type: 'string', enum: ['active', 'idle'] },
        },
      },
    },
  },
};

describe('canonicalizeOpenApi', () => {
  it('sorts keys recursively for deterministic output', () => {
    const a = canonicalizeOpenApi({ b: 1, a: { y: 2, x: 1 } });
    const b = canonicalizeOpenApi({ a: { x: 1, y: 2 }, b: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('normalizeOpenApiDocument', () => {
  it('strips volatile metadata and canonicalizes', async () => {
    const doc = JSON.parse(JSON.stringify(baseSchema));
    (doc as Record<string, unknown>).servers = [{ url: 'http://localhost' }];
    const normalized = normalizeOpenApiDocument(doc);
    expect(normalized.servers).toBeUndefined();
    const c1 = await hashNormalizedDocument(normalized);
    // re-order keys, change a description — hash must stay stable
    const reordered = JSON.parse(JSON.stringify(baseSchema));
    (reordered.paths['/session/{sessionID}/message'].get as Record<string, unknown>).operationId = 'op-1';
    const normalized2 = normalizeOpenApiDocument(reordered);
    const c2 = await hashNormalizedDocument(normalized2);
    expect(c1).toBe(c2);
  });
});

describe('diffOpenApiDocuments', () => {
  it('detects removed endpoints as breaking', () => {
    const candidate = JSON.parse(JSON.stringify(baseSchema));
    delete (candidate as Record<string, unknown>).paths['/event'];
    const changes = diffOpenApiDocuments({ pinned: baseSchema, candidate });
    const removed = changes.find((c) => c.kind === 'sse-endpoint-removed');
    expect(removed).toBeDefined();
    expect(removed?.severity).toBe('breaking');
  });

  it('detects removed HTTP methods as breaking', () => {
    const candidate = JSON.parse(JSON.stringify(baseSchema));
    delete (candidate as Record<string, unknown>).paths['/session/{sessionID}/message'].post;
    const changes = diffOpenApiDocuments({ pinned: baseSchema, candidate });
    expect(changes.some((c) => c.kind === 'method-removed' && c.severity === 'breaking')).toBe(true);
  });

  it('detects required property addition as potentially breaking', () => {
    const candidate = JSON.parse(JSON.stringify(baseSchema));
    (candidate as Record<string, unknown>).components.schemas.Message.properties.extra = { type: 'string' };
    (candidate as Record<string, unknown>).components.schemas.Message.required.push('extra');
    const changes = diffOpenApiDocuments({ pinned: baseSchema, candidate });
    expect(changes.some((c) => c.kind === 'property-added-required')).toBe(true);
  });

  it('detects optional property addition as compatible', () => {
    const candidate = JSON.parse(JSON.stringify(baseSchema));
    (candidate as Record<string, unknown>).components.schemas.Message.properties.extra = { type: 'string' };
    const changes = diffOpenApiDocuments({ pinned: baseSchema, candidate });
    expect(changes.some((c) => c.kind === 'property-added-optional' && c.severity === 'compatible')).toBe(true);
  });

  it('detects type changes and enum removals as breaking, enum additions compatible', () => {
    const candidate = JSON.parse(JSON.stringify(baseSchema));
    (candidate as Record<string, unknown>).components.schemas.Message.properties.id.type = 'integer';
    (candidate as Record<string, unknown>).components.schemas.Message.properties.status.enum = [
      'active',
      'idle',
      'busy',
    ];
    const changes = diffOpenApiDocuments({ pinned: baseSchema, candidate });
    expect(changes.some((c) => c.kind === 'property-type-changed' && c.severity === 'breaking')).toBe(true);
    expect(changes.some((c) => c.kind === 'enum-value-added' && c.severity === 'compatible')).toBe(true);

    const candidate2 = JSON.parse(JSON.stringify(baseSchema));
    (candidate2 as Record<string, unknown>).components.schemas.Message.properties.status.enum = ['active'];
    const changes2 = diffOpenApiDocuments({ pinned: baseSchema, candidate: candidate2 });
    expect(changes2.some((c) => c.kind === 'enum-value-removed' && c.severity === 'breaking')).toBe(true);
  });

  it('detects removed required response field as breaking', () => {
    const candidate = JSON.parse(JSON.stringify(baseSchema));
    delete (candidate as Record<string, unknown>).components.schemas.Message.properties.id;
    const changes = diffOpenApiDocuments({ pinned: baseSchema, candidate });
    expect(changes.some((c) => c.kind === 'property-removed' && c.severity === 'breaking')).toBe(true);
  });

  it('handles malformed or missing path/schema sections', () => {
    const changes = diffOpenApiDocuments({ pinned: {}, candidate: {} });
    expect(changes).toEqual([]);
  });
});

describe('checkOpenApiCompatibility', () => {
  it('reports compatible when identical', async () => {
    const result = await checkOpenApiCompatibility({ pinned: baseSchema, candidate: baseSchema });
    expect(result.compatible).toBe(true);
    expect(result.checksumMatches).toBe(true);
    expect(result.breakingChanges).toEqual([]);
  });

  it('fails compatibility on breaking changes but not additive ones', async () => {
    const breakingCandidate = JSON.parse(JSON.stringify(baseSchema));
    delete (breakingCandidate as Record<string, unknown>).paths['/event'];
    const breaking = await checkOpenApiCompatibility({ pinned: baseSchema, candidate: breakingCandidate });
    expect(breaking.compatible).toBe(false);
    expect(breaking.breakingChanges.length).toBeGreaterThan(0);

    const additiveCandidate = JSON.parse(JSON.stringify(baseSchema));
    (additiveCandidate as Record<string, unknown>).components.schemas.Message.properties.extra = { type: 'string' };
    const additive = await checkOpenApiCompatibility({ pinned: baseSchema, candidate: additiveCandidate });
    expect(additive.compatible).toBe(true);
    expect(additive.warnings.length).toBeGreaterThan(0);
  });

  it('records openCodeVersion and checkedAt', async () => {
    const result = await checkOpenApiCompatibility({
      pinned: baseSchema,
      candidate: baseSchema,
      openCodeVersion: '1.18.8',
    });
    expect(result.openCodeVersion).toBe('1.18.8');
    expect(result.checkedAt).toBeTruthy();
  });
});

describe('compatibility evidence', () => {
  it('derives contract event type from result', async () => {
    const ok = await checkOpenApiCompatibility({ pinned: baseSchema, candidate: baseSchema });
    expect(contractEventType(ok)).toBe('opencode.contract.compatible');
    const breakingCandidate = JSON.parse(JSON.stringify(baseSchema));
    delete (breakingCandidate as Record<string, unknown>).paths['/event'];
    const breaking = await checkOpenApiCompatibility({ pinned: baseSchema, candidate: breakingCandidate });
    expect(contractEventType(breaking)).toBe('opencode.contract.breaking-change-detected');
    const driftCandidate = JSON.parse(JSON.stringify(baseSchema));
    (driftCandidate as Record<string, unknown>).info.description = 'changed';
    const drift = await checkOpenApiCompatibility({ pinned: baseSchema, candidate: driftCandidate });
    // description stripped by normalizer → identical hash → compatible
    expect(drift.compatible).toBe(true);
  });

  it('renders a verifier-readable report', async () => {
    const result = await checkOpenApiCompatibility({
      pinned: baseSchema,
      candidate: baseSchema,
      openCodeVersion: '1.18.8',
    });
    const evidence = toCompatibilityEvidence(result);
    const rendered = renderCompatibilityEvidence(evidence);
    expect(rendered).toContain('COMPATIBLE');
    expect(rendered).toContain('sha256:');
    expect(rendered).toContain('1.18.8');
  });
});

describe('knownOpenCodeEnum', () => {
  it('tolerates additive enum values via unknown escape', () => {
    const status = knownOpenCodeEnum('busy', ['idle', 'active']);
    expect(status).toBe('unknown:busy');
    const known = knownOpenCodeEnum('active', ['idle', 'active']);
    expect(known).toBe('active');
  });
});
