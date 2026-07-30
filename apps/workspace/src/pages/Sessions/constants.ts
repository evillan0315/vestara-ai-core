export const STATUS_DOT: Record<string, string> = {
  created: 'bg-zinc-600',
  planning: 'bg-blue-400',
  executing: 'bg-amber-400',
  verifying: 'bg-purple-400',
  reviewing: 'bg-cyan-400',
  completed: 'bg-green-500',
  failed: 'bg-red-400',
  running: 'bg-green-400',
  queued: 'bg-amber-400',
};

export const STATUS_COLORS: Record<string, string> = {
  created: '#52525b',
  planning: '#60a5fa',
  executing: '#fbbf24',
  verifying: '#a78bfa',
  reviewing: '#22d3ee',
  completed: '#22c55e',
  failed: '#f87171',
  running: '#22c55e',
  queued: '#fbbf24',
};

export function statusBadge(status: string): { bg: string; text: string } {
  if (status === 'completed') return { bg: 'bg-green-400/10', text: 'text-green-400' };
  if (status === 'failed') return { bg: 'bg-red-400/10', text: 'text-red-400' };
  if (status === 'running' || status === 'queued' || status === 'executing')
    return { bg: 'bg-amber-400/10', text: 'text-amber-400' };
  return { bg: 'bg-zinc-800', text: 'text-zinc-500' };
}
