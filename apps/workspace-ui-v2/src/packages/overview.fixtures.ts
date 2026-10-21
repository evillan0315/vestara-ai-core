// Overview fixture — hero greeting, health pill, stat cards.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export const OVERVIEW_GREETING = 'Good afternoon, Director.';

export const OVERVIEW_SUBTITLE = 'Vestara Platform • 7 agents • 1 workflow • All systems nominal';

export const OVERVIEW_HEALTH = 'HEALTHY';

export interface OverviewStat {
  key: string;
  value: string;
}

export const OVERVIEW_STATS: OverviewStat[] = [
  { key: 'WORKSPACE', value: 'vestara-platform' },
  { key: 'HEALTH', value: 'Healthy' },
  { key: 'FOCUS', value: '25%' },
  { key: 'AGENTS', value: '7/7' },
];
