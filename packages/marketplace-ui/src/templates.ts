/**
 * @vestara/marketplace-ui — Theme Template Authority
 *
 * Merged theme templates: the extracted Vestara Shell Foundation palette
 * (assets/templates/html/Vestara-Shell-Foundation-Review.html) plus the
 * Settings → General → Theme appearance axes — accent palette
 * (`ACCENT_PALETTES`), font family (`FONT_FAMILIES`), and font weight
 * (`FONT_WEIGHTS`) — all from the canonical @vestara/ui-tokens authority.
 *
 * Templates are presentation metadata (accent / font / surface ramp) paired
 * with reference `FixtureAsset`s so the Marketplace Templates tab can render
 * preview cards and reuse the shared AssetCard grid. Fallback reference
 * content only — never presented as live registry data.
 *
 * Data → API first → mock server → THESE fixtures. Never inline arrays in
 * JSX (UI-UX governance §6). Every surface/accent value is a `var(--vestara-*)`
 * token reference or the token-sourced palette hex — never an inline literal.
 */

import {
  ACCENT_PALETTES,
  type AccentColorTheme,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  type FontFamilyId,
  type FontWeightId,
} from '@vestara/ui-tokens';
import type { DiscoverDisplayMeta, FixtureAsset, GalleryAsset } from './fixtures.js';

// ─── Template Metadata ──────────────────────────────────────────

export interface ThemeTemplateSwatch {
  /** Human-readable role, e.g. "surface-1". */
  name: string;
  /** Canonical `var(--vestara-*)` token reference. */
  token: string;
}

export interface ThemeTemplate {
  id: string;
  name: string;
  description: string;
  /** Accent palette id — authority: @vestara/ui-tokens ACCENT_PALETTES. */
  accent: AccentColorTheme;
  /** Font family id — authority: @vestara/ui-tokens FONT_FAMILIES. */
  fontFamily: FontFamilyId;
  /** Font weight id — authority: @vestara/ui-tokens FONT_WEIGHTS. */
  fontWeight: FontWeightId;
  /** Layered surface ramp (canvas → sunken), token references. */
  surfaces: readonly ThemeTemplateSwatch[];
  tags: readonly string[];
  glyph: string;
  packageName: string;
  publisherId: string;
  version: string;
  updatedDaysAgo: number;
  /** Icon-tile accent for the asset grid — a `var(--vestara-*)` reference. */
  displayAccent: string;
}

/** Canonical surface ramp extracted from the Shell Foundation review. */
const SHELL_SURFACES: readonly ThemeTemplateSwatch[] = [
  { name: 'canvas', token: 'var(--vestara-surface-canvas)' },
  { name: 'surface-1', token: 'var(--vestara-surface-panel)' },
  { name: 'surface-2', token: 'var(--vestara-surface-panel-raised)' },
  { name: 'border', token: 'var(--vestara-border-subtle)' },
];

const WORKSPACE_SURFACES: readonly ThemeTemplateSwatch[] = [
  { name: 'canvas', token: 'var(--vestara-surface-canvas)' },
  { name: 'panel', token: 'var(--vestara-surface-panel)' },
  { name: 'raised', token: 'var(--vestara-surface-panel-raised)' },
  { name: 'border', token: 'var(--vestara-border-subtle)' },
];

