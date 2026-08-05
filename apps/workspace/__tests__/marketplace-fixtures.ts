import type {
  InstalledMarketplaceAsset,
  MarketplaceAsset,
  MarketplaceAssetDetails,
  MarketplaceOperationDto,
  MarketplaceRegistryStatus,
  MarketplaceSearchResult,
  MarketplaceUpdateCandidate,
} from '../src/lib/marketplace.js';

function asset(overrides: Partial<MarketplaceAsset> = {}): MarketplaceAsset {
  return {
    id: 'vestara/vestara.git-helper',
    slug: 'vestara.git-helper',
    publisherId: 'vestara',
    packageName: 'vestara.git-helper',
    displayName: 'Vestara Git Helper',
    summary: 'Governed git workflow commands: staged diffs, atomic commits, and status summaries.',
    type: 'plugin',
    tags: [],
    visibility: 'local',
    latestVersion: '0.4.1',
    versions: [
      {
        version: '0.4.1',
        isStable: true,
        compatibility: { vestara: '>=0.3.0' },
        checksumVerified: true,
      },
    ],
    verification: { signed: false, signatureValidated: false, checksumVerified: true, runtimeVerified: false },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

export const analysisAsset: MarketplaceAsset = asset({
  id: 'vestara/vestara.analysis',
  packageName: 'vestara.analysis',
  displayName: 'Vestara Analysis Pack',
  summary: 'Engineering analysis helpers: complexity, coupling, and dependency reports.',
  type: 'module',
  latestVersion: '1.2.0',
  versions: [{ version: '1.2.0', isStable: true, compatibility: { vestara: '>=0.3.0' }, checksumVerified: true }],
});

export const gitHelperAsset: MarketplaceAsset = asset();

export const reviewStandardsAsset: MarketplaceAsset = asset({
  id: 'vestara/vestara.review-standards',
  packageName: 'vestara.review-standards',
  displayName: 'Vestara Review Standards',
  summary: 'Standards-pack of review and verification profiles for engineering gate checks.',
  type: 'standards-pack',
  latestVersion: '2.0.0',
  versions: [{ version: '2.0.0', isStable: true, compatibility: { vestara: '>=0.3.0' }, checksumVerified: true }],
});

export const gitHelperDetails: MarketplaceAssetDetails = {
  asset: gitHelperAsset,
  registryId: 'local',
  integrityVerified: true,
  dependencies: [],
  permissions: [
    { capability: 'process:execute', scope: 'workspace' },
    { capability: 'filesystem:write', scope: 'repository' },
  ],
  capabilities: ['git:status', 'git:commit', 'git:diff'],
  manifest: {
    contributions: {
      commands: [
        { id: 'git-status', entrypoint: 'runtime.js' },
        { id: 'git-commit', entrypoint: 'runtime.js' },
      ],
    },
  },
};

export const reviewStandardsDetails: MarketplaceAssetDetails = {
  asset: reviewStandardsAsset,
  registryId: 'local',
  integrityVerified: true,
  dependencies: [],
  permissions: [],
  capabilities: ['verification:profile', 'review:standards'],
  manifest: { contributions: {} },
};

export const installedGitHelper: InstalledMarketplaceAsset = {
  assetId: 'vestara/vestara.git-helper',
  packageName: 'vestara.git-helper',
  installedVersion: '0.4.1',
  state: 'active',
  updateStatus: 'current',
  installedAt: '2026-08-05T00:00:00.000Z',
};

export const searchResult = (
  items: MarketplaceAsset[] = [gitHelperAsset, analysisAsset, reviewStandardsAsset],
): MarketplaceSearchResult => ({
  total: items.length,
  offset: 0,
  limit: 50,
  items: items.map((item) => ({ asset: item, registryId: 'local', score: 1 })),
});

export function operationDto(overrides: Partial<MarketplaceOperationDto> = {}): MarketplaceOperationDto {
  return {
    id: 'op-1',
    type: 'install',
    status: 'completed',
    asset: { publisherId: 'vestara', packageName: 'vestara.git-helper' },
    plan: {
      installOrder: [{ packageName: 'vestara.git-helper', version: '0.4.1', source: 'catalog' }],
      satisfiedByInstalled: [],
      permissions: [
        { capability: 'process:execute', scope: 'workspace' },
        { capability: 'filesystem:write', scope: 'repository' },
      ],
      warnings: [],
    },
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

export const registryHealthy: MarketplaceRegistryStatus = {
  id: 'local',
  kind: 'local',
  displayName: 'Local',
  health: { status: 'healthy', assetCount: 3, lastScanAt: '2026-08-05T00:00:00.000Z' },
};

export const updatesEmpty: MarketplaceUpdateCandidate[] = [];
