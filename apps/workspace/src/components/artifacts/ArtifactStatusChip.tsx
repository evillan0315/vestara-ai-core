import type { ReactNode } from 'react';

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:       { bg: 'bg-zinc-700/40',  text: 'text-zinc-300',   dot: 'bg-zinc-500', label: 'Draft' },
  pending:     { bg: 'bg-amber-400/10', text: 'text-amber-300',  dot: 'bg-amber-400', label: 'Pending' },
  submitted:   { bg: 'bg-amber-400/10', text: 'text-amber-300',  dot: 'bg-amber-400', label: 'Submitted' },
  reviewing:   { bg: 'bg-blue-400/10',  text: 'text-blue-300',   dot: 'bg-blue-400',  label: 'Reviewing' },
  running:     { bg: 'bg-blue-400/10',  text: 'text-blue-300',   dot: 'bg-blue-400',  label: 'Running' },
  active:      { bg: 'bg-blue-400/10',  text: 'text-blue-300',   dot: 'bg-blue-400',  label: 'Active' },
  queued:      { bg: 'bg-zinc-600/30',  text: 'text-zinc-300',   dot: 'bg-zinc-500', label: 'Queued' },
  approved:    { bg: 'bg-green-400/10', text: 'text-green-300',  dot: 'bg-green-400', label: 'Approved' },
  completed:   { bg: 'bg-green-400/10', text: 'text-green-300',  dot: 'bg-green-400', label: 'Completed' },
  passed:      { bg: 'bg-green-400/10', text: 'text-green-300',  dot: 'bg-green-400', label: 'Passed' },
  rejected:    { bg: 'bg-red-400/10',   text: 'text-red-300',    dot: 'bg-red-400',   label: 'Rejected' },
  failed:      { bg: 'bg-red-400/10',   text: 'text-red-300',    dot: 'bg-red-400',   label: 'Failed' },
  archived:    { bg: 'bg-zinc-700/30',  text: 'text-zinc-500',   dot: 'bg-zinc-600', label: 'Archived' },
  skipped:     { bg: 'bg-zinc-700/30',  text: 'text-zinc-500',   dot: 'bg-zinc-600', label: 'Skipped' },
};

const DEFAULT_STYLE = { bg: 'bg-zinc-800', text: 'text-zinc-400', dot: 'bg-zinc-600', label: 'Unknown' };

export default function ArtifactStatusChip({ status, dot = true }: { status: string; dot?: boolean }) {
  const s = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
      {s.label}
    </span>
  );
}
