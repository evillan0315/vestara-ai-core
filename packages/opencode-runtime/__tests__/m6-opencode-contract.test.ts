// M6: Tests for OpenCode contract extensions — session lifecycle methods,
// normalizers, and OpenCodeAdapterBoundary. All tests are hermetic (zero live
// sessions, zero paid providers).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeAdapterBoundary } from '../src/client/opencode-adapter-boundary.js';
import { OpenCodeHttpClient } from '../src/client/opencode-http-client.js';
import type { OpenCodeRuntimeConfig } from '../src/config.js';

// ── Test helpers ────────────────────────────────────────────

const TEST_CONFIG: OpenCodeRuntimeConfig = {
  baseUrl: new URL('http://127.0.0.1:4096'),
  username: 'opencode',
  password: 'test-password',
  requestTimeoutMs: 5_000,
  healthTimeoutMs: 3_000,
  reconnectDelayMs: 2_000,
  maxReconnectDelayMs: 30_000,
  policies: {
    allowShell: false,
    allowConfigWrite: false,
    allowProviderAuth: false,
    allowInstanceDispose: false,
  },
};

function mockFetchJson(body: unknown, status = 200) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', 'application/json']]),
    json: () => Promise.resolve(body),
  };
  return vi.fn().mockResolvedValue(response);
}

function mockFetchNoContent(status = 204) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', 'application/json']]),
    json: () => Promise.resolve(undefined),
  };
  return vi.fn().mockResolvedValue(response);
}

// ── normalizeSessionDurableEvents tests ─────────────────────

