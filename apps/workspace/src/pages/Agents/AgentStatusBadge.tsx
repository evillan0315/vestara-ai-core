import type { FC } from 'react';

function statusBadge(status: string): { bg: string; text: string; dot: string } {
  if (status === 'active') return { bg: 'bg-green-400/10', text: 'text-green-400', dot: 'bg-green-500' };
  if (status === 'disabled') return { bg: 'bg-zinc-800', text: 'text-(--vestara-text-2)', dot: 'bg-zinc-600' };
  if (status === 'unregistered') return { bg: 'bg-(--vestara-accent-bg)', text: 'text-zinc-700', dot: 'bg-zinc-700' };
  return { bg: 'bg-zinc-800', text: 'text-(--vestara-text-2)', dot: 'bg-zinc-600' };
}

export const AgentStatusBadge: FC<{ status: string }> = ({ status }) => {
  const s = statusBadge(status);
  return <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${s.bg} ${s.text}`}>{status}</span>;
};