export const THEME_TEMPLATES: readonly ThemeTemplate[] = [
  {
    id: 'shell-foundation',
    name: 'Vestara Shell Foundation',
    description:
      'The extracted Shell Foundation shell — accent glow #2de8c3 over a layered near-black surface ramp (#0a1214 → #132528), Geist Mono 11px, single border colour.',
    accent: 'shell',
    fontFamily: 'mono',
    fontWeight: 'medium',
    surfaces: SHELL_SURFACES,
    tags: ['Theme', 'Template', 'Shell', 'Design Tokens', 'Geist Mono'],
    glyph: '◧',
    packageName: 'shell-foundation-theme',
    publisherId: 'vestara',
    version: '2.4.1',
    updatedDaysAgo: 1,
    displayAccent: 'var(--vestara-marketplace-theme)',
  },
  {
    id: 'default',
    name: 'Default',
    description: 'Balanced dark theme · startup cyan accent · system font · normal weight.',
    accent: 'startup',
    fontFamily: 'system',
    fontWeight: 'normal',
    surfaces: WORKSPACE_SURFACES,
    tags: ['Theme', 'Template', 'Dark', 'Startup Cyan'],
    glyph: '◈',
    packageName: 'default-theme',
    publisherId: 'vestara',
    version: '1.0.0',
    updatedDaysAgo: 30,
    displayAccent: 'var(--vestara-marketplace-module)',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Mono font · sharp corners · compact spacing · neutral accent.',
    accent: 'neutral',
    fontFamily: 'mono',
    fontWeight: 'normal',
    surfaces: WORKSPACE_SURFACES,
    tags: ['Theme', 'Template', 'Mono', 'Neutral'],
    glyph: '⊟',
    packageName: 'minimal-theme',
    publisherId: 'vestara',
    version: '1.0.0',
    updatedDaysAgo: 24,
    displayAccent: 'var(--vestara-marketplace-agent)',
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Discover gallery · large radius · blue accent · system font.',
    accent: 'blue',
    fontFamily: 'system',
    fontWeight: 'normal',
    surfaces: WORKSPACE_SURFACES,
    tags: ['Theme', 'Template', 'Gallery', 'Blue'],
    glyph: '▯',
    packageName: 'presentation-theme',
    publisherId: 'vestara',
    version: '1.2.0',
    updatedDaysAgo: 12,
    displayAccent: 'var(--vestara-marketplace-primary)',
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    description: 'Large text · high contrast · wide spacing · violet accent · semibold.',
    accent: 'violet',
    fontFamily: 'system',
    fontWeight: 'semibold',
    surfaces: WORKSPACE_SURFACES,
    tags: ['Theme', 'Template', 'Accessibility', 'Violet'],
    glyph: '♿',
    packageName: 'accessibility-theme',
    publisherId: 'vestara',
    version: '1.1.2',
    updatedDaysAgo: 18,
    displayAccent: 'var(--vestara-marketplace-skill)',
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Gallery glow · light mode · wide rail · gold accent.',
    accent: 'gold',
    fontFamily: 'system',
    fontWeight: 'normal',
    surfaces: WORKSPACE_SURFACES,
    tags: ['Theme', 'Template', 'Light', 'Vestara Gold'],
    glyph: '✦',
    packageName: 'premium-theme',
    publisherId: 'vestara',
    version: '1.3.0',
    updatedDaysAgo: 6,
    displayAccent: 'var(--vestara-marketplace-provider)',
  },
  {
    id: 'premium-dark',
    name: 'Premium Dark',
    description: 'Gallery glow · dark mode · wide rail · amber accent.',
    accent: 'amber',
    fontFamily: 'system',
    fontWeight: 'normal',
    surfaces: WORKSPACE_SURFACES,
    tags: ['Theme', 'Template', 'Dark', 'Amber'],
    glyph: '✧',
    packageName: 'premium-dark-theme',
    publisherId: 'vestara',
    version: '1.3.0',
    updatedDaysAgo: 5,
    displayAccent: 'var(--vestara-status-warning)',
  },
];

// ─── Reference Asset Fixtures ───────────────────────────────────

function templateFixture(template: ThemeTemplate): FixtureAsset {
  const updatedAt = new Date(Date.now() - template.updatedDaysAgo * 86_400_000).toISOString();
  const asset: GalleryAsset = {
    id: `fixture/${template.publisherId}/${template.packageName}`,
    slug: template.packageName,
    publisherId: template.publisherId,
    packageName: template.packageName,
    displayName: template.name,
    summary: template.description,
    type: 'theme',
    tags: [...template.tags],
    visibility: 'public',
    latestVersion: template.version,
    versions: [
      {
        version: template.version,
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
  };
  const display: DiscoverDisplayMeta = {
    glyph: template.glyph,
    accent: template.displayAccent,
  };
  return { asset, display };
}

export const THEME_TEMPLATE_FIXTURES: readonly FixtureAsset[] = THEME_TEMPLATES.map(templateFixture);

/** Number of bundled theme templates (for stat pills / headers). */
export const TEMPLATE_COUNT = THEME_TEMPLATES.length;

// ─── Appearance Axis Helpers (Settings → General parity) ────────

/** Accent palette metadata for the theme-appearance axis. */
export function templateAccent(template: ThemeTemplate) {
  return ACCENT_PALETTES[template.accent];
}

/** Font family metadata for the theme-appearance axis. */
export function templateFontFamily(template: ThemeTemplate) {
  return FONT_FAMILIES[template.fontFamily];
}

/** Font weight metadata for the theme-appearance axis. */
export function templateFontWeight(template: ThemeTemplate) {
  return FONT_WEIGHTS[template.fontWeight];
}
