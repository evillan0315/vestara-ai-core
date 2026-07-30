import { useCallback, useEffect, useRef, useState } from 'react';
import JsonTreeView from '../components/JsonTreeView';
import type { ApiEndpoint, TabData, EnvironmentVars, TestResult, HistoryItem } from './ApiBuilder/types';
import { createTab, loadTabs, saveTabs, loadEnv, saveEnv } from './ApiBuilder/persistence';
import { generateCurl, generateFetch, generatePython } from './ApiBuilder/codeGenerators';
import { LatencyChart } from './ApiBuilder/charts/LatencyChart';
import { MethodChart } from './ApiBuilder/charts/MethodChart';
import Pagination from '../components/Pagination';

const MAX_HISTORY = 50;

export default function ApiBuilderPage() {
  const [tabs, setTabs] = useState<TabData[]>(loadTabs);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || '');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSnippets, setShowSnippets] = useState(false);
  const [viewMode, setViewMode] = useState<'raw' | 'tree'>('tree');
  const [envOpen, setEnvOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 8;
  const [envVars, setEnvVars] = useState<EnvironmentVars>(loadEnv);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const newTabInputRef = useRef<HTMLInputElement>(null);

  // ── Active tab helpers ──────────────────────────────────

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeIdx = tabs.findIndex((t) => t.id === activeTabId);

  /** Update the active tab with partial data and persist. */
  const updateActive = useCallback((patch: Partial<TabData>) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === activeTabId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      saveTabs(next);
      return next;
    });
  }, [activeTabId]);

  /** Direct setter for the whole tabs array (for operations like add/close). */
  const setTabsAndPersist = useCallback((fn: (prev: TabData[]) => TabData[]) => {
    setTabs((prev) => {
      const next = fn(prev);
      saveTabs(next);
      return next;
    });
  }, []);

  // ── Load endpoints on mount ─────────────────────────────

  useEffect(() => {
    fetch('/api/routes')
      .then((r) => (r.ok ? r.json() : { routes: [] }))
      .then((data) => setEndpoints(data.routes || []))
      .catch(() => {});
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to send
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (activeTab?.url) testEndpoint();
      }
      // Ctrl+T or Cmd+T to new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        addTab();
      }
      // Ctrl+W or Cmd+W to close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (tabs.length > 1) closeTab(activeTabId);
      }
      // Escape to clear current result
      if (e.key === 'Escape') {
        updateActive({ result: { status: 'success' }, body: '', headers: '' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Tab operations ──────────────────────────────────────

  const addTab = useCallback(() => {
    const tab = createTab();
    setTabsAndPersist((prev) => {
      const next = [...prev, tab];
      // Focus the new tab name input after render
      setTimeout(() => newTabInputRef.current?.focus(), 50);
      return next;
    });
    setActiveTabId(tab.id);
  }, [setTabsAndPersist]);

  const closeTab = useCallback((id: string) => {
    setTabsAndPersist((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      // If closing the active tab, switch to neighbor
      if (id === activeTabId) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      }
      return next;
    });
  }, [activeTabId, setTabsAndPersist]);

  const renameTab = useCallback((id: string, name: string) => {
    setTabsAndPersist((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t)),
    );
  }, [setTabsAndPersist]);

  // ── Computed ────────────────────────────────────────────

  const filteredEndpoints = endpoints.filter(
    (endpoint) =>
      endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      endpoint.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      endpoint.method.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const resolvedUrl = activeTab?.url?.startsWith('http')
    ? activeTab.url
    : activeTab?.url
      ? `${envVars.baseUrl || 'http://localhost:3001'}${activeTab.url}`
      : '';

  // ── Test execution ──────────────────────────────────────

  const testEndpoint = useCallback(async () => {
    if (!activeTab) return;
    updateActive({ result: { status: 'loading' } });
    const start = performance.now();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (envVars.authToken) headers['Authorization'] = `Bearer ${envVars.authToken}`;

      if (activeTab.headers) {
        try {
          const customHeaders = JSON.parse(activeTab.headers);
          Object.assign(headers, customHeaders);
        } catch { /* invalid JSON — skip */ }
      }

      let body: string | undefined;
      if (activeTab.method !== 'GET' && activeTab.body) {
        body = activeTab.body;
      }

      const response = await fetch(resolvedUrl, {
        method: activeTab.method,
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => null);
      const latency = Math.round(performance.now() - start);

      const result: TestResult = {
        status: response.ok ? 'success' : 'error',
        data,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        latency,
      };

      updateActive({ result });

      // Persist to per-tab history
      const item: HistoryItem = {
        timestamp: new Date().toISOString(),
        request: { url: resolvedUrl, method: activeTab.method, headers, body },
        response: data,
        status: response.ok ? 'success' : 'error',
        latency,
      };
      updateActive({
        history: [item, ...(activeTab?.history || [])].slice(0, MAX_HISTORY),
      });
    } catch (error) {
      updateActive({
        result: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      });
    }
  }, [activeTab, resolvedUrl, envVars.authToken, updateActive]);

  // ── Helpers ─────────────────────────────────────────────

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const useTemplate = (endpoint: ApiEndpoint) => {
    setSelectedEndpoint(endpoint);
    updateActive({
      url: endpoint.path,
      method: endpoint.method,
      body: endpoint.body ? JSON.stringify(endpoint.body, null, 2) : '',
      result: { status: 'success' },
    });
  };

  const restoreHistory = (item: HistoryItem) => {
    updateActive({
      url: item.request.url.replace(/^https?:\/\/[^/]+/, ''),
      method: item.request.method as TabData['method'],
      body: item.request.body
        ? (() => { try { return JSON.stringify(JSON.parse(item.request.body), null, 2); } catch { return item.request.body; } })()
        : '',
      result: { status: 'success', data: item.response, latency: item.latency },
    });
    if (Object.keys(item.request.headers).length > 1) {
      const { 'Content-Type': _ct, Authorization: _auth, ...rest } = item.request.headers;
      if (Object.keys(rest).length) updateActive({ headers: JSON.stringify(rest, null, 2) });
    }
  };

  const clearHistory = () => {
    updateActive({ history: [] });
  };

  // ── Method color ────────────────────────────────────────

  const methodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-green-400/10 text-green-400';
      case 'POST': return 'bg-blue-400/10 text-blue-400';
      case 'PUT': return 'bg-amber-400/10 text-amber-400';
      case 'DELETE': return 'bg-red-400/10 text-red-400';
      case 'PATCH': return 'bg-purple-400/10 text-purple-400';
      default: return 'bg-(--vestara-text-dim)/10 text-(--vestara-text-dim)';
    }
  };

  // ── Render: snippet block ───────────────────────────────

  const renderSnippet = (title: string, code: string) => (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-(--vestara-text-muted)">{title}</span>
        <button
          onClick={() => copyToClipboard(code)}
          className="text-xs text-(--vestara-accent) hover:underline cursor-pointer"
        >
          Copy
        </button>
      </div>
      <pre className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded p-3 text-xs text-(--vestara-text) font-mono overflow-x-auto whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );

  // ── Render: test result ─────────────────────────────────

  const renderTestResult = () => {
    if (!activeTab) return null;
    const { result } = activeTab;

    if (result.status === 'loading') {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-(--vestara-text-muted)">Testing...</div>
        </div>
      );
    }
    if (result.status === 'success' || result.status === 'error') {
      const isSuccess = result.status === 'success';
      return (
        <div>
          {/* Status bar */}
          <div className="flex items-center justify-between mb-3 p-3 rounded-lg border-l-4 border-(--vestara-accent-border) bg-(--vestara-accent-bg)">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`text-sm font-medium ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                {isSuccess ? 'Success' : 'Error'}
              </span>
              {result.latency && <span className="text-xs text-(--vestara-text-muted)">({result.latency}ms)</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode((p) => (p === 'raw' ? 'tree' : 'raw'))}
                className={`text-xs transition-colors cursor-pointer ${
                  viewMode === 'tree' ? 'text-(--vestara-accent)' : 'text-(--vestara-text-muted) hover:text-(--vestara-text)'
                }`}
              >
                {viewMode === 'tree' ? 'Tree' : 'Raw'}
              </button>
              <button
                onClick={() => setShowSnippets((p) => !p)}
                className="text-xs text-(--vestara-text-muted) hover:text-(--vestara-text) transition-colors cursor-pointer"
              >
                {showSnippets ? 'Hide Snippets' : 'Snippets'}
              </button>
              <button
                onClick={() => copyToClipboard(JSON.stringify(result.data, null, 2))}
                className="text-xs text-(--vestara-text-muted) hover:text-(--vestara-text) transition-colors cursor-pointer"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Code snippets */}
          {showSnippets && (
            <div className="mb-4 p-4 rounded-lg border border-(--vestara-accent-border) bg-(--vestara-accent-bg)">
              <h4 className="text-xs font-semibold text-(--vestara-text) mb-3">Code Snippets</h4>
              {renderSnippet('cURL', generateCurl(activeTab.method, resolvedUrl, { 'Content-Type': 'application/json' }, activeTab.body))}
              {renderSnippet('fetch', generateFetch(activeTab.method, resolvedUrl, { 'Content-Type': 'application/json' }, activeTab.body))}
              {renderSnippet('Python (requests)', generatePython(activeTab.method, resolvedUrl, { 'Content-Type': 'application/json' }, activeTab.body))}
            </div>
          )}

          {/* Error */}
          {result.error && (
            <div className="p-3 bg-red-400/5 border border-red-400/20 rounded-lg text-xs text-red-400 font-mono mb-3">
              {result.error}
            </div>
          )}

          {/* Response body */}
          {result.data && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-(--vestara-text-muted)">Response Body</span>
                <span className="text-[10px] text-(--vestara-text-muted)">
                  {viewMode === 'tree' ? 'Collapsible tree view' : 'Raw JSON'}
                </span>
              </div>
              {viewMode === 'tree' ? (
                <JsonTreeView data={result.data} defaultExpandDepth={2} label="response" />
              ) : (
                <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3 max-h-96 overflow-y-auto">
                  <pre className="text-xs text-(--vestara-text) whitespace-pre-wrap font-mono">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-(--vestara-text-muted)">
          Enter endpoint details and test — <span className="text-(--vestara-text-muted)">Ctrl+Enter</span> to send
        </div>
      </div>
    );
  };

  // ── Main render ─────────────────────────────────────────

  if (!activeTab) {
    return (
      <div className="w-full px-4 py-12 text-center">
        <p className="text-(--vestara-text-muted) mb-4">No tabs open</p>
        <button
          onClick={addTab}
          className="px-4 py-2 bg-(--vestara-accent) text-white rounded-lg text-sm cursor-pointer"
        >
          New Tab
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-(--vestara-text) mb-1">API Builder</h1>
          <p className="text-sm text-(--vestara-text-muted)">
            Explore and test Vestara API endpoints. <span className="text-(--vestara-text-muted)">Ctrl+Enter</span> to send,{' '}
            <span className="text-(--vestara-text-muted)">Ctrl+T</span> new tab, <span className="text-(--vestara-text-muted)">Ctrl+W</span> close.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEnvOpen((p) => !p)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
              envVars.baseUrl || envVars.authToken
                ? 'border-(--vestara-accent)/50 text-(--vestara-accent)'
                : 'border-(--vestara-accent-border) text-(--vestara-text-muted)'
            }`}
          >
            {envVars.baseUrl ? 'Env: Active' : 'Environment'}
          </button>
          <button
            onClick={() => fetch('/api/routes').then((r) => r.ok && r.json()).then((d) => setEndpoints(d.routes || [])).catch(() => {})}
            className="px-3 py-1.5 rounded-lg text-xs border border-(--vestara-accent-border) text-(--vestara-text-muted) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
          >
            Reload
          </button>
        </div>
      </div>

      {/* Environment variables panel */}
      {envOpen && (
        <div className="mb-4 p-4 rounded-xl border border-(--vestara-accent-border) bg-(--vestara-accent-bg)">
          <h3 className="text-sm font-semibold text-(--vestara-text) mb-3">Environment Variables</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs text-(--vestara-text-muted) mb-1">Base URL</label>
              <input
                type="text"
                value={envVars.baseUrl}
                onChange={(e) => setEnvVars((p) => { const n = { ...p, baseUrl: e.target.value }; saveEnv(n); return n; })}
                placeholder="http://localhost:3001"
                className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-3 py-2 text-xs text-(--vestara-text) placeholder-(--vestara-text-muted) outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-(--vestara-text-muted) mb-1">Auth Token</label>
              <input
                type="password"
                value={envVars.authToken}
                onChange={(e) => setEnvVars((p) => { const n = { ...p, authToken: e.target.value }; saveEnv(n); return n; })}
                placeholder="Bearer token (optional)"
                className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-3 py-2 text-xs text-(--vestara-text) placeholder-(--vestara-text-muted) outline-none font-mono"
              />
            </div>
          </div>
          <p className="text-xs text-(--vestara-text-muted)">Tokens auto-inject as <code className="text-(--vestara-text)">Authorization: Bearer &lt;token&gt;</code> header.</p>
        </div>
      )}

      {/* Method usage chart */}
      <div className="mb-4 max-w-md">
        <MethodChart tabs={tabs} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Endpoint list */}
        <div className="lg:col-span-1">
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl h-full">
            <div className="p-4 border-b border-(--vestara-accent-border)">
              <h2 className="text-sm font-semibold text-(--vestara-text) mb-3">Endpoints</h2>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search endpoints..."
                className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-3 py-2 text-xs text-(--vestara-text) placeholder-(--vestara-text-muted) outline-none"
              />
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {filteredEndpoints.map((endpoint, index) => (
                <button
                  key={`${endpoint.method}-${endpoint.path}-${index}`}
                  onClick={() => setSelectedEndpoint(endpoint)}
                  className={`w-full text-left p-4 border-b border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer ${
                    selectedEndpoint?.path === endpoint.path ? 'bg-(--color-zinc-800)' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium shrink-0 ${methodColor(endpoint.method)}`}>
                      {endpoint.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-(--vestara-text) truncate">{endpoint.path}</div>
                      <div className="text-xs text-(--vestara-text-muted) truncate mt-0.5">{endpoint.description}</div>
                      {endpoint.requiresAuth && <div className="text-xs text-amber-400 mt-1">Auth required</div>}
                    </div>
                  </div>
                </button>
              ))}
              {filteredEndpoints.length === 0 && (
                <div className="p-8 text-center text-sm text-(--vestara-text-muted)">No endpoints found</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Tab bar + request builder + response */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Tab bar */}
          <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl overflow-hidden">
            <div className="flex items-center border-b border-(--vestara-accent-border) bg-(--vestara-accent-bg) overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`group flex items-center gap-1 px-3 py-2 text-xs border-r border-(--vestara-accent-border) cursor-pointer transition-colors shrink-0 min-w-0 ${
                    tab.id === activeTabId
                      ? 'bg-(--color-zinc-800) text-(--vestara-text) border-b-2 border-b-(--vestara-accent) mb-[-1px]'
                      : 'text-(--vestara-text-muted) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg)'
                  }`}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  {/* Inline rename */}
                  <input
                    ref={tab.id === activeTabId ? newTabInputRef : undefined}
                    className={`bg-transparent border-none outline-none text-xs w-20 min-w-0 ${
                      tab.id === activeTabId ? 'text-(--vestara-text)' : 'text-(--vestara-text-muted)'
                    }`}
                    value={tab.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => renameTab(tab.id, e.target.value)}
                  />
                  {tabs.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                      className="text-(--vestara-text-muted) hover:text-red-400 transition-colors cursor-pointer text-xs ml-1 opacity-0 group-hover:opacity-100 shrink-0"
                      title="Close tab"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addTab}
                className="px-3 py-2 text-xs text-(--vestara-text-muted) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer shrink-0"
                title="New tab (Ctrl+T)"
              >
                +
              </button>
            </div>

            {/* Request builder (inside tab bar container) */}
            {selectedEndpoint ? (
              <div>
                <div className="p-4 border-b border-(--vestara-accent-border)">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-(--vestara-text) flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono ${methodColor(selectedEndpoint.method)}`}>
                          {selectedEndpoint.method}
                        </span>
                        <span className="text-(--vestara-text) truncate font-mono">{selectedEndpoint.path}</span>
                      </h2>
                      <p className="text-xs text-(--vestara-text-muted) mt-1">{selectedEndpoint.description}</p>
                    </div>
                    <button
                      onClick={() => useTemplate(selectedEndpoint)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-(--vestara-accent-border) text-(--vestara-text-muted) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
                    >
                      Load
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* URL */}
                  <div>
                    <label className="block text-xs font-medium text-(--vestara-text-muted) mb-1">URL</label>
                    <input
                      ref={urlInputRef}
                      type="text"
                      value={activeTab.url}
                      onChange={(e) => updateActive({ url: e.target.value })}
                      placeholder="/api/..."
                      className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-3 py-2 text-xs text-(--vestara-text) placeholder-(--vestara-text-muted) outline-none font-mono"
                    />
                    {envVars.baseUrl && (
                      <p className="text-xs text-(--vestara-text-muted) mt-1">
                        Resolves to: <span className="text-(--vestara-text)">{resolvedUrl}</span>
                      </p>
                    )}
                  </div>

                  {/* Method */}
                  <div>
                    <label className="block text-xs font-medium text-(--vestara-text-muted) mb-1">Method</label>
                    <div className="flex gap-2 flex-wrap">
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                        <button
                          key={method}
                          onClick={() => updateActive({ method: method as TabData['method'] })}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                            activeTab.method === method
                              ? 'bg-(--color-zinc-700) text-(--vestara-text)'
                              : 'text-(--vestara-text-muted) hover:text-(--vestara-text)'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Request body */}
                  <div>
                    <label className="block text-xs font-medium text-(--vestara-text-muted) mb-1">Body <span className="font-normal text-(--vestara-text-muted)">(JSON)</span></label>
                    <textarea
                      value={activeTab.body}
                      onChange={(e) => updateActive({ body: e.target.value })}
                      placeholder='{"key": "value"}'
                      className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-3 py-2 text-xs text-(--vestara-text) placeholder-(--vestara-text-muted) outline-none font-mono h-24 resize-none"
                    />
                  </div>

                  {/* Headers */}
                  <div>
                    <label className="block text-xs font-medium text-(--vestara-text-muted) mb-1">Headers <span className="font-normal text-(--vestara-text-muted)">(JSON)</span></label>
                    <textarea
                      value={activeTab.headers}
                      onChange={(e) => updateActive({ headers: e.target.value })}
                      placeholder='{"X-Custom": "value"}'
                      className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-3 py-2 text-xs text-(--vestara-text) placeholder-(--vestara-text-muted) outline-none font-mono h-20 resize-none"
                    />
                  </div>

                  {/* Send button */}
                  <button
                    onClick={testEndpoint}
                    disabled={activeTab.result.status === 'loading' || !activeTab.url}
                    className="w-full px-4 py-3 bg-(--vestara-accent) text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {activeTab.result.status === 'loading' ? (
                      <>Testing...</>
                    ) : (
                      <>Send Request <span className="text-xs opacity-60">Ctrl+Enter</span></>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-(--vestara-text-muted)">
                Select an endpoint from the list to begin
              </div>
            )}
          </div>

          {/* Response */}
          {selectedEndpoint && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl">
              <div className="p-4 border-b border-(--vestara-accent-border)">
                <h3 className="text-sm font-semibold text-(--vestara-text)">Response</h3>
              </div>
              <div className="p-4">
                {renderTestResult()}
              </div>
            </div>
          )}

          {/* Latency chart */}
          <LatencyChart history={activeTab.history} />

          {/* Per-tab Request History */}
          {activeTab.history.length > 0 && (
            <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-xl">
              <div className="p-4 border-b border-(--vestara-accent-border) flex items-center justify-between">
                <h3 className="text-sm font-semibold text-(--vestara-text)">
                  Request History <span className="text-(--vestara-text-muted) font-normal">({activeTab.history.length})</span>
                </h3>
                <button onClick={clearHistory} className="text-xs text-(--vestara-text-muted) hover:text-red-400 transition-colors cursor-pointer">Clear</button>
              </div>
              <div>
                {activeTab.history.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE).map((item, index) => (
                  <button key={index} onClick={() => restoreHistory(item)}
                    className="w-full text-left p-3 border-b border-(--vestara-accent-border) last:border-b-0 hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${methodColor(item.request.method)}`}>{item.request.method}</span>
                        <span className="text-xs text-(--vestara-text) truncate max-w-[200px] font-mono">{item.request.url.replace(/^https?:\/\/[^/]+/, '')}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-(--vestara-text-muted)">{item.latency}ms</span>
                        <span className="text-[10px] text-(--vestara-text-muted)">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-(--vestara-accent-border)">
                <Pagination current={historyPage} total={activeTab.history.length} pageSize={HISTORY_PAGE_SIZE} onChange={setHistoryPage} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
