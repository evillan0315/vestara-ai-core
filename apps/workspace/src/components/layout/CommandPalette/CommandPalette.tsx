import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import KeyboardCommandKeyRoundedIcon from '@mui/icons-material/KeyboardCommandKeyRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Command {
  id: string;
  title: string;
  description?: string;
  shortcut?: string;
  path?: string;
}

export const COMMANDS: Command[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Open workspace dashboard',
    path: '/dashboard',
  },
  {
    id: 'operations',
    title: 'Operations Center',
    description: 'Workspace operations',
    path: '/ops',
  },
  {
    id: 'projects',
    title: 'Projects',
    description: 'Browse engineering projects',
    path: '/projects',
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    description: 'Generated artifacts',
    path: '/artifacts',
  },
  {
    id: 'requests',
    title: 'Requests',
    description: 'Incoming implementation requests',
    path: '/requests',
  },
  {
    id: 'agents',
    title: 'Agent Control',
    description: 'Manage AI agents',
    path: '/agents',
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    description: 'Memory & RAG',
    path: '/memory',
  },
  {
    id: 'terminal',
    title: 'Terminal',
    description: 'Integrated terminal',
    path: '/terminal',
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Workspace settings',
    path: '/settings',
  },
];

export default function CommandPalette() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }

      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return COMMANDS;

    const q = query.toLowerCase();

    return COMMANDS.filter((c) => c.title.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-200 bg-black/60 backdrop-blur-sm">
      <div className="mx-auto mt-24 w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Search */}

        <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <SearchRoundedIcon fontSize="small" className="text-zinc-500" />

          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
          />

          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-500">ESC</kbd>
        </div>

        {/* Results */}

        <div className="max-h-125 overflow-auto py-2">
          {results.map((command, index) => (
            <button
              key={command.id}
              onClick={() => {
                if (command.path) navigate(command.path);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-colors ${
                index === selected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
                <ArrowForwardRoundedIcon fontSize="small" />
              </div>

              <div className="flex-1">
                <div className="text-sm font-medium text-white">{command.title}</div>

                <div className="text-xs text-zinc-500">{command.description}</div>
              </div>

              {command.shortcut && (
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
                  {command.shortcut}
                </kbd>
              )}
            </button>
          ))}

          {results.length === 0 && (
            <div className="px-5 py-10 text-center">
              <SearchRoundedIcon className="mx-auto mb-3 text-zinc-700" fontSize="large" />

              <div className="text-sm text-zinc-400">No commands found</div>
            </div>
          )}
        </div>

        {/* Footer */}

        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-950 px-5 py-3 text-xs text-zinc-600">
          <div className="flex items-center gap-2">
            <KeyboardCommandKeyRoundedIcon fontSize="inherit" />
            Ctrl + K
          </div>

          <div>Navigate your entire workspace</div>
        </div>
      </div>
    </div>
  );
}
