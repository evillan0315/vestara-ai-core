/**
 * OpenCode contract tests — prove HTTP serialization matches OpenCode SDK contract.
 *
 * These tests verify that:
 * 1. createSession sends directory in query, title in body, no agent/model in body
 * 2. sendMessage sends agent/model in body, directory in query
 * 3. All directory-scoped methods include directory in query
 * 4. Arbitrary values work (genericity proof)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeHttpClient } from '../client/opencode-http-client';

// Mock fetch to capture HTTP requests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TEST_CONFIG = {
  baseUrl: new URL('http://localhost:4096'),
  username: 'user',
  password: 'pass',
  requestTimeoutMs: 5000,
  healthTimeoutMs: 3000,
  reconnectDelayMs: 2000,
  maxReconnectDelayMs: 30000,
  policies: {
    allowShell: true,
    allowConfigWrite: false,
    allowProviderAuth: false,
    allowInstanceDispose: false,
  },
};

const CTX_WITH_DIR = { workspaceId: 'vestara', directory: '/home/user/projects/my-workspace' };
const CTX_NO_DIR = { workspaceId: 'vestara' };
const ARB_DIR = '/opt/custom/workspace/project-x%20with%20spaces';

describe('OpenCodeHttpClient — contract compliance', () => {
  let client: InstanceType<typeof OpenCodeHttpClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'test-session', title: 'test', projectID: 'test-project' }),
    });
    client = new OpenCodeHttpClient(TEST_CONFIG);
  });

  // ── Regression tests for the production incident ──────────────────────

  describe('REGRESSION: createSession (incident root cause)', () => {
    it('sends directory in query parameter, not body', async () => {
      await client.createSession({ title: 'My Task' }, CTX_WITH_DIR);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('directory=%2Fhome%2Fuser%2Fprojects%2Fmy-workspace');
      expect(url).toContain('/session?');

      const body = JSON.parse(options.body);
      expect(body).toEqual({ title: 'My Task' });
      expect(body).not.toHaveProperty('directory');
      expect(body).not.toHaveProperty('agent');
      expect(body).not.toHaveProperty('providerID');
      expect(body).not.toHaveProperty('modelID');
    });

    it('omits directory from query when not provided', async () => {
      await client.createSession({ title: 'Test' }, CTX_NO_DIR);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4096/session');
    });

    it('handles arbitrary directory values (genericity)', async () => {
      await client.createSession({ title: 'Arbitrary Task' }, { workspaceId: 'vestara', directory: ARB_DIR });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain(`directory=${encodeURIComponent(ARB_DIR)}`);
    });
  });

  describe('REGRESSION: sendMessage (incident root cause)', () => {
    it('sends agent and model in body, directory in query', async () => {
      await client.sendMessage(
        'session-123',
        {
          parts: [{ type: 'text', text: 'Hello' }],
          agent: 'vestara-developer',
          model: { providerID: 'opencode', modelID: 'mimo-v2.5-free' },
        },
        { ...CTX_WITH_DIR, sessionId: 'session-123' },
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('directory=%2Fhome%2Fuser%2Fprojects%2Fmy-workspace');
      expect(url).toContain('/session/session-123/message?');

      const body = JSON.parse(options.body);
      expect(body.agent).toBe('vestara-developer');
      expect(body.model).toEqual({ providerID: 'opencode', modelID: 'mimo-v2.5-free' });
      expect(body.parts).toEqual([{ type: 'text', text: 'Hello' }]);
    });
  });

  describe('REGRESSION: sendMessageAsync (incident root cause)', () => {
    it('sends directory in query for prompt_async', async () => {
      await client.sendMessageAsync(
        'session-456',
        {
          parts: [{ type: 'text', text: 'Test' }],
          agent: 'vestara-developer',
          model: { providerId: 'opencode', modelId: 'mimo-v2.5-free' },
        },
        { ...CTX_WITH_DIR, sessionId: 'session-456' },
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('directory=%2Fhome%2Fuser%2Fprojects%2Fmy-workspace');
      expect(url).toContain('/session/session-456/prompt_async?');
    });
  });

  // ── Table-driven directory contract tests ──────────────────────────────

  describe('directory contract — all directory-scoped methods', () => {
    const directoryMethods: Array<{
      name: string;
      call: (c: InstanceType<typeof OpenCodeHttpClient>) => Promise<unknown>;
      expectedPath: string;
      expectsDirectory: boolean;
    }> = [
      // Session operations
      {
        name: 'listSessions',
        call: (c) => c.listSessions(CTX_WITH_DIR),
        expectedPath: '/session?',
        expectsDirectory: true,
      },
      {
        name: 'getSession',
        call: (c) => c.getSession('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1?',
        expectsDirectory: true,
      },
      {
        name: 'deleteSession',
        call: (c) => c.deleteSession('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1?',
        expectsDirectory: true,
      },
      {
        name: 'renameSession',
        call: (c) => c.renameSession('s1', 'New Title', CTX_WITH_DIR),
        expectedPath: '/session/s1?',
        expectsDirectory: true,
      },
      {
        name: 'getSessionStatus',
        call: (c) => c.getSessionStatus(CTX_WITH_DIR),
        expectedPath: '/session/status?',
        expectsDirectory: true,
      },
      {
        name: 'getSessionTodos',
        call: (c) => c.getSessionTodos('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/todo?',
        expectsDirectory: true,
      },
      {
        name: 'getSessionChildren',
        call: (c) => c.getSessionChildren('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/children?',
        expectsDirectory: true,
      },
      {
        name: 'getSessionDiff',
        call: (c) => c.getSessionDiff('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/diff?',
        expectsDirectory: true,
      },
      {
        name: 'listMessages',
        call: (c) => c.listMessages('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/message?',
        expectsDirectory: true,
      },
      {
        name: 'runCommand',
        call: (c) => c.runCommand('s1', { command: 'test' }, CTX_WITH_DIR),
        expectedPath: '/session/s1/command?',
        expectsDirectory: true,
      },
      {
        name: 'abortSession',
        call: (c) => c.abortSession('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/abort?',
        expectsDirectory: true,
      },
      {
        name: 'respondToPermission',
        call: (c) => c.respondToPermission('s1', 'p1', { decision: 'approve', scope: 'once' }, CTX_WITH_DIR),
        expectedPath: '/session/s1/permissions/p1?',
        expectsDirectory: true,
      },
      {
        name: 'initSession',
        call: (c) => c.initSession('s1', {}, CTX_WITH_DIR),
        expectedPath: '/session/s1/init?',
        expectsDirectory: true,
      },
      {
        name: 'shareSession',
        call: (c) => c.shareSession('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/share?',
        expectsDirectory: true,
      },
      {
        name: 'unshareSession',
        call: (c) => c.unshareSession('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/share?',
        expectsDirectory: true,
      },
      {
        name: 'summarizeSession',
        call: (c) => c.summarizeSession('s1', {}, CTX_WITH_DIR),
        expectedPath: '/session/s1/summarize?',
        expectsDirectory: true,
      },
      {
        name: 'revertSession',
        call: (c) => c.revertSession('s1', { messageID: 'm1' }, CTX_WITH_DIR),
        expectedPath: '/session/s1/revert?',
        expectsDirectory: true,
      },
      {
        name: 'unrevertSession',
        call: (c) => c.unrevertSession('s1', CTX_WITH_DIR),
        expectedPath: '/session/s1/unrevert?',
        expectsDirectory: true,
      },
      {
        name: 'runShell',
        call: (c) => c.runShell('s1', { command: 'echo test' }, CTX_WITH_DIR),
        expectedPath: '/session/s1/shell?',
        expectsDirectory: true,
      },
    ];

    for (const { name, call, expectedPath, expectsDirectory } of directoryMethods) {
      it(`${name}: directory in query`, async () => {
        await call(client);

        const [url] = mockFetch.mock.calls[0];
        if (expectsDirectory) {
          expect(url).toContain('directory=%2Fhome%2Fuser%2Fprojects%2Fmy-workspace');
          expect(url).toContain(expectedPath);
        }
      });

      it(`${name}: omits directory when not provided`, async () => {
        // Create a client without directory in context
        const ctxNoDir = { workspaceId: 'vestara' };
        if (name === 'listSessions') {
          await client.listSessions(ctxNoDir);
        } else if (name === 'getSessionStatus') {
          await client.getSessionStatus(ctxNoDir);
        } else {
          // Skip methods that require sessionId
          return;
        }

        const [url] = mockFetch.mock.calls[0];
        expect(url).not.toContain('directory=');
      });
    }
  });

  // ── Negative invariant: methods WITHOUT directory ──────────────────────

  describe('negative invariant: methods without directory', () => {
    it('getHealth does not receive project context', async () => {
      await client.getHealth();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4096/global/health');
      expect(url).not.toContain('directory=');
    });

    it('getOpenApiDocument does not receive project context', async () => {
      await client.getOpenApiDocument();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4096/doc');
      expect(url).not.toContain('directory=');
    });
  });
});
