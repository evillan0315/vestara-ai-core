export function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function branchId(): string {
  return `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export function getDateLabel(ts: number, prevTs?: number): string | null {
  if (prevTs) {
    const d = new Date(ts);
    const p = new Date(prevTs);
    if (d.toDateString() === p.toDateString()) return null;
  }
  const d = new Date(ts);
  const t = new Date();
  const y = new Date(t);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== t.getFullYear() ? 'numeric' : undefined,
  });
}

export function getRelativeDateGroup(ts: number): string {
  const d = new Date(ts);
  const t = new Date();
  const startOfToday = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  if (d >= startOfWeek) return 'Previous 7 Days';
  return 'Older';
}

export function getFollowUps(text: string): string[] {
  const lower = text.toLowerCase();
  if (lower.includes('architect') || lower.includes('structure') || lower.includes('design'))
    return ['Show me a diagram of this', 'What are the trade-offs?', 'Can you implement the plan?'];
  if (lower.includes('plan') || lower.includes('feature') || lower.includes('task'))
    return ['Break this into subtasks', 'Estimate effort', 'Which agents should work on this?'];
  if (lower.includes('code') || lower.includes('function') || lower.includes('implement') || lower.includes('refactor'))
    return ['Can you refactor this?', 'Add tests for this', 'Explain this implementation'];
  return ['Tell me more', 'What are the next steps?', 'Can you show me an example?'];
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const SUGGESTION_CATEGORIES = [
  {
    id: 'develop',
    label: 'Develop',
    chips: ['Plan a new feature', 'Implement a function', 'Refactor this code', 'Add error handling'],
  },
  {
    id: 'explore',
    label: 'Explore Codebase',
    chips: [
      'Explain the architecture',
      'Show me the project structure',
      'Analyze test coverage',
      'Find unused dependencies',
    ],
  },
  {
    id: 'manage',
    label: 'Manage',
    chips: ['Show active agents', 'List all sessions', 'Check system health', 'View recent changes'],
  },
  {
    id: 'learn',
    label: 'Learn',
    chips: ['What commands are available?', 'How do I add a tool?', 'Show me a tutorial', 'What can Vestara do?'],
  },
];

export const FEATURE_COMMANDS = [
  { cmd: '/explain', desc: 'Explain code or architecture' },
  { cmd: '/plan', desc: 'Plan a new feature or change' },
  { cmd: '/implement', desc: 'Implement a planned change' },
  { cmd: '/verify', desc: 'Verify implementation correctness' },
  { cmd: '/agent', desc: 'Delegate a task to an agent' },
  { cmd: '/memory', desc: 'Query workspace memory' },
];

export const SUGGESTED_PROMPTS = [
  'Build a React dashboard with authentication',
  'Analyze my project architecture',
  'Explain this error and how to fix it',
  'Create an API endpoint pattern',
  'Review this code for improvements',
  'Design a database schema',
];
