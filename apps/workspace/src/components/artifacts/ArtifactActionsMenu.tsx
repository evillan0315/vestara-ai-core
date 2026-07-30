import { useCallback, useEffect, useRef, useState } from 'react';

export interface ActionItem {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  onClick: () => void;
}

interface Props {
  actions: ActionItem[];
}

export default function ArtifactActionsMenu({ actions }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', keyHandler); };
  }, [open]);

  const handleAction = useCallback((action: ActionItem) => {
    setOpen(false);
    action.onClick();
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all cursor-pointer"
        aria-label="Artifact actions"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-8 z-50 min-w-[160px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((action, i) => (
            <div key={action.id}>
              {action.divider && i > 0 && <div className="mx-2 my-1 border-t border-zinc-700" />}
              <button
                onClick={() => handleAction(action)}
                disabled={action.disabled}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  action.danger ? 'text-red-400 hover:bg-red-400/10' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {action.icon && <span className="w-4 text-center text-[11px]">{action.icon}</span>}
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
