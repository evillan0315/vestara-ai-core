import { useState, useCallback, useEffect } from 'react';

interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  requiresAuth?: boolean;
  body?: Record<string, unknown>;
}

interface TestResult {
  status: 'success' | 'error' | 'loading';
  data?: any;
  error?: string;
  latency?: number;
}

export default function ApiBuilderPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [testUrl, setTestUrl] = useState('');
  const [testMethod, setTestMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [testBody, setTestBody] = useState('');
  const [testHeaders, setTestHeaders] = useState('');
  const [testResult, setTestResult] = useState<TestResult>({ status: 'success' });
  const [responseHistory, setResponseHistory] = useState<Array<{ timestamp: Date; request: any; response: any }>>([]);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/api/routes')
      .then((r) => (r.ok ? r.json() : { routes: [] }))
      .then((data) => setEndpoints(data.routes || []))
      .catch(() => {});
  }, []);

  const filteredEndpoints = endpoints.filter(
    (endpoint) =>
      endpoint.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      endpoint.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      endpoint.method.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const testEndpoint = useCallback(async () => {
    setTestResult({ status: 'loading' });
    const start = performance.now();

    try {
      const url = testUrl.startsWith('http') ? testUrl : `http://localhost:3001${testUrl}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (testHeaders) {
        try {
          const customHeaders = JSON.parse(testHeaders);
          Object.assign(headers, customHeaders);
        } catch (e) {
          console.error('Invalid headers JSON:', e);
        }
      }

      let body: string | undefined;
      if (testMethod !== 'GET' && testBody) {
        try {
          body = JSON.stringify(JSON.parse(testBody));
        } catch (e) {
          body = testBody;
        }
      }

      const requestOptions: RequestInit = {
        method: testMethod,
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      };

      const response = await fetch(url, requestOptions);
      const data = await response.json().catch(() => null);
      const latency = Math.round(performance.now() - start);

      const result: TestResult = {
        status: response.ok ? 'success' : 'error',
        data,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        latency,
      };

      setTestResult(result);

      setResponseHistory((prev) =>
        [
          {
            timestamp: new Date(),
            request: { url, method: testMethod, headers, body },
            response: data,
          },
          ...prev,
        ].slice(0, 20),
      );
    } catch (error) {
      setTestResult({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [testUrl, testMethod, testBody, testHeaders]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const useTemplate = (endpoint: ApiEndpoint) => {
    setSelectedEndpoint(endpoint);
    setTestUrl(endpoint.path);
    setTestMethod(endpoint.method);
    if (endpoint.body) {
      setTestBody(JSON.stringify(endpoint.body, null, 2));
    }
    setTestResult({ status: 'success' });
  };

  const renderTestResult = () => {
    if (testResult.status === 'loading') {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-zinc-600">Testing...</div>
        </div>
      );
    }
    if (testResult.status === 'success' || testResult.status === 'error') {
      const isSuccess = testResult.status === 'success';
      return (
        <div>
          <div
            className={`flex items-center justify-between mb-3 p-3 rounded border-l-4 ${isSuccess ? 'border-l-green-500 bg-green-900/20' : 'border-l-red-500 bg-red-900/20'}`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className={`text-sm font-medium ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                {isSuccess ? 'Success' : 'Error'}
              </div>
              {testResult.latency && <div className="text-xs text-zinc-600">({testResult.latency}ms)</div>}
            </div>
            <button
              onClick={() => copyToClipboard(JSON.stringify(testResult, null, 2))}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
            >
              Copy Result
            </button>
          </div>
          {testResult.error && (
            <div className="p-3 bg-red-900/20 border border-red-800/30 rounded text-xs text-red-400 font-mono">
              {testResult.error}
            </div>
          )}
          {testResult.data && (
            <div className="mt-3">
              <div className="text-xs font-medium text-zinc-500 mb-2">Response Body</div>
              <div className="bg-zinc-800 border border-zinc-700 rounded p-3 max-h-96 overflow-y-auto">
                <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-zinc-600">Enter endpoint details and test</div>
      </div>
    );
  };

  useEffect(() => {
    if (selectedEndpoint?.path && !testUrl) {
      setTestUrl(selectedEndpoint.path);
      setTestMethod(selectedEndpoint.method);
      if (selectedEndpoint.body) {
        setTestBody(JSON.stringify(selectedEndpoint.body, null, 2));
      }
    }
  }, [selectedEndpoint, testUrl]);

  return (
    <div className="w-full px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">API Builder</h1>
        <p className="text-sm text-zinc-500">
          Explore and test Vestara API endpoints. Build, document, and automate API integration.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg h-full">
            <div className="p-5 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Available Endpoints</h2>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search endpoints..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none"
              />
            </div>
            <div className="overflow-y-auto max-h-[600px]">
              {filteredEndpoints.map((endpoint, index) => (
                <button
                  key={`${endpoint.method}-${endpoint.path}-${index}`}
                  onClick={() => setSelectedEndpoint(endpoint)}
                  className={`w-full text-left p-4 border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors cursor-pointer ${selectedEndpoint?.path === endpoint.path ? 'bg-zinc-800/50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`
                      px-2 py-0.5 rounded text-xs font-mono font-medium shrink-0
                      ${endpoint.method === 'GET' ? 'bg-green-400/10 text-green-400' : ''}
                      ${endpoint.method === 'POST' ? 'bg-blue-400/10 text-blue-400' : ''}
                      ${endpoint.method === 'PUT' ? 'bg-amber-400/10 text-amber-400' : ''}
                      ${endpoint.method === 'DELETE' ? 'bg-red-400/10 text-red-400' : ''}
                      ${endpoint.method === 'PATCH' ? 'bg-purple-400/10 text-purple-400' : ''}
                    `}
                    >
                      {endpoint.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-300 truncate">{endpoint.path}</div>
                      <div className="text-xs text-zinc-600 truncate mt-0.5">{endpoint.description}</div>
                      {endpoint.requiresAuth && <div className="text-xs text-amber-400 mt-1">Auth required</div>}
                    </div>
                  </div>
                </button>
              ))}
              {filteredEndpoints.length === 0 && (
                <div className="p-8 text-center text-sm text-zinc-600">No endpoints found</div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
          {selectedEndpoint ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <div className="p-5 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-300 flex items-center gap-2">
                      <span
                        className={`
                        px-2 py-0.5 rounded text-xs font-mono
                        ${selectedEndpoint.method === 'GET' ? 'bg-green-400/10 text-green-400' : ''}
                        ${selectedEndpoint.method === 'POST' ? 'bg-blue-400/10 text-blue-400' : ''}
                        ${selectedEndpoint.method === 'PUT' ? 'bg-amber-400/10 text-amber-400' : ''}
                        ${selectedEndpoint.method === 'DELETE' ? 'bg-red-400/10 text-red-400' : ''}
                        ${selectedEndpoint.method === 'PATCH' ? 'bg-purple-400/10 text-purple-400' : ''}
                      `}
                      >
                        {selectedEndpoint.method}
                      </span>
                      <span className="text-zinc-300 truncate">{selectedEndpoint.path}</span>
                    </h2>
                    <p className="text-sm text-zinc-600 mt-1">{selectedEndpoint.description}</p>
                  </div>
                  <button
                    onClick={() => useTemplate(selectedEndpoint)}
                    className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
                  >
                    Use Template
                  </button>
                </div>
              </div>

              <div className="p-5 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Request</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">URL</label>
                    <input
                      type="text"
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      placeholder="https://example.com/api/... or /api/..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Method</label>
                    <div className="flex gap-2">
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                        <button
                          key={method}
                          onClick={() => setTestMethod(method as typeof testMethod)}
                          className={`
                            px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer
                            ${
                              testMethod === method
                                ? 'bg-zinc-700 text-zinc-300 border border-zinc-600'
                                : 'bg-zinc-800 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-400'
                            }
                          `}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedEndpoint.body && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Body (JSON)</label>
                      <textarea
                        value={testBody}
                        onChange={(e) => setTestBody(e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none font-mono h-24 resize-none"
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Headers (JSON)</label>
                    <textarea
                      value={testHeaders}
                      onChange={(e) => setTestHeaders(e.target.value)}
                      placeholder='{"Content-Type": "application/json"}'
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 outline-none font-mono h-20 resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-5 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Response</h3>
                {renderTestResult()}
              </div>

              <div className="p-5">
                <button
                  onClick={testEndpoint}
                  disabled={testResult.status === 'loading' || !testUrl}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {testResult.status === 'loading' ? 'Testing...' : 'Test Endpoint'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-lg text-zinc-500 mb-2">Select an endpoint</div>
                <div className="text-sm text-zinc-600">Choose an endpoint from the list to test it</div>
              </div>
            </div>
          )}

          {responseHistory.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <div className="p-5 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400">Request History</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {responseHistory.map((item, index) => (
                  <div
                    key={index}
                    className="p-4 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50 cursor-pointer"
                    onClick={() => {
                      setSelectedEndpoint({
                        path: '/api/generic',
                        method: 'GET',
                        description: `Request from ${new Date(item.timestamp).toLocaleTimeString()}`,
                      } as any);
                      setTestUrl(item.request.url);
                      setTestMethod(item.request.method as any);
                      setTestResult({ status: 'success', data: item.response, latency: 0 });
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-zinc-600 font-mono">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {item.request.method} {item.request.url.split('/').slice(-2).join('/')}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-600">
                        {item.request.method === 'GET' ? 'GET' : item.request.method}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {JSON.stringify(item.request, null, 1).slice(0, 100)}...
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
