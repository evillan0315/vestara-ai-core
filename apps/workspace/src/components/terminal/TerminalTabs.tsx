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
  if (status === 'connecting') return 'text-amber-400';
  if (status === 'disconnected' || status === 'error') return 'text-red-400';
  if (process === 'running') return 'text-amber-400';
  return 'text-green-500';
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
    <div className="flex items-center h-9 bg-zinc-900 border-b border-zinc-800/60 overflow-x-auto shrink-0">
      <div className="flex items-center flex-1 min-w-0">
        {sessions.map((session) => {
          const isActive = session.id === activeId;
          return (
            <div
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={`group flex items-center gap-1.5 px-3 h-full cursor-pointer border-r border-zinc-800/40 transition-colors shrink-0 max-w-[180px] ${
                isActive
                  ? 'bg-zinc-950 border-t-2 border-t-amber-500/70 text-zinc-200'
                  : 'bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
              }`}
              onDoubleClick={() => {
                setEditingId(session.id);
                setEditValue(session.name);
              }}
            >
              <span className={`text-[9px] ${statusColor(session.status, session.processStatus)} shrink-0`}>
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
                  className="bg-zinc-800 border border-zinc-600 rounded text-[11px] px-1 py-0 text-zinc-200 outline-none w-24"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-[11px] font-mono truncate">{session.name}</span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all cursor-pointer shrink-0 ml-auto"
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
        className="shrink-0 px-2.5 h-full flex items-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors cursor-pointer border-l border-zinc-800/40"
        title="New terminal"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
