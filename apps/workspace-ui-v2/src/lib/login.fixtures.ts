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
  { icon: 'activity', title: 'Activity', detail: '10 agents mesh' },
  { icon: 'store', title: 'Marketplace', detail: 'package index' },
];

export const LOGIN_FOOTER = {
  left: '10 agents ready',
  right: 'v2.0.0 • OpenCode Online',
} as const;

/** Live session line: `{name} • {role} • {agentCount} agents ready`. */
export function loginSessionFooter(name: string, role: string, agentCount: number): string {
  return `${name} • ${role} • ${agentCount} agents ready`;
}
