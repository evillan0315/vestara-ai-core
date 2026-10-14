/**
 * @vestara/marketplace-ui — Marketplace Discover Presentation System
 *
 * Globally reusable gallery authority: components, color/type tokens,
 * Discover layout geometry, fixtures, and sort/filter contracts.
 *
 * Layering: @vestara/ui-tokens (tokens) → @vestara/ui (primitives) →
 * @vestara/marketplace-ui (gallery composition) → apps (pages/routes).
 * This package never imports apps/*, @vestara/workspace, routing, or
 * Activity Room contracts.
 *
 * Workspace profile wiring: the `presentation` profile in
 * apps/workspace/src/lib/theme.tsx is the Discover-backed profile
 * (comfortable spacing, large radius, wide rail, blue accent).
 */

export type { AccentColorTheme, AccentPalette, MarketplacePrimary } from './accent.js';
export {
  ACCENT_PALETTES,
  accentGlow,
  DEFAULT_ACCENT_THEME,
  DISCOVER_ACCENT,
  MARKETPLACE_ACCENT_VARS,
  marketplacePrimaryForTheme,
  resolveAccentPalette,
} from './accent.js';
export type {
  AssetCardProps,
  AssetInstallState,
  GalleryCardProps,
  InsightBannerProps,
  MarketplaceEmptyStateProps,
  MarketplaceErrorStateProps,
  MarketplaceLoadingStateProps,
  MarketplacePageProps,
  MarketplaceSectionProps,
  MarketplaceStatPillProps,
  MarketplaceToolbarProps,
  NavigateHandler,
} from './components.js';
export {
  AssetCard,
  AssetGridSkeleton,
  ConfirmButton,
  DetailCard,
  GalleryCard,
  InsightBanner,
  MarketplaceEmptyState,
  MarketplaceErrorState,
  MarketplaceFilterRow,
  MarketplaceHero,
  MarketplaceLoadingMessage,
  MarketplaceLoadingState,
  MarketplacePage,
  MarketplaceSection,
  MarketplaceSidebarCard,
  MarketplaceStatPill,
  MarketplaceToolbar,
  RegistryHealthLamp,
  TypeBadge,
  UpdateGroup,
} from './components.js';
export type {
  BenefitFixture,
  DiscoverCategoryFilter,
  DiscoverDisplayMeta,
  FixtureAsset,
  GalleryAsset,
  GalleryAssetVersion,
  LatestReleaseFixture,
  MarketplaceSortId,
  PopularCategoryFixture,
} from './fixtures.js';
export {
  ALL_ITEMS_FIXTURES,
  DISCOVER_CATEGORY_FILTERS,
  DISCOVER_FIXTURES,
  displayForLiveAsset,
  FEATURED_FIXTURES,
  LATEST_RELEASES_FIXTURE,
  MARKETPLACE_SORTS,
  POPULAR_CATEGORIES_FIXTURE,
  WORKSPACE_BENEFITS_FIXTURE,
} from './fixtures.js';
export {
  DISCOVER_GAP,
  DISCOVER_GRID,
  DISCOVER_RADIUS,
  DISCOVER_SPACING,
  MARKETPLACE_LAYOUT,
  MARKETPLACE_LAYOUT_VARS,
} from './layout.js';
export type { MarketplaceBadgeVariant } from './tokens.js';
export { DISCOVER_COLORS, TYPE_ACCENTS, typeAccent, typeBadgeVariant, UPDATE_ACCENTS } from './tokens.js';
