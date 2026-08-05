import type { OpenCodeSessionView } from '../../lib/opencode';
import { OpenCodeSessionActions } from './OpenCodeSessionActions';
import { OpenCodeSessionStatusBadge } from './OpenCodeSessionStatusBadge';

interface OpenCodeSessionTableProps {
  sessions: OpenCodeSessionView[];
  onRename: (session: OpenCodeSessionView, title: string) => void;
  onDelete: (session: OpenCodeSessionView) => void;
  onAbort?: (session: OpenCodeSessionView) => void;
  abortedIds?: ReadonlySet<string>;
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function OpenCodeSessionTable({ sessions, onRename, onDelete, onAbort, abortedIds }: OpenCodeSessionTableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-(--vestara-text-muted) border-b border-(--vestara-accent-border)">
            <th className="py-2 pr-3 font-medium">Session</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Agent</th>
            <th className="py-2 pr-3 font-medium">Updated</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} className="border-b border-(--vestara-accent-border) hover:bg-zinc-900/60">
              <td className="py-2 pr-3">
                <div className="text-(--vestara-text) font-medium truncate max-w-[260px]">{session.title}</div>
                <div className="text-[9px] font-mono text-(--vestara-text-muted)">{session.id}</div>
                {session.parentID && (
                  <div className="text-[9px] text-(--vestara-text-dim)">child of {session.parentID.slice(0, 18)}…</div>
                )}
              </td>
              <td className="py-2 pr-3">
                <OpenCodeSessionStatusBadge status={session.status} />
              </td>
              <td className="py-2 pr-3 text-(--vestara-text-2)">{session.agent ?? '—'}</td>
              <td className="py-2 pr-3 text-(--vestara-text-muted)">
                {timeAgo(session.updatedAt ?? session.createdAt)}
              </td>
              <td className="py-2">
                <OpenCodeSessionActions
                  session={session}
                  onRename={(title) => onRename(session, title)}
                  onDelete={() => onDelete(session)}
                  onAbort={onAbort ? () => onAbort(session) : undefined}
                  aborted={abortedIds?.has(session.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
