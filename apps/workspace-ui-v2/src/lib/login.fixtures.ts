// Login fixture — user card, brand preview cards, footer telemetry.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

export type LoginPreviewIcon = 'terminal' | 'activity' | 'store';

export interface LoginPreviewCard {
  icon: LoginPreviewIcon;
  title: string;
  detail: string;
}

export const LOGIN_PREVIEW_CARDS: LoginPreviewCard[] = [
  { icon: 'terminal', title: 'Terminal', detail: 'wired registry' },
  { icon: 'activity', title: 'Activity', detail: '7 agents mesh' },
  { icon: 'store', title: 'Marketplace', detail: 'package index' },
];

export const LOGIN_FOOTER = {
  left: '7 agents ready',
  right: '192.168.8.1 • OpenCode Online',
} as const;
