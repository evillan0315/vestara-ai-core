import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import KeyboardCommandKeyRoundedIcon from '@mui/icons-material/KeyboardCommandKeyRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SearchResult {
  id: string;
  title: string;
  description?: string;
  path?: string;
  type: 'page' | 'agent' | 'project' | 'session' | 'request';
  icon?: string;
}

const PAGES: SearchResult[] = [
  { id: 'overview', title: 'Overview', description: 'Workspace overview', path: '/overview', type: 'page' },
  { id: 'dashboard', title: 'Dashboard', description: 'Workspace dashboard', path: '/dashboard', type: 'page' },
  { id: 'activities', title: 'Activities', description: 'Notifications and logs', path: '/activities', type: 'page' },
  { id: 'ops', title: 'Operations Center', description: 'Workspace operations', path: '/ops', type: 'page' },
  { id: 'sessions', title: 'Sessions', description: 'Engineering sessions', path: '/sessions', type: 'page' },
  { id: 'artifacts', title: 'Artifacts', description: 'Generated artifacts', path: '/artifacts', type: 'page' },
  { id: 'projects', title: 'Projects', description: 'Browse engineering projects', path: '/projects', type: 'page' },
  { id: 'requests', title: 'Requests', description: 'Feature requests', path: '/requests', type: 'page' },
  { id: 'agents-page', title: 'Agent Control', description: 'Manage AI agents', path: '/agents', type: 'page' },
  { id: 'knowledge', title: 'Knowledge', description: 'Knowledge graph', path: '/memory', type: 'page' },
  { id: 'terminal', title: 'Terminal', description: 'Integrated terminal', path: '/terminal', type: 'page' },
  { id: 'chat', title: 'Chat', description: 'AI chat', path: '/chat', type: 'page' },
  { id: 'api', title: 'API Builder', description: 'Test REST endpoints', path: '/api-builder', type: 'page' },
  { id: 'settings', title: 'Settings', description: 'Workspace settings', path: '/settings', type: 'page' },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [agents, setAgents] = useState<SearchResult[]>([]);
  const [projects, setProjects] = useState<SearchResult[]>([]);
  const [sessions, setSessions] = useState<SearchResult[]>([]);
  const [requests, setRequests] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, s, r] = await Promise.all([
        fetch('/api/agents').then((r) => r.ok ? r.json() : { agents: [] }).catch(() => ({ agents: [] })),
        fetch('/api/projects').then((r) => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] })),
        fetch('/api/sessions').then((r) => r.ok ? r.json() : { sessions: [] }).catch(() => ({ sessions: [] })),
        fetch('/api/requests').then((r) => r.ok ? r.json() : { requests: [] }).catch(() => ({ requests: [] })),
      ]);
      setAgents((a.agents || []).map((ag: any) => ({
        id: `agent-${ag.id}`, title: ag.name || ag.role, description: `${ag.role} agent · ${ag.status}`,
        path: '/agents', type: 'agent' as const, icon: '🤖',
      })));
      setProjects((p.projects || []).map((pr: any) => ({
        id: `project-${pr.id}`, title: pr.name, description: pr.description || 'Project',
        path: '/projects', type: 'project' as const, icon: '📁',
      })));
      setSessions((s.sessions || []).map((ss: any) => ({
        id: `session-${ss.id}`, title: ss.title || ss.goal || 'Session', description: `Status: ${ss.status}`,
        path: `/sessions/${ss.id}`, type: 'session' as const, icon: '▶',
      })));
      setRequests((r.requests || []).map((rq: any) => ({
        id: `request-${rq.id}`, title: rq.title, description: `${rq.category} · ${rq.status}`,
        path: '/requests', type: 'request' as const, icon: '💡',
      })));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        if (!open) fetchData();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, fetchData]);

  // Also load data when HeaderSearch button is clicked via custom event
  useEffect(() => {
    const handler = () => { setOpen(true); fetchData(); };
    window.addEventListener('open-command-palette', handler);
    return () => window.removeEventListener('open-command-palette', handler);
  }, [fetchData]);

  const allResults = useMemo(() => [...PAGES, ...agents, ...projects, ...sessions, ...requests], [agents, projects, sessions, requests]);

  const results = useMemo(() => {
    if (!query.trim()) return allResults;
    const q = query.toLowerCase();
    return allResults.filter((r) => r.title.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q));
  }, [query, allResults]);

  useEffect(() => { setSelected(0); }, [query]);

  if (!open) return null;

  const typeLabels: Record<string, string> = { page: 'Page', agent: 'Agent', project: 'Project', session: 'Session', request: 'Request' };

  return (
    <div className="fixed inset-0 z-200 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="mx-auto mt-24 w-full max-w-2xl overflow-hidden rounded-2xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-(--vestara-accent-border) px-5 py-4">
          <SearchRoundedIcon fontSize="small" className="text-(--vestara-text-2)" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, agents, projects, sessions..."
            className="flex-1 bg-transparent text-sm text-(--vestara-text) outline-none placeholder-(--vestara-text-dim)" />
          <kbd className="rounded border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-2 py-1 text-[10px] text-(--vestara-text-2)">ESC</kbd>
        </div>

        <div className="max-h-125 overflow-y-auto py-2">
          {loading && results.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-(--vestara-text-muted) animate-pulse">Loading...</div>
          )}
          {results.map((result, index) => (
            <button key={result.id} onClick={() => { if (result.path) navigate(result.path); setOpen(false); }}
              className={`flex w-full items-center gap-4 px-5 py-3 text-left transition-colors ${index === selected ? 'bg-(--vestara-accent-bg)' : 'hover:bg-(--vestara-accent-bg)'}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg) text-sm">
                {result.icon || <ArrowForwardRoundedIcon fontSize="small" className="text-(--vestara-text-2)" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-(--vestara-text) truncate">{result.title}</div>
                <div className="text-xs text-(--vestara-text-2) truncate">{result.description}</div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-(--vestara-accent-bg) text-(--vestara-text-2) uppercase font-medium shrink-0">
                {typeLabels[result.type] || result.type}
              </span>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div className="px-5 py-10 text-center">
              <SearchRoundedIcon className="mx-auto mb-3 text-(--vestara-text-dim)" fontSize="large" />
              <div className="text-sm text-(--vestara-text-2)">No results found</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-5 py-3 text-xs text-(--vestara-text-2)">
          <div className="flex items-center gap-2"><KeyboardCommandKeyRoundedIcon fontSize="inherit" /> Ctrl + K</div>
          <div>Search across your entire workspace</div>
        </div>
      </div>
    </div>
  );
}
