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
// Canonical: VestaraPackageType from @vestara/extension-contracts
// (provider | module | plugin | agent-pack | integration | theme |
//  verification-pack | standards-pack | tui). New canonical types reuse
// the existing categorical hues — no new palette. Legacy aliases
// (agent, skill, workflow, mcp-server, command, …) are kept for
// registry data published before the alignment.

export const TYPE_ACCENTS: Record<string, string> = {
  // ── canonical ──
  'ui-components': 'var(--vestara-marketplace-theme)',
  'agent-pack': 'var(--vestara-marketplace-agent)',
  module: 'var(--vestara-marketplace-module)',
  plugin: 'var(--vestara-marketplace-plugin)',
  provider: 'var(--vestara-marketplace-provider)',
  integration: 'var(--vestara-marketplace-mcp)',
  theme: 'var(--vestara-marketplace-theme)',
  'verification-pack': 'var(--vestara-marketplace-standards)',
  'standards-pack': 'var(--vestara-marketplace-standards)',
  tui: 'var(--vestara-marketplace-theme)',
  // ── legacy aliases (pre-alignment registry data) ──
  agent: 'var(--vestara-marketplace-agent)',
  skill: 'var(--vestara-marketplace-skill)',
  workflow: 'var(--vestara-marketplace-workflow)',
  'mcp-server': 'var(--vestara-marketplace-mcp)',
  mcpserver: 'var(--vestara-marketplace-mcp)',
  command: 'var(--vestara-marketplace-command)',
};

export function typeAccent(type: string): string {
  return TYPE_ACCENTS[type] ?? DISCOVER_ACCENT.fallback;
}

export function typeBadgeVariant(type: string): MarketplaceBadgeVariant {
  switch (type) {
    case 'agent-pack':
    case 'agent':
    case 'plugin':
      return 'info';
    case 'module':
      return 'default';
    case 'provider':
    case 'integration':
    case 'mcp-server':
    case 'standards-pack':
    case 'verification-pack':
      return 'success';
    case 'theme':
    case 'tui':
      return 'warning';
    case 'skill':
    case 'workflow':
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
  agentPack: 'var(--vestara-marketplace-agent)',
  integration: 'var(--vestara-marketplace-mcp)',
  verification: 'var(--vestara-marketplace-standards)',
  tui: 'var(--vestara-marketplace-theme)',
} as const;

// ─── Update-Group Accents ───────────────────────────────────────

export const UPDATE_ACCENTS: Record<'compatible' | 'breaking' | 'incompatible', string> = {
  compatible: 'var(--vestara-marketplace-provider)',
  breaking: 'var(--vestara-marketplace-workflow)',
  incompatible: 'var(--vestara-status-error)',
};
