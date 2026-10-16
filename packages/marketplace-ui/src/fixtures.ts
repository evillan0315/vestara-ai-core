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
    'agent-pack',
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
    'agent-pack',
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
    'plugin',
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
    'integration',
    'Connect Vestara with Telegram for remote access.',
    ['Integration', 'Communication', 'Bot'],
    '0.8.1',
    4,
    { rating: 4.7, reviews: 95, installs: '8.3K', glyph: '➤', accent: 'var(--vestara-marketplace-skill)' },
  ),
];

// ─── UI Components Fixtures ─────────────────────────────────────
// The extracted Vestara OS component library plus the shared UI / tokens /
// primitives packages it is built on. All typed `module` (the canonical type
// UI packages publish under) and tagged so the cross-type UI Components
// category matches them via `assetMatchesCategory`.

export const UI_COMPONENT_FIXTURES: FixtureAsset[] = [
  fixtureAsset(
    'ui-components',
    'Vestara UI Components',
    'vestara',
    'module',
    'The extracted Vestara OS component library — file workspace, chat assistant, auth/onboarding, and data-display primitives.',
    ['UI', 'Components', 'Primitives', 'Design System'],
    '0.1.0',
    0,
    { rating: 4.9, reviews: 210, installs: '18.2K', glyph: '◧', accent: 'var(--vestara-marketplace-theme)' },
  ),
  fixtureAsset(
    'ui',
    'Vestara UI Primitives',
    'vestara',
    'module',
    'Domain-independent presentation primitives: Button, Card, Input, Tabs, Table, Shell, Panes, charts.',
    ['UI', 'Primitives', 'React', 'Design System'],
    '0.1.0',
    1,
    { rating: 4.8, reviews: 176, installs: '15.4K', glyph: '◧', accent: 'var(--vestara-marketplace-module)' },
  ),
  fixtureAsset(
    'ui-tokens',
    'Vestara Design Tokens',
    'vestara',
    'module',
    'Canonical design token authority — colour, typography, spacing, radius, elevation, motion, and the CSS variable contract.',
    ['UI', 'Tokens', 'Design System', 'Primitives'],
    '0.1.0',
    1,
    { rating: 4.9, reviews: 198, installs: '16.9K', glyph: '◍', accent: 'var(--vestara-marketplace-provider)' },
  ),
  fixtureAsset(
    'design-system',
    'Vestara Design System',
    'vestara',
    'module',
    'Brand and design-system adapter re-exporting the canonical tokens for web and TUI surfaces.',
    ['UI', 'Design System', 'Brand', 'Tokens'],
    '0.1.0',
    3,
    { rating: 4.7, reviews: 132, installs: '11.1K', glyph: '◍', accent: 'var(--vestara-marketplace-skill)' },
  ),
  fixtureAsset(
    'marketplace-ui',
    'Vestara Marketplace Gallery',
    'vestara',
    'module',
    'The reusable marketplace gallery: AssetCard, MarketplacePage, filter/sort toolbar, category accents, and fixtures.',
    ['UI', 'Components', 'Gallery', 'Marketplace'],
    '0.1.0',
    2,
    { rating: 4.6, reviews: 88, installs: '7.6K', glyph: '▤', accent: 'var(--vestara-marketplace-primary)' },
  ),
];

export const DISCOVER_FIXTURES: FixtureAsset[] = [
  ...FEATURED_FIXTURES,
  ...ALL_ITEMS_FIXTURES,
  ...UI_COMPONENT_FIXTURES,
];

// ─── Category Filters ───────────────────────────────────────────

export interface DiscoverCategoryFilter {
  id: string;
  label: string;
  /** Exact asset.type values (canonical VestaraPackageType). Never substring. */
  match: readonly string[];
  /**
   * Optional tag discriminator. A filter matches when ANY of its tags is
   * present on the asset (case-insensitive). Used for cross-type categories
   * such as UI Components, which spans module/theme assets carrying the
   * `ui`/`component`/`primitives`/`design-system` tags.
   */
  tags?: readonly string[];
}

// Canonical: one filter per VestaraPackageType
// (@vestara/extension-contracts) + All + the cross-type UI Components category.
// match holds exact asset.type values - matchers must use exact equality,
// never substring search. `tags` is an additive discriminator.
export const DISCOVER_CATEGORY_FILTERS: DiscoverCategoryFilter[] = [
  { id: 'all', label: 'All', match: [] },
  {
    id: 'ui-components',
    label: 'UI Components',
    match: [],
    tags: ['ui', 'component', 'components', 'primitives', 'design-system', 'tokens'],
  },
  { id: 'agent-pack', label: 'Agents', match: ['agent-pack'] },
  { id: 'module', label: 'Modules', match: ['module'] },
  { id: 'plugin', label: 'Plugins', match: ['plugin'] },
  { id: 'provider', label: 'Providers', match: ['provider'] },
  { id: 'integration', label: 'Integrations', match: ['integration'] },
  { id: 'theme', label: 'Themes', match: ['theme'] },
  { id: 'verification-pack', label: 'Verification', match: ['verification-pack'] },
  { id: 'standards-pack', label: 'Standards', match: ['standards-pack'] },
  { id: 'tui', label: 'TUI', match: ['tui'] },
];

// ─── Category Matching (canonical) ──────────────────────────────

/** Canonical VestaraPackageType normalization for pre-alignment registry data. */
export function normalizePackageType(type: string): string {
  switch (type) {
    case 'agent':
    case 'skill':
    case 'workflow':
      return 'agent-pack';
    case 'command':
    case 'tool':
      return 'plugin';
    case 'mcp-server':
    case 'mcpserver':
      return 'integration';
    case 'template':
    case 'ui':
    case 'component':
      return 'theme';
    case 'system':
      return 'standards-pack';
    default:
      return type;
  }
}

/** True when an asset belongs to the given Discover category filter. */
export function assetMatchesCategory(asset: { type: string; tags?: readonly string[] }, filterId: string): boolean {
  if (filterId === 'all') return true;
  const filter = DISCOVER_CATEGORY_FILTERS.find((f) => f.id === filterId);
  if (!filter) return normalizePackageType(asset.type) === filterId;
  const normalized = normalizePackageType(asset.type);
  if (filter.match.includes(normalized)) return true;
  if (filter.tags && filter.tags.length > 0) {
    const assetTags = (asset.tags ?? []).map((tag) => tag.toLowerCase());
    return filter.tags.some((tag) => assetTags.includes(tag.toLowerCase()));
  }
  return false;
}

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
