/**
 * @vestara/marketplace-ui — Discover Layout Authority
 *
 * Globally reusable gallery geometry for the Marketplace Discover system.
 * Values are the canonical `MARKETPLACE_LAYOUT` tokens from
 * `@vestara/ui-tokens`; this module adds the responsive grid grammar and
 * the CSS-variable names hosts bind to.
 *
 * UI-UX governance: every visual value resolves to `var(--vestara-*)`.
 * No hex, no inline literals, no arbitrary Tailwind.
 *
 * Architecture Traceability:
 *   VES-DESIGN-005 §M: marketplace premium gallery
 *   @see apps/workspace/src/styles/marketplace.css (mpg-* grammar)
 */

import { MARKETPLACE_LAYOUT } from '@vestara/ui-tokens';

export { MARKETPLACE_LAYOUT };

// ─── CSS Variable Names ─────────────────────────────────────────
// Hosts bind Tailwind arbitrary values to these (e.g.
// `p-[var(--vestara-marketplace-card-padding)]`).

export const MARKETPLACE_LAYOUT_VARS = {
  cardPadding: '--vestara-marketplace-card-padding',
  cardRadius: '--vestara-marketplace-card-radius',
  cardGap: '--vestara-marketplace-card-gap',
  discoverGridGap: '--vestara-marketplace-discover-grid-gap',
  discoverMainGap: '--vestara-marketplace-discover-main-gap',
  discoverSideGap: '--vestara-marketplace-discover-side-gap',
  heroPadding: '--vestara-marketplace-hero-padding',
  heroRadius: '--vestara-marketplace-hero-radius',
  heroGap: '--vestara-marketplace-hero-gap',
  benefitsPadding: '--vestara-marketplace-benefits-padding',
  pillPadding: '--vestara-marketplace-pill-padding',
  pillRadius: '--vestara-marketplace-pill-radius',
  tagPadding: '--vestara-marketplace-tag-padding',
  installPadding: '--vestara-marketplace-install-padding',
  sideCardPadding: '--vestara-marketplace-side-card-padding',
  iconBoxSize: '--vestara-marketplace-icon-box-size',
  iconBoxRadius: '--vestara-marketplace-icon-box-radius',
  categoryTileSize: '--vestara-marketplace-category-tile-size',
  // Shared gallery surface: solid selected-accent presence melted into a
  // dark gradient (derived layer: workspace index.css, dark + light).
  // Every gallery card binds `background` to this one variable.
  galleryCardBg: '--vestara-gallery-card-bg',
} as const;

// ─── Responsive Grid Grammar ────────────────────────────────────
// Mirrors the mpg-featured-grid / mpg-all-grid / mpg-discover breakpoints
// so every host lays out the gallery identically.

export const DISCOVER_GRID = {
  /** Discover shell: hero row on top, then main + right-sidebar body. */
  shellColumns: 'minmax(0, 1fr)',
  /** Body: stacked on mobile, main + 19rem sidebar at ≥1024px. */
  bodyBreakpoint: '1024px',
  bodyColumns: 'minmax(0, 1fr) minmax(0, 19rem)',
  /** Sidebar: Popular Categories + Latest Releases + Publish CTA. */
  sidebarCards: ['popular-categories', 'latest-releases', 'publish-cta'],
  /** Bottom rail (legacy pre-sidebar layout): 1-up → 2-up at ≥900px. */
  bottomRailBreakpoint: '900px',
  bottomRailColumns: 2,
  /** Featured row in the main column: 1-up → 2-up at ≥700px → 3-up at ≥1280px. */
  featuredBreakpoint: '1280px',
  featuredColumns: 3,
  /** All-items grid in the main column: 1-up → 2-up at ≥640px → 3-up at ≥1400px. */
  allGridBreakpoints: ['640px', '1400px'],
  allGridColumns: [1, 2, 3],
  /** Hero row: Build More (3fr) + benefits (1fr) at ≥900px, stacked below. */
  heroBreakpoint: '900px',
  heroColumns: 'minmax(0, 3fr) minmax(0, 1fr)',
} as const;

// ─── Spacing / Radius / Gap Presets (profile wiring) ────────────
// The workspace `presentation` profile maps to these presets:
// comfortable spacing + large radius + wide rail + blue accent.

export const DISCOVER_SPACING = {
  page: MARKETPLACE_LAYOUT.discoverGridGap,
  section: MARKETPLACE_LAYOUT.discoverMainGap,
  element: MARKETPLACE_LAYOUT.discoverSideGap,
} as const;

export const DISCOVER_RADIUS = {
  card: MARKETPLACE_LAYOUT.cardRadius,
  hero: MARKETPLACE_LAYOUT.heroRadius,
  pill: MARKETPLACE_LAYOUT.pillRadius,
} as const;

export const DISCOVER_GAP = {
  grid: MARKETPLACE_LAYOUT.cardGap,
  shell: MARKETPLACE_LAYOUT.discoverGridGap,
  main: MARKETPLACE_LAYOUT.discoverMainGap,
  side: MARKETPLACE_LAYOUT.discoverSideGap,
  hero: MARKETPLACE_LAYOUT.heroGap,
} as const;