describe('normalizeSessionDurableEvents (M6 normalizer)', () => {
  it('returns empty array for non-array input', async () => {
    // Access the normalizer via the HTTP client's getSessionHistory with bad data
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: 'not-an-array', hasMore: false }));
    try {
      const result = await client.getSessionHistory('ses-test');
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('normalizes valid durable events', async () => {
    const events = [
      { id: 'evt-1', type: 'message.created', timestamp: '2025-01-01T00:00:00Z', properties: { role: 'user' } },
      { id: 'evt-2', type: 'tool.call', timestamp: '2025-01-01T00:01:00Z' },
    ];
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: events, hasMore: true }));
    try {
      const result = await client.getSessionHistory('ses-1');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('evt-1');
      expect(result.data[0].type).toBe('message.created');
      expect(result.data[0].properties).toEqual({ role: 'user' });
      expect(result.hasMore).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('handles missing data envelope gracefully', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson(undefined));
    try {
      const result = await client.getSessionHistory('ses-1');
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── normalizeQuestions tests ────────────────────────────────

describe('normalizeQuestions (M6 normalizer)', () => {
  it('returns empty array for non-array input', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: 'not-an-array' }));
    try {
      const result = await client.listQuestions('ses-test');
      expect(result).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('normalizes valid question requests', async () => {
    const questions = [
      {
        id: 'que-1',
        sessionID: 'ses-1',
        questions: [
          {
            question: 'Which file should I modify?',
            header: 'File selection',
            options: [{ label: 'src/index.ts' }, { label: 'src/config.ts' }],
            custom: true,
          },
        ],
        tool: { name: 'editor', callID: 'call-1' },
      },
    ];
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: questions }));
    try {
      const result = await client.listQuestions('ses-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('que-1');
      expect(result[0].sessionID).toBe('ses-1');
      expect(result[0].questions).toHaveLength(1);
      expect(result[0].questions[0].header).toBe('File selection');
      expect(result[0].questions[0].options).toHaveLength(2);
      expect(result[0].questions[0].custom).toBe(true);
      expect(result[0].tool?.name).toBe('editor');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('filters out malformed question entries', async () => {
    const questions = [
      { id: 'que-1', sessionID: 'ses-1', questions: [] },
      { id: '', sessionID: 'ses-1', questions: [] }, // missing id
      { id: 'que-2', sessionID: '', questions: [] }, // missing sessionID
      { questions: [] }, // missing both
    ];
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: questions }));
    try {
      const result = await client.listQuestions('ses-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('que-1');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── listActiveSessions tests ────────────────────────────────

describe('listActiveSessions (M6)', () => {
  it('returns active sessions map', async () => {
    const activeSessions = {
      'ses-abc': { type: 'running' as const },
      'ses-def': { type: 'running' as const },
    };
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: activeSessions }));
    try {
      const result = await client.listActiveSessions();
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['ses-abc'].type).toBe('running');
      expect(result['ses-def'].type).toBe('running');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns empty object when no active sessions', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: {} }));
    try {
      const result = await client.listActiveSessions();
      expect(Object.keys(result)).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── getSessionContext tests ─────────────────────────────────

describe('getSessionContext (M6)', () => {
  it('returns normalized messages from context endpoint', async () => {
    const contextMessages = [
      {
        info: { id: 'msg-1', role: 'user', sessionID: 'ses-1' },
        parts: [{ type: 'text', text: 'Hello' }],
      },
      {
        info: { id: 'msg-2', role: 'assistant', sessionID: 'ses-1', agent: 'developer' },
        parts: [{ type: 'text', text: 'Hi there!' }],
      },
    ];
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ data: contextMessages }));
    try {
      const result = await client.getSessionContext('ses-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-1');
      expect(result[0].role).toBe('user');
      expect(result[0].text).toBe('Hello');
      expect(result[1].agent).toBe('developer');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── switchSessionAgent tests ────────────────────────────────

describe('switchSessionAgent (M6)', () => {
  it('sends agent switch request', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await client.switchSessionAgent('ses-1', 'developer');
      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1/agent');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body as string);
      expect(body).toEqual({ agent: 'developer' });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── switchSessionModel tests ────────────────────────────────

describe('switchSessionModel (M6)', () => {
  it('sends model switch request with ModelRef', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const model = { id: 'claude-3-opus', providerID: 'anthropic', variant: 'extended' };
      const result = await client.switchSessionModel('ses-1', model);
      expect(result).toBe(true);
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body).toEqual({ model: { id: 'claude-3-opus', providerID: 'anthropic', variant: 'extended' } });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── compactSession tests ────────────────────────────────────

describe('compactSession (M6)', () => {
  it('sends compact request', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await client.compactSession('ses-1');
      expect(result).toBe(true);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1/compact');
      expect(options.method).toBe('POST');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── interruptSession tests ──────────────────────────────────

describe('interruptSession (M6)', () => {
  it('sends interrupt request', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await client.interruptSession('ses-1');
      expect(result).toBe(true);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1/interrupt');
      expect(options.method).toBe('POST');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── waitSession tests ───────────────────────────────────────

describe('waitSession (M6)', () => {
  it('sends wait request', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await client.waitSession('ses-1');
      expect(result).toBe(true);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1/wait');
      expect(options.method).toBe('POST');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── replyToQuestion tests ───────────────────────────────────

describe('replyToQuestion (M6)', () => {
  it('sends reply with answers', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const reply = { answers: [['src/index.ts'], ['yes', 'no']] };
      const result = await client.replyToQuestion('ses-1', 'que-1', reply);
      expect(result).toBe(true);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1/question/que-1/reply');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body as string);
      expect(body).toEqual({ answers: [['src/index.ts'], ['yes', 'no']] });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('URL-encodes special characters in session and question IDs', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await client.replyToQuestion('ses-1/abc', 'que-1/xyz', { answers: [['a']] });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1%2Fabc/question/que-1%2Fxyz/reply');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── rejectQuestion tests ────────────────────────────────────

describe('rejectQuestion (M6)', () => {
  it('sends reject request', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchNoContent();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await client.rejectQuestion('ses-1', 'que-1');
      expect(result).toBe(true);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/session/ses-1/question/que-1/reject');
      expect(options.method).toBe('POST');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── getSessionHistory with pagination ───────────────────────

describe('getSessionHistory (M6)', () => {
  it('passes limit and after query parameters', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchJson({ data: [], hasMore: false });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await client.getSessionHistory('ses-1', { limit: 10, after: 'evt-cursor' });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('limit=10');
      expect(url).toContain('after=evt-cursor');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('omits undefined query parameters', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    const fetchMock = mockFetchJson({ data: [], hasMore: false });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await client.getSessionHistory('ses-1');
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain('limit=');
      expect(url).not.toContain('after=');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── Error handling ──────────────────────────────────────────

describe('M6 error handling', () => {
  it('throws session not found for 404', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ error: 'not found' }, 404));
    try {
      await expect(client.getSessionContext('ses-missing')).rejects.toThrow('not found');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('throws authentication error for 401', async () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    vi.stubGlobal('fetch', mockFetchJson({ error: 'unauthorized' }, 401));
    try {
      await expect(client.listActiveSessions()).rejects.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── OpenCodeAdapterBoundary tests ───────────────────────────

describe('OpenCodeAdapterBoundary', () => {
  it('returns raw response with status, headers, and body', async () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    const rawBody = { data: { healthy: true } };
    const response = {
      ok: true,
      status: 200,
      headers: new Map([['x-request-id', 'req-1']]),
      json: () => Promise.resolve(rawBody),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    try {
      const result = await boundary.requestRaw({
        method: 'GET',
        path: '/global/health',
        timeoutMs: 5_000,
      });
      expect(result.status).toBe(200);
      expect(result.body).toEqual(rawBody);
      expect(result.headers.get('x-request-id')).toBe('req-1');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns 204 with undefined body', async () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    const response = {
      ok: true,
      status: 204,
      headers: new Map(),
      json: () => Promise.resolve(undefined),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    try {
      const result = await boundary.requestRaw({
        method: 'POST',
        path: '/api/session/ses-1/compact',
        timeoutMs: 5_000,
      });
      expect(result.status).toBe(204);
      expect(result.body).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('contractProbe returns ok true when status matches', async () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    const response = {
      ok: true,
      status: 204,
      headers: new Map(),
      json: () => Promise.resolve(undefined),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    try {
      const result = await boundary.contractProbe('POST', '/api/session/ses-1/compact', 204);
      expect(result.ok).toBe(true);
      expect(result.actualStatus).toBe(204);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('contractProbe returns ok false when status mismatches', async () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    const response = {
      ok: true,
      status: 404,
      headers: new Map(),
      json: () => Promise.resolve({ error: 'not found' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    try {
      const result = await boundary.contractProbe('GET', '/api/session/ses-missing/history', 200);
      expect(result.ok).toBe(false);
      expect(result.actualStatus).toBe(404);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('getOpenApiDocument returns the spec body', async () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    const spec = { openapi: '3.1.0', info: { title: 'opencode', version: '1.0.0' } };
    const response = {
      ok: true,
      status: 200,
      headers: new Map(),
      json: () => Promise.resolve(spec),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    try {
      const result = await boundary.getOpenApiDocument();
      expect(result).toEqual(spec);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('sends correct auth headers', async () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    const response = {
      ok: true,
      status: 200,
      headers: new Map(),
      json: () => Promise.resolve({}),
    };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    try {
      await boundary.requestRaw({ method: 'GET', path: '/test', timeoutMs: 5_000 });
      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^Basic /);
      expect(headers['X-Vestara-Source']).toBe('opencode-runtime');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// ── M6 method count verification ────────────────────────────

describe('M6 client interface completeness', () => {
  it('has all 11 new M6 methods implemented', () => {
    const client = new OpenCodeHttpClient(TEST_CONFIG);
    // Verify all M6 methods exist and are functions
    expect(typeof client.listActiveSessions).toBe('function');
    expect(typeof client.getSessionContext).toBe('function');
    expect(typeof client.getSessionHistory).toBe('function');
    expect(typeof client.switchSessionAgent).toBe('function');
    expect(typeof client.switchSessionModel).toBe('function');
    expect(typeof client.compactSession).toBe('function');
    expect(typeof client.interruptSession).toBe('function');
    expect(typeof client.waitSession).toBe('function');
    expect(typeof client.listQuestions).toBe('function');
    expect(typeof client.replyToQuestion).toBe('function');
    expect(typeof client.rejectQuestion).toBe('function');
  });

  it('OpenCodeAdapterBoundary is a class with required methods', () => {
    const boundary = new OpenCodeAdapterBoundary(TEST_CONFIG);
    expect(typeof boundary.requestRaw).toBe('function');
    expect(typeof boundary.getOpenApiDocument).toBe('function');
    expect(typeof boundary.contractProbe).toBe('function');
  });
});
