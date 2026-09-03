import type { FC } from 'react';

/**
 * Status badge color resolution.
 *
 * Maps agent status strings to Tailwind classes.
 * This is presentation logic — the status value comes from the backend.
 */
function statusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case 'active':
      return { bg: 'bg-green-400/10', text: 'text-green-400' };
    case 'disabled':
      return { bg: 'bg-zinc-800', text: 'text-(--vestara-text-2)' };
    case 'unregistered':
      return { bg: 'bg-(--vestara-accent-bg)', text: 'text-zinc-700' };
    default:
      return { bg: 'bg-zinc-800', text: 'text-(--vestara-text-2)' };
  }
}

export interface AgentStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

/**
 * Small colored status badge for agent display.
 *
 * Used in AgentCard, AgentSummary, and any future agent surface.
 */
export const AgentStatusBadge: FC<AgentStatusBadgeProps> = ({ status, size = 'sm' }) => {
  const s = statusBadge(status);
  const sizeClasses = size === 'md' ? 'text-[9px] px-2 py-0.5' : 'text-[8px] px-1.5 py-0.5';
  return (
    <span className={`${sizeClasses} rounded uppercase font-medium ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
};
