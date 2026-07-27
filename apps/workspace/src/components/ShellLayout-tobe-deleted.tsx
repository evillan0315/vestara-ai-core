import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Outlet, Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import ConnectionStatus from './ConnectionStatus';

const DRAWER_WIDTH = 240;

const NAV_CATEGORIES = [
  {
    label: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: '◈' },
      { to: '/ops', label: 'Operations', icon: '🎛️' },
    ],
  },
  {
    label: 'Engineering',
    items: [
      { to: '/sessions', label: 'Sessions', icon: '▤' },
      { to: '/artifacts', label: 'Artifacts', icon: '◇' },
      { to: '/projects', label: 'Projects', icon: '📋' },
      { to: '/requests', label: 'Requests', icon: '💡' },
      { to: '/logs', label: 'Logs', icon: '📋' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { to: '/agents', label: 'Agent Control', icon: '☰' },
      { to: '/memory', label: 'Knowledge', icon: '◎' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/chat', label: 'Chat', icon: '💬' },
      { to: '/terminal', label: 'Terminal', icon: '>' },
      { to: '/api-builder', label: 'API Builder', icon: '▌' },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: '⚙️' }],
  },
];

interface Workspace {
  path: string;
  name: string;
  lastOpened: number;
}

function getRecentWorkspaces(): Workspace[] {
  try {
    const stored = localStorage.getItem('vestara-recent-workspaces');
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function addRecentWorkspace(path: string, name: string) {
  const recent = getRecentWorkspaces();
  const filtered = recent.filter((w) => w.path !== path);
  filtered.unshift({ path, name, lastOpened: Date.now() });
  localStorage.setItem('vestara-recent-workspaces', JSON.stringify(filtered.slice(0, 10)));
}

export default function ShellLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [recentWorkspaces, setRecentWorkspaces] = useState<Workspace[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { actor } = useAuth();
  const { mode, resolved, toggle } = useTheme();
  const pendingG = useRef(false);

  // Keyboard navigation: g + key, ? for help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === '?') {
        setShowShortcuts((s) => !s);
        return;
      }
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        pendingG.current = true;
        setTimeout(() => {
          pendingG.current = false;
        }, 800);
        return;
      }
      if (pendingG.current) {
        pendingG.current = false;
        const navMap: Record<string, string> = {
          d: '/dashboard',
          o: '/ops',
          p: '/projects',
          a: '/agents',
          s: '/sessions',
          r: '/artifacts',
          m: '/memory',
          c: '/chat',
          t: '/terminal',
          b: '/api-builder',
          q: '/settings',
        };
        const path = navMap[e.key.toLowerCase()];
        if (path !== undefined) {
          e.preventDefault();
          navigate(path);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  useEffect(() => {
    setRecentWorkspaces(getRecentWorkspaces());
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWorkspaceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentWorkspace = recentWorkspaces[0]?.name ?? 'vestara-ai-core';

  const pageTitle =
    NAV_CATEGORIES.flatMap((c) => c.items).find((i) => {
      if (i.to === '/dashboard') return location.pathname === '/dashboard';
      return location.pathname.startsWith(i.to);
    })?.label || 'Workspace';

  const navContent = (
    <nav className="flex flex-col h-full">
      {/* Brand + close */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800">
        <span className="text-accent font-bold text-base">Vestara</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="sm:hidden text-zinc-500 hover:text-zinc-300 cursor-pointer text-sm p-1"
          aria-label="Close navigation"
        >
          ✕
        </button>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-2 px-2 space-y-3 overflow-y-auto">
        {NAV_CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <div className="px-3 py-1 text-[9px] font-semibold text-zinc-600 uppercase tracking-wider">{cat.label}</div>
            <div className="space-y-0.5 mt-0.5">
              {cat.items.map((item) => {
                const isActive =
                  location.pathname === item.to || (item.to !== '/dashboard' && location.pathname.startsWith(item.to));
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm sm:text-sm text-[13px] ${isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-800">
        <p className="text-[10px] sm:block hidden text-zinc-700 leading-tight">
          UI consumes Vestara — it does not become Vestara.
        </p>
        <p className="text-[10px] text-zinc-700 mt-1">
          <kbd className="px-1 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[9px] font-mono text-zinc-500">
            ?
          </kbd>{' '}
          shortcuts
        </p>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* App bar */}
      <header className="fixed top-0 left-0 right-0 h-10 border-b shell-header flex items-center px-4 gap-3 z-30">
        {/* Hamburger (mobile) */}
        <button
          className="sm:hidden text-zinc-400 hover:text-zinc-200 p-1"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>

        {/* Workspace Switcher (hidden) */}
        {/* <div className="relative flex items-center" ref={dropdownRef}>
          <button
            onClick={() => setWorkspaceDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
            aria-label="Switch workspace"
          >
            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
            </svg>
            <span className="truncate max-w-[180px]">{currentWorkspace}</span>
            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {workspaceDropdownOpen && (
            <div className="absolute right-0 mt-1 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 py-1">
              <div className="px-3 py-2 border-b border-zinc-800">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Recent Workspaces</p>
              </div>
              {recentWorkspaces.length === 0 ? (
                <div className="px-3 py-4 text-center text-zinc-500 text-sm">
                  No recent workspaces. Run <code className="text-accent">{`vestara open <path>`}</code> to add one.
                </div>
              ) : (
                recentWorkspaces.map((ws) => (
                  <button
                    key={ws.path}
                    onClick={() => {
                      addRecentWorkspace(ws.path, ws.name);
                      setRecentWorkspaces(getRecentWorkspaces());
                      setWorkspaceDropdownOpen(false);
                      window.location.reload();
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-zinc-800 transition-colors ${
                      ws.name === currentWorkspace ? 'text-accent' : 'text-zinc-400'
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                    </svg>
                    <span className="truncate flex-1">{ws.name}</span>
                    <span className="text-xs text-zinc-600 truncate max-w-[120px]">{ws.path}</span>
                  </button>
                ))
              )}
              <div className="border-t border-zinc-800 pt-1">
                <button
                  onClick={() => {
                    setWorkspaceDropdownOpen(false);
                    alert('To open a new workspace:\n1. Open terminal\n2. Run: vestara open /path/to/repo\n3. Refresh this page');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Open new workspace…</span>
                </button>
              </div>
            </div>
          )}
        </div> */}

        <h1 className="flex-1 text-sm font-semibold text-zinc-100 ml-2 sm:ml-4 truncate">{pageTitle}</h1>
        <ConnectionStatus />
        <button
          onClick={toggle}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 cursor-pointer"
          title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme (current: ${mode})`}
        >
          {resolved === 'dark' ? '☀' : '☾'}
        </button>
        <RouterLink to="/login" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {actor}
        </RouterLink>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-20 sm:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-65 max-w-[80vw] shell-sidebar z-20 transform transition-transform duration-200 ease-in-out sm:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden sm:flex shrink-0 border-r shell-sidebar sidebar-width-fixed">
        <div className="sidebar-width-fixed fixed top-14 bottom-0 overflow-y-auto">{navContent}</div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pt-10 min-w-0 flex flex-col" style={{ height: 'calc(100vh)' }}>
        <div
          className="w-full p-2 animate-fade-in flex-1 overflow-y-auto"
          style={{ maxWidth: 'var(--vestara-page-max-width)' }}
        >
          <Outlet />
        </div>
      </main>

      {/* Global Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-zinc-600 hover:text-zinc-400 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">Navigation</div>
              {[
                { keys: 'g d', desc: 'Dashboard' },
                { keys: 'g o', desc: 'Ops Center' },
                { keys: 'g p', desc: 'Projects' },
                { keys: 'g a', desc: 'Agents' },
                { keys: 'g s', desc: 'Sessions' },
                { keys: 'g r', desc: 'Artifacts' },
                { keys: 'g m', desc: 'Memory' },
                { keys: 'g c', desc: 'Chat' },
                { keys: 'g t', desc: 'Terminal' },
                { keys: 'g b', desc: 'API Builder' },
                { keys: 'g q', desc: 'Settings' },
              ].map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{s.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-[10px]">
                    {s.keys}
                  </kbd>
                </div>
              ))}
              <div className="border-t border-zinc-800 my-2" />
              <div className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">General</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Toggle this panel</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-[10px]">
                  ?
                </kbd>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Refresh page</span>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-[10px]">
                  ⌘R
                </kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
