/**
 * @vestara/marketplace-ui — Discover Color + Type-Accent Authority
 *
 * Canonical category→token mapping for the Discover gallery. Every accent
 * is a `var(--vestara-*)` reference — theme-aware in dark/light, never a
 * hardcoded hex. Hosts reuse `typeAccent()` for icon tiles, dots, rails,
 * and glows instead of inventing per-page palettes.
 *
 * Architecture Traceability:
 *   VES-DESIGN-005 §M: marketplace categorical identity
 *   Canonical values: @vestara/ui-tokens COLOR.marketplace
 */

import { DISCOVER_ACCENT } from './accent.js';

export type MarketplaceBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

// ─── Type Accents ───────────────────────────────────────────────

export const TYPE_ACCENTS: Record<string, string> = {
  agent: 'var(--vestara-marketplace-agent)',
  skill: 'var(--vestara-marketplace-skill)',
  provider: 'var(--vestara-marketplace-provider)',
  theme: 'var(--vestara-marketplace-theme)',
  workflow: 'var(--vestara-marketplace-workflow)',
  'mcp-server': 'var(--vestara-marketplace-mcp)',
  mcpserver: 'var(--vestara-marketplace-mcp)',
  command: 'var(--vestara-marketplace-command)',
  module: 'var(--vestara-marketplace-module)',
  plugin: 'var(--vestara-marketplace-plugin)',
  'standards-pack': 'var(--vestara-marketplace-standards)',
};

export function typeAccent(type: string): string {
  return TYPE_ACCENTS[type] ?? DISCOVER_ACCENT.fallback;
}

export function typeBadgeVariant(type: string): MarketplaceBadgeVariant {
  switch (type) {
    case 'agent':
    case 'plugin':
      return 'info';
    case 'skill':
    case 'module':
      return 'default';
    case 'provider':
    case 'standards-pack':
      return 'success';
    case 'theme':
    case 'workflow':
      return 'warning';
    case 'mcp-server':
    case 'command':
      return 'error';
    default:
      return 'default';
  }
}

// ─── Discover Palette (token references for hosts) ──────────────

export const DISCOVER_COLORS = {
  primary: 'var(--vestara-marketplace-primary)',
  primaryBg: 'var(--vestara-marketplace-primary-bg)',
  primaryBorder: 'var(--vestara-marketplace-primary-border)',
  rating: 'var(--vestara-marketplace-rating)',
  featuredBg: 'var(--vestara-marketplace-featured-bg)',
  featuredText: 'var(--vestara-marketplace-featured-text)',
  agent: 'var(--vestara-marketplace-agent)',
  skill: 'var(--vestara-marketplace-skill)',
  provider: 'var(--vestara-marketplace-provider)',
  theme: 'var(--vestara-marketplace-theme)',
  workflow: 'var(--vestara-marketplace-workflow)',
  mcp: 'var(--vestara-marketplace-mcp)',
  command: 'var(--vestara-marketplace-command)',
  module: 'var(--vestara-marketplace-module)',
  plugin: 'var(--vestara-marketplace-plugin)',
  standards: 'var(--vestara-marketplace-standards)',
} as const;

// ─── Update-Group Accents ───────────────────────────────────────

export const UPDATE_ACCENTS: Record<'compatible' | 'breaking' | 'incompatible', string> = {
  compatible: 'var(--vestara-marketplace-provider)',
  breaking: 'var(--vestara-marketplace-workflow)',
  incompatible: 'var(--vestara-status-error)',
};
