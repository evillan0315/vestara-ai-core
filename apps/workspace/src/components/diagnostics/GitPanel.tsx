/**
 * Git tab — repository status for the current workspace.
 */

import { useDiagnostics } from './DiagnosticsContext';

export function GitPanel() {
  const { git, refreshGit } = useDiagnostics();
  if (!git) return <p className="diag-empty">Loading git status…</p>;

  if (!git.available) {
    return (
      <div className="diag-card diag-card-body">
        <div className="diag-section-title">Git</div>
        <p className="diag-empty">{git.error}</p>
      </div>
    );
  }

  const items: Array<[string, React.ReactNode]> = [
    [
      'Branch',
      <span key="b" className="font-mono text-(--vestara-accent)">
        {git.branch}
      </span>,
    ],
    [
      'HEAD',
      <code key="h" className="diag-code-inline">
        {git.head}
      </code>,
    ],
    ['Last commit', git.lastCommit ?? '—'],
    ['Modified', git.modified],
    ['Staged', git.staged],
    ['Untracked', git.untracked],
    [
      'Conflicts',
      git.conflicts > 0 ? (
        <span key="c" className="text-(--vestara-red)">
          {git.conflicts}
        </span>
      ) : (
        0
      ),
    ],
    ['Ahead / Behind', git.ahead === null ? 'no upstream' : `${git.ahead} / ${git.behind}`],
    [
      'State',
      git.dirty ? (
        <span key="d" className="text-(--vestara-amber)">
          dirty
        </span>
      ) : (
        <span key="d2" className="text-(--vestara-green)">
          clean
        </span>
      ),
    ],
  ];

  return (
    <div className="diag-card diag-card-body">
      <div className="flex items-center justify-between mb-2">
        <div className="diag-section-title">Repository Status</div>
        <button type="button" className="diag-btn" onClick={refreshGit}>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-1 border-b border-zinc-800/60">
            <span className="text-[11px] text-zinc-500">{label}</span>
            <span className="text-[11.5px] text-zinc-200">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
