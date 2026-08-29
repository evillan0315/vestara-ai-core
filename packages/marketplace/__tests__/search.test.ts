import { afterAll, describe, expect, it } from 'vitest';
import type { MarketplaceAsset } from '../src/index.js';
import { applyFilters, searchAssets } from '../src/index.js';
import { cleanup } from './helpers.js';

afterAll(cleanup);

const now = '2026-08-02T00:00:00.000Z';

function asset(seed: Partial<MarketplaceAsset> & { packageName: string }): MarketplaceAsset {
  return {
    id: `vestara/${seed.packageName}`,
    slug: seed.packageName,
    publisherId: 'vestara',
    packageName: seed.packageName,
    displayName: seed.displayName ?? seed.packageName,
    summary: seed.summary ?? `Summary for ${seed.packageName}`,
    description: seed.description,
    type: seed.type ?? 'plugin',
    tags: seed.tags ?? [],
    visibility: seed.visibility ?? 'local',
    latestVersion: seed.latestVersion ?? '1.0.0',
    versions: seed.versions ?? [],
    verification: seed.verification ?? {
      signed: false,
      signatureValidated: false,
      checksumVerified: true,
      runtimeVerified: false,
    },
    createdAt: seed.createdAt ?? now,
    updatedAt: seed.updatedAt ?? now,
  };
}

describe('search and filters', () => {
  const assets = [
    asset({
      packageName: 'repo-analyzer',
      type: 'agent-pack',
      summary: 'Analyzes repositories',
      tags: ['ai', 'analysis'],
      verification: { signed: true, signatureValidated: true, checksumVerified: true, runtimeVerified: true },
    }),
    asset({
      packageName: 'shell-tools',
      type: 'plugin',
      summary: 'Shell utilities',
      tags: ['shell', 'devops'],
      verification: { signed: false, signatureValidated: false, checksumVerified: true, runtimeVerified: true },
    }),
    asset({ packageName: 'mcp-github', type: 'integration', summary: 'GitHub MCP server', tags: ['mcp', 'github'] }),
  ];

  it('ranks exact name matches above partial description matches', () => {
    const hits = searchAssets(assets, { query: 'repo-analyzer' });
    expect(hits[0]?.asset.packageName).toBe('repo-analyzer');
    expect(hits[0]?.matchedFields).toContain('packageName');
  });

  it('matches across summary, tags, and publisher fields', () => {
    const byTag = searchAssets(assets, { query: 'mcp' });
    expect(byTag.map((hit) => hit.asset.packageName)).toEqual(['mcp-github']);
    const bySummary = searchAssets(assets, { query: 'analyzes' });
    expect(bySummary[0]?.asset.packageName).toBe('repo-analyzer');
  });

  it('applies type, publisher, tag, and verification filters', () => {
    expect(applyFilters(assets, { types: ['plugin'] }).map((a) => a.packageName)).toEqual(['shell-tools']);
    expect(applyFilters(assets, { publisherIds: ['vestara'] })).toHaveLength(3);
    expect(applyFilters(assets, { tags: ['shell'] }).map((a) => a.packageName)).toEqual(['shell-tools']);
    expect(applyFilters(assets, { verification: 'signed' }).map((a) => a.packageName)).toEqual(['repo-analyzer']);
    expect(applyFilters(assets, { verification: 'checksum-verified' })).toHaveLength(3);
  });

  it('filters out assets incompatible with the runtime context', () => {
    const futureOnly = asset({
      packageName: 'future-only',
      versions: [
        {
          version: '2.0.0',
          isStable: true,
          compatibility: { vestara: '>=10.0.0' },
          checksumVerified: true,
        },
      ],
    });
    const results = searchAssets([...assets, futureOnly], {
      query: '',
      compatibleWith: { vestaraVersion: '9.0.0', operatingSystem: 'linux', architecture: 'x64' },
    });
    expect(results.map((hit) => hit.asset.packageName)).not.toContain('future-only');
    expect(results).toHaveLength(assets.length);
  });

  it('is deterministic: equal scores sort by package name', () => {
    const hits = searchAssets(assets, { query: '', sort: 'name', sortDirection: 'asc' });
    expect(hits.map((hit) => hit.asset.packageName)).toEqual(['mcp-github', 'repo-analyzer', 'shell-tools']);
  });

  it('aggregates categories by type', () => {
    const counts = new Map<string, number>();
    for (const item of assets) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    expect(counts.get('agent-pack')).toBe(1);
    expect(counts.get('plugin')).toBe(1);
    expect(counts.get('integration')).toBe(1);
  });
});
