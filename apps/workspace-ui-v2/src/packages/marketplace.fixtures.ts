// Marketplace fixture — capability cards + release badge.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export interface CapabilityCard {
  name: string;
}

export const MARKETPLACE_CARDS: CapabilityCard[] = [
  { name: 'ExtractorCard' },
  { name: 'MarketplaceHeader' },
  { name: 'CapabilityCard' },
  { name: 'TrendingRow' },
  { name: 'SearchInput' },
  { name: 'AuthShell' },
];

export const MARKETPLACE_BADGE = '112 FINAL';
