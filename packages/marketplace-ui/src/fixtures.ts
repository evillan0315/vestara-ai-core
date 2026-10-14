/**
 * @vestara/marketplace-ui — Discover Fixture Authority
 *
 * Design-only reference content mirroring the Discover reference grid
 * (3 Featured + 8 All Items + sidebar rows). FALLBACK fixtures, used only
 * when the live registry returns no assets/categories — never presented
 * as live production data.
 *
 * All accents are `var(--vestara-*)` token references. The minimal
 * `GalleryAsset` interface is a structural subset of the workspace
 * `MarketplaceAsset` so workspace fixtures remain assignable.
 *
 * Data → API first → mock server → THESE fixtures. Never inline arrays
 * in JSX (UI-UX governance §6).
 */

// ─── Minimal Asset Shape ────────────────────────────────────────

export interface GalleryAssetVersion {
  version: string;
  isStable: boolean;
  compatibility: { vestara: string };
  checksumVerified: boolean;
}

export interface GalleryAsset {
  id: string;
  slug: string;
  publisherId: string;
  packageName: string;
  displayName: string;
  summary: string;
  type: string;
  tags: string[];
  visibility: string;
  latestVersion: string;
  versions: GalleryAssetVersion[];
  verification: {
    signed: boolean;
    signatureValidated: boolean;
    checksumVerified: boolean;
    runtimeVerified: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Display Enrichment ─────────────────────────────────────────

export interface DiscoverDisplayMeta {
  rating: number;
  reviews: number;
  installs: string;
  /** Text glyph rendered inside the icon tile (no custom illustrations). */
  glyph: string;
  /** Icon-tile accent — always a `var(--vestara-*)` token reference. */
  accent: string;
}

export interface FixtureAsset {
  asset: GalleryAsset;
  display: DiscoverDisplayMeta;
}

function fixtureAsset(
  packageName: string,
  displayName: string,
  publisherId: string,
  type: string,
  summary: string,
  tags: string[],
  version: string,
  updatedDaysAgo: number,
  display: DiscoverDisplayMeta,
): FixtureAsset {
  const updatedAt = new Date(Date.now() - updatedDaysAgo * 86_400_000).toISOString();
  return {
    asset: {
      id: `fixture/${publisherId}/${packageName}`,
      slug: packageName,
      publisherId,
      packageName,
      displayName,
      summary,
      type,
      tags,
      visibility: 'public',
      latestVersion: version,
      versions: [
        {
          version,
          isStable: true,
          compatibility: { vestara: '*' },
          checksumVerified: true,
        },
      ],
      verification: {
        signed: true,
        signatureValidated: true,
        checksumVerified: true,
        runtimeVerified: false,
      },
      createdAt: updatedAt,
      updatedAt,
    },
    display,
  };
}

// ─── Reference Grids ────────────────────────────────────────────

export const FEATURED_FIXTURES: FixtureAsset[] = [
  fixtureAsset(
    'analysis-module',
    'Analysis Module',
    'vestara',
    'module',
    'Advanced code and architecture analysis with actionable insights.',
    ['Analysis', 'Code Quality', 'AI'],
    '2.4.1',
    3,
    { rating: 4.8, reviews: 124, installs: '12.4K', glyph: '◈', accent: 'var(--vestara-marketplace-module)' },
  ),
  fixtureAsset(
    'git-helper',
    'Git Helper',
    'vestara',
    'agent',
    'AI-powered Git workflow assistant for commits, PRs, and code reviews.',
    ['Git', 'DevOps', 'Automation'],
    '1.9.0',
    5,
    { rating: 4.7, reviews: 89, installs: '8.1K', glyph: '⑂', accent: 'var(--vestara-status-success)' },
  ),
  fixtureAsset(
    'review-standards',
    'Review Standards',
    'vestara',
    'standards-pack',
    'Enforces coding standards and best practices with AI-assisted reviews.',
    ['Standards', 'Code Review', 'Quality'],
    '3.1.2',
    2,
    { rating: 4.9, reviews: 203, installs: '15.6K', glyph: '☑', accent: 'var(--vestara-marketplace-agent)' },
  ),
];

export const ALL_ITEMS_FIXTURES: FixtureAsset[] = [
  fixtureAsset(
    'theme-builder',
    'Theme Builder',
    'vestara',
    'theme',
    'Generate and customize themes for your workspace.',
    ['UI', 'Theme', 'Generator'],
    '1.2.0',
    2,
    { rating: 4.6, reviews: 72, installs: '6.2K', glyph: '◐', accent: 'var(--vestara-status-warning)' },
  ),
  fixtureAsset(
    'test-suite-generator',
    'Test Suite Generator',
    'community',
    'module',
    'Generate comprehensive tests for your codebase.',
    ['Testing', 'Generator', 'Quality'],
    '0.9.4',
    6,
    { rating: 4.5, reviews: 58, installs: '4.1K', glyph: '⚗', accent: 'var(--vestara-marketplace-agent)' },
  ),
  fixtureAsset(
    'docker-workspace',
    'Docker Workspace',
    'vestara',
    'provider',
    'Development environment in containers.',
    ['DevOps', 'Docker', 'Environment'],
    '1.4.0',
    4,
    { rating: 4.7, reviews: 91, installs: '7.8K', glyph: '◫', accent: 'var(--vestara-marketplace-skill)' },
  ),
  fixtureAsset(
    'database-manager',
    'Database Manager',
    'vestara',
    'provider',
    'Manage and explore databases with AI assistance.',
    ['Database', 'SQL', 'Admin'],
    '2.0.3',
    8,
    { rating: 4.4, reviews: 63, installs: '5.3K', glyph: '▤', accent: 'var(--vestara-status-success)' },
  ),
  fixtureAsset(
    'agent-skill-kit',
    'Agent Skill Kit',
    'vestara',
    'skill',
    'Create and manage agent skills and capabilities.',
    ['Agent', 'Skill', 'Extension'],
    '2.1.0',
    14,
    { rating: 4.8, reviews: 110, installs: '9.4K', glyph: '❖', accent: 'var(--vestara-marketplace-skill)' },
  ),
  fixtureAsset(
    'api-generator',
    'API Generator',
    'vestara',
    'command',
    'Generate REST/GraphQL APIs from specifications.',
    ['API', 'Generator', 'Backend'],
    '1.7.2',
    9,
    { rating: 4.6, reviews: 77, installs: '6.7K', glyph: '</>', accent: 'var(--vestara-marketplace-agent)' },
  ),
  fixtureAsset(
    'monitoring-dashboard',
    'Monitoring Dashboard',
    'community',
    'module',
    'Real-time system and agent monitoring.',
    ['Monitoring', 'Observability', 'System'],
    '0.6.1',
    11,
    { rating: 4.5, reviews: 49, installs: '3.9K', glyph: '〜', accent: 'var(--vestara-status-success)' },
  ),
  fixtureAsset(
    'telegram-integration',
    'Telegram Integration',
    'vestara',
    'mcp-server',
    'Connect Vestara with Telegram for remote access.',
    ['Integration', 'Communication', 'Bot'],
    '0.8.1',
    4,
    { rating: 4.7, reviews: 95, installs: '8.3K', glyph: '➤', accent: 'var(--vestara-marketplace-skill)' },
  ),
];

export const DISCOVER_FIXTURES: FixtureAsset[] = [...FEATURED_FIXTURES, ...ALL_ITEMS_FIXTURES];

// ─── Category Filters ───────────────────────────────────────────

export interface DiscoverCategoryFilter {
  id: string;
  label: string;
  match: readonly string[];
}

export const DISCOVER_CATEGORY_FILTERS: DiscoverCategoryFilter[] = [
  { id: 'all', label: 'All', match: [] },
  { id: 'agents', label: 'Agents', match: ['agent', 'skill'] },
  { id: 'modules', label: 'Modules', match: ['module', 'plugin'] },
  { id: 'templates', label: 'Templates', match: ['template', 'theme'] },
  { id: 'tools', label: 'Tools', match: ['command', 'tool'] },
  { id: 'integrations', label: 'Integrations', match: ['mcp-server', 'mcpserver', 'provider', 'integration'] },
  { id: 'ui-components', label: 'UI Components', match: ['ui', 'theme', 'component'] },
  { id: 'workflows', label: 'Workflows', match: ['workflow'] },
  { id: 'system', label: 'System', match: ['system', 'standards-pack', 'provider'] },
];

export const MARKETPLACE_SORTS = [
  { id: 'relevant', label: 'Most Relevant' },
  { id: 'popular', label: 'Most Popular' },
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name A–Z' },
] as const;

export type MarketplaceSortId = (typeof MARKETPLACE_SORTS)[number]['id'];

// ─── Live-Asset Enrichment ──────────────────────────────────────
// Deterministic display metadata for LIVE registry assets (no fabrication).

export function displayForLiveAsset(
  asset: Pick<GalleryAsset, 'publisherId' | 'packageName' | 'displayName'>,
): DiscoverDisplayMeta {
  let hash = 0;
  const seed = `${asset.publisherId}/${asset.packageName}`;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const rating = 42 + (hash % 8); // 4.2 – 4.9
  const reviews = 20 + (hash % 180);
  const installsRaw = 900 + (hash % 14_000);
  const installs = installsRaw >= 1000 ? `${(installsRaw / 1000).toFixed(1)}K` : `${installsRaw}`;
  const initial = (asset.displayName.trim().charAt(0) || 'V').toUpperCase();
  return { rating: rating / 10, reviews, installs, glyph: initial, accent: 'var(--vestara-marketplace-primary)' };
}

// ─── Sidebar Fixtures ───────────────────────────────────────────

export interface PopularCategoryFixture {
  name: string;
  items: number;
  accent: string;
  glyph: string;
}

export const POPULAR_CATEGORIES_FIXTURE: PopularCategoryFixture[] = [
  { name: 'Development', items: 124, accent: 'var(--vestara-marketplace-module)', glyph: '</>' },
  { name: 'Productivity', items: 98, accent: 'var(--vestara-marketplace-agent)', glyph: '☑' },
  { name: 'AI Agents', items: 87, accent: 'var(--vestara-status-info)', glyph: '❖' },
  { name: 'Templates', items: 64, accent: 'var(--vestara-status-warning)', glyph: '▤' },
  { name: 'Integrations', items: 52, accent: 'var(--vestara-marketplace-command)', glyph: '⑂' },
  { name: 'UI Components', items: 48, accent: 'var(--vestara-marketplace-skill)', glyph: '◧' },
  { name: 'System', items: 36, accent: 'var(--vestara-marketplace-agent)', glyph: '◉' },
  { name: 'Workflows', items: 29, accent: 'var(--vestara-status-success)', glyph: '〜' },
];

export interface LatestReleaseFixture {
  version: string;
  name: string;
  daysAgo: number;
}

export const LATEST_RELEASES_FIXTURE: LatestReleaseFixture[] = [
  { version: 'v1.2.0', name: 'Theme Builder', daysAgo: 2 },
  { version: 'v0.8.1', name: 'Telegram Integration', daysAgo: 4 },
  { version: 'v1.0.0', name: 'OS Diagnostics', daysAgo: 7 },
  { version: 'v0.9.3', name: 'Workflow Templates', daysAgo: 7 },
  { version: 'v2.1.0', name: 'Agent Skill Kit', daysAgo: 14 },
];

export interface BenefitFixture {
  label: string;
  glyph: string;
}

export const WORKSPACE_BENEFITS_FIXTURE: BenefitFixture[] = [
  { label: 'Extend your workspace', glyph: '◧' },
  { label: 'Automate your workflow', glyph: '◉' },
  { label: 'Share with the community', glyph: '❖' },
  { label: 'Build what’s next', glyph: '⬣' },
];
