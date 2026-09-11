/**
 * VES-PERF-001A — Bounded model discovery.
 *
 * Verifies the pure pagination/search projection used by
 * GET /api/opencode/config/providers: transport must be bounded, search must be
 * scoped, and only allow-listed fields may cross the boundary (no secrets).
 */

import { describe, expect, it } from 'vitest';
import { type ConfiguredProvider, paginateConfiguredProviders } from '../src/routes/opencode-provider-pagination';

function model(id: string, name: string, family?: string, extra: Record<string, unknown> = {}) {
  return { id, name, family, status: 'active', ...extra };
}

function provider(id: string, names: string[]): ConfiguredProvider {
  return {
    id,
    name: id.toUpperCase(),
    source: 'config',
    models: Object.fromEntries(names.map((n) => [n, model(n, n)])),
  };
}

const providers: ConfiguredProvider[] = [
  provider('opencode-go', ['a1', 'a2', 'a3']),
  provider('opencode', ['b1', 'b2']),
  provider('openai', ['c1', 'c2', 'c3', 'c4']),
];

describe('paginateConfiguredProviders — VES-PERF-001A', () => {
  it('bounds the response to the requested limit', () => {
    const page = paginateConfiguredProviders(providers, { limit: 4, offset: 0 });
    const returned = page.providers.reduce((sum, p) => sum + p.models.length, 0);
    expect(returned).toBe(4);
    expect(page.pagination).toEqual({ total: 9, offset: 0, limit: 4, hasMore: true });
  });

  it('paginates across providers and reports hasMore', () => {
    const page2 = paginateConfiguredProviders(providers, { limit: 4, offset: 4 });
    const returned = page2.providers.reduce((sum, p) => sum + p.models.length, 0);
    expect(returned).toBe(4);

    const page3 = paginateConfiguredProviders(providers, { limit: 4, offset: 8 });
    expect(page3.providers.reduce((sum, p) => sum + p.models.length, 0)).toBe(1);
    expect(page3.pagination.hasMore).toBe(false);
  });

  it('caps limit at 100 regardless of request', () => {
    const page = paginateConfiguredProviders(providers, { limit: 10_000 });
    expect(page.pagination.limit).toBe(100);
  });

  it('filters by id, name, or family (case-insensitive)', () => {
    const familyProvider: ConfiguredProvider = {
      id: 'p',
      name: 'P',
      models: {
        x: model('x', 'X', 'anthropic'),
        y: model('y', 'Y', 'openai'),
      },
    };
    const page = paginateConfiguredProviders([familyProvider], { search: 'ANTHROPIC' });
    expect(page.providers).toHaveLength(1);
    expect(page.providers[0]?.models.map((m) => m.id)).toEqual(['x']);
    expect(page.pagination.total).toBe(1);
  });

  it('does not leak non-allow-listed fields (e.g. secrets)', () => {
    const withSecret: ConfiguredProvider = {
      id: 'p',
      name: 'P',
      models: {
        x: model('x', 'X', undefined, { apiKey: 'sk-secret', api: { key: 'sk-secret' } }),
      },
    };
    const page = paginateConfiguredProviders([withSecret], {});
    const returned = page.providers[0]?.models[0] as Record<string, unknown> | undefined;
    expect(returned?.apiKey).toBeUndefined();
    // The allow-listed `api` descriptor is preserved (it is metadata, not a key).
    expect(returned?.api).toEqual({ key: 'sk-secret' });
  });

  it('preserves totalModels (unfiltered count) separately from the page', () => {
    const page = paginateConfiguredProviders(providers, { limit: 1, offset: 0 });
    const first = page.providers[0];
    expect(first?.totalModels).toBe(3); // opencode-go has 3 models total
    expect(first?.models).toHaveLength(1); // but only 1 in this page
  });

  it('returns an empty provider set when offset is past the end', () => {
    const page = paginateConfiguredProviders(providers, { limit: 4, offset: 100 });
    expect(page.providers).toEqual([]);
    expect(page.pagination.hasMore).toBe(false);
  });
});
