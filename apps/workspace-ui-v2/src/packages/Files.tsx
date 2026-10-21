import { FileText, FolderOpen } from 'lucide-react';
import { FILE_FAVOURITES, FILE_ROWS } from './files.fixtures';

export function FilesPkg() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-0 h-full min-h-[400px]">
      <div className="border-r border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] p-2 flex flex-col">
        <div className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)] px-2 py-2">
          FAVOURITES
        </div>
        <div className="space-y-1 flex-1">
          {FILE_FAVOURITES.map((f) => (
            <div
              key={f}
              className="px-2 py-1.5 rounded-[var(--vestara-radius-lg)] hover:bg-[var(--vestara-surface-shell-raised)] text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-secondary)] flex items-center gap-2"
            >
              <FolderOpen size={12} className="text-[var(--vestara-text-shell-muted)]" />
              {f}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="h-9 border-b border-[var(--vestara-border-shell)] px-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--vestara-font-size-caption)] tracking-[0.12em] text-[var(--vestara-accent-shell)]">
              FILES
            </span>
            <span className="text-[length:var(--vestara-font-size-label)] font-medium text-[var(--vestara-text-shell-primary)]">
              Desktop
            </span>
            <span className="text-[length:var(--vestara-font-size-micro)] px-1.5 py-0.5 rounded bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] text-[var(--vestara-text-shell-muted)]">
              {FILE_ROWS.length} items
            </span>
          </div>
        </div>
        <div className="flex-1 p-3 space-y-1 overflow-auto">
          {FILE_ROWS.map((f) => {
            const Icon = f.kind === 'folder' ? FolderOpen : FileText;
            return (
              <div
                key={f.name}
                className="flex items-center gap-2 p-2 rounded-[var(--vestara-radius-lg)] hover:bg-[var(--vestara-surface-shell-raised)]/50"
              >
                <Icon size={14} className="text-[var(--vestara-text-shell-muted)]" />
                <div>
                  <div className="text-[length:var(--vestara-font-size-label)] text-[var(--vestara-text-shell-primary)]">
                    {f.name}
                  </div>
                  <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                    {f.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
