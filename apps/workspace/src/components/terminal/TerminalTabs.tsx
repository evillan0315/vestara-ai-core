import { useEffect, useRef, useState } from 'react';
import type { ProcessStatus, SessionStatus, TerminalSession } from './types';

interface TerminalTabsProps {
  sessions: TerminalSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
}

function statusIcon(status: SessionStatus, process: ProcessStatus): string {
  if (status === 'connecting') return '⟳';
  if (status === 'disconnected' || status === 'error') return '×';
  if (process === 'running') return '⟳';
  return '●';
}

function statusColor(status: SessionStatus, process: ProcessStatus): string {
  if (status === 'connecting') return 'text-(--vestara-status-pending)';
  if (status === 'disconnected' || status === 'error') return 'text-(--vestara-status-error)';
  if (process === 'running') return 'text-(--vestara-status-running)';
  return 'text-(--vestara-status-active)';
}

export function TerminalTabs({ sessions, activeId, onSelect, onClose, onAdd, onRename }: TerminalTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  return (
    <div className="flex items-center h-9 bg-(--vestara-surface-panel) border-b border-(--vestara-border-default) overflow-x-auto shrink-0">
      <div className="flex items-center flex-1 min-w-0">
        {sessions.map((session) => {
          const isActive = session.id === activeId;
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`group flex items-center gap-1.5 px-3 h-full cursor-pointer border-r border-(--vestara-border-subtle) transition-colors shrink-0 max-w-[180px] ${
                isActive
                  ? 'bg-(--vestara-surface-panel-raised) border-t-2 border-t-(--vestara-accent-primary) text-(--vestara-text-primary)'
                  : 'bg-(--vestara-surface-panel) text-(--vestara-text-secondary) hover:bg-(--vestara-surface-interactive) hover:text-(--vestara-text-primary)'
              }`}
              onDoubleClick={() => {
                setEditingId(session.id);
                setEditValue(session.name);
              }}
            >
              {session.processStatus === 'running' && (
                <span className="flex items-end gap-[1px] h-3 shrink-0">
                  {[3, 5, 4, 6].map((h, i) => (
                    <span key={i} className="w-[2px] rounded-sm bg-(--vestara-accent) transition-all"
                      style={{ height: `${h}px`, opacity: 0.5 + i * 0.15 }} />
                  ))}
                </span>
              )}
              <span className={`text-sm ${statusColor(session.status, session.processStatus)} shrink-0`}>
                {statusIcon(session.status, session.processStatus)}
              </span>

              {editingId === session.id ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue.trim()) onRename(session.id, editValue.trim());
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editValue.trim()) onRename(session.id, editValue.trim());
                      setEditingId(null);
                    }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="bg-(--vestara-surface-panel-raised) border border-(--vestara-accent-border-active) rounded text-sm px-1 py-0 text-(--vestara-text-primary) outline-none w-24"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-sm font-mono truncate">{session.name}</span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-(--vestara-text-muted) hover:text-(--vestara-text-primary) transition-all cursor-pointer shrink-0 ml-auto"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <button
        onClick={onAdd}
        className="shrink-0 px-2.5 h-full flex items-center text-(--vestara-text-secondary) hover:text-(--vestara-text-primary) hover:bg-(--vestara-surface-interactive) transition-colors cursor-pointer border-l border-(--vestara-border-subtle)"
        title="New terminal"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
