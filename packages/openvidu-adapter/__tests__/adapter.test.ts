import {
  consumeMediaConnectionCredential,
  createMediaConnectionCredential,
  MediaCapabilities,
  type MediaConnection,
  MediaError,
  type MediaParticipantCapabilities,
  type MediaServer,
  type MediaSession,
} from '@vestara/media-runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  capabilitiesToOpenViduRole,
  classifyOpenViduError,
  normalizeToMediaError,
  OPENVIDU_PATHS,
  type OpenViduConfig,
  OpenViduError,
  OpenViduMediaServer,
  type OpenViduTransport,
  openViduRoleToCapabilities,
} from '../src/index';

// ─── Mock Transport ──────────────────────────────────────────────

function createTransport(
  handler: (method: string, path: string, body?: unknown) => Promise<unknown>,
): OpenViduTransport {
  return {
    request: async (method, path, body) => handler(method, path, body),
  };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, body?: unknown): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Role Mapping ────────────────────────────────────────────────

describe('Role Mapping', () => {
  it('SUBSCRIBER capabilities → SUBSCRIBER role', () => {
    const role = capabilitiesToOpenViduRole(MediaCapabilities.SUBSCRIBER);
    expect(role).toBe('SUBSCRIBER');
  });

  it('PUBLISHER capabilities → PUBLISHER role', () => {
    const role = capabilitiesToOpenViduRole(MediaCapabilities.PUBLISHER);
    expect(role).toBe('PUBLISHER');
  });

  it('MODERATOR capabilities → MODERATOR role', () => {
    const role = capabilitiesToOpenViduRole(MediaCapabilities.MODERATOR);
    expect(role).toBe('MODERATOR');
  });

  it('no subscribe → undefined (cannot represent)', () => {
    const caps: MediaParticipantCapabilities = {
      publishAudio: true,
      publishVideo: true,
      subscribe: false,
      moderate: false,
    };
    const role = capabilitiesToOpenViduRole(caps);
    expect(role).toBeUndefined();
  });

  it('publish without subscribe → undefined (cannot represent)', () => {
    const caps: MediaParticipantCapabilities = {
      publishAudio: true,
      publishVideo: false,
      subscribe: false,
      moderate: false,
    };
    const role = capabilitiesToOpenViduRole(caps);
    expect(role).toBeUndefined();
  });

  it('reverse mapping: SUBSCRIBER → capabilities', () => {
    const caps = openViduRoleToCapabilities('SUBSCRIBER');
    expect(caps).toEqual({
      publishAudio: false,
      publishVideo: false,
      subscribe: true,
      moderate: false,
    });
  });

  it('reverse mapping: PUBLISHER → capabilities', () => {
    const caps = openViduRoleToCapabilities('PUBLISHER');
    expect(caps).toEqual({
      publishAudio: true,
      publishVideo: true,
      subscribe: true,
      moderate: false,
    });
  });

  it('reverse mapping: MODERATOR → capabilities', () => {
    const caps = openViduRoleToCapabilities('MODERATOR');
    expect(caps).toEqual({
      publishAudio: true,
      publishVideo: true,
      subscribe: true,
      moderate: true,
    });
  });
});

// ─── API Paths ───────────────────────────────────────────────────

describe('API Paths', () => {
  it('sessions path is correct', () => {
    expect(OPENVIDU_PATHS.sessions).toBe('/sessions');
  });

  it('sessionById path is correct', () => {
    expect(OPENVIDU_PATHS.sessionById('abc-123')).toBe('/sessions/abc-123');
  });

  it('sessionById escapes special characters', () => {
    expect(OPENVIDU_PATHS.sessionById('abc/def')).toBe('/sessions/abc%2Fdef');
  });

  it('connection path is SINGULAR (not /connections)', () => {
    const path = OPENVIDU_PATHS.connection('sess-1');
    expect(path).toBe('/sessions/sess-1/connection');
    expect(path).not.toContain('/connections');
  });

  it('connection path escapes session ID', () => {
    const path = OPENVIDU_PATHS.connection('sess/slash');
    expect(path).toBe('/sessions/sess%2Fslash/connection');
  });

  it('connectionById path is correct', () => {
    const path = OPENVIDU_PATHS.connectionById('sess-1', 'conn-1');
    expect(path).toBe('/sessions/sess-1/connection/conn-1');
  });

  it('connectionById escapes both IDs', () => {
    const path = OPENVIDU_PATHS.connectionById('sess/s', 'conn/c');
    expect(path).toBe('/sessions/sess%2Fs/connection/conn%2Fc');
  });
});

// ─── Error Classification ────────────────────────────────────────

describe('Error Classification', () => {
  it('401 → AUTH', () => {
    const error = classifyOpenViduError(401, undefined, 'POST', '/sessions');
    expect(error.category).toBe('AUTH');
    expect(error.httpStatus).toBe(401);
    expect(error.retryable).toBe(false);
  });

  it('403 → AUTH', () => {
    const error = classifyOpenViduError(403, undefined, 'POST', '/sessions');
    expect(error.category).toBe('AUTH');
  });

  it('404 → NOT_FOUND', () => {
    const error = classifyOpenViduError(404, undefined, 'GET', '/sessions/abc');
    expect(error.category).toBe('NOT_FOUND');
  });

  it('409 → CONFLICT', () => {
    const error = classifyOpenViduError(409, undefined, 'POST', '/sessions');
    expect(error.category).toBe('CONFLICT');
  });

  it('400 → INVALID', () => {
    const error = classifyOpenViduError(400, undefined, 'POST', '/sessions');
    expect(error.category).toBe('INVALID');
  });

  it('503 → UNAVAILABLE (retryable)', () => {
    const error = classifyOpenViduError(503, undefined, 'POST', '/sessions');
    expect(error.category).toBe('UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });

  it('500 → PROVIDER_ERROR (retryable)', () => {
    const error = classifyOpenViduError(500, undefined, 'POST', '/sessions');
    expect(error.category).toBe('PROVIDER_ERROR');
    expect(error.retryable).toBe(true);
  });

  it('provider message is sanitized', () => {
    const error = classifyOpenViduError(400, { error: 'Invalid token tok_abc123secret' }, 'POST', '/sessions');
    expect(error.providerMessage).toContain('[REDACTED]');
    expect(error.providerMessage).not.toContain('tok_abc123secret');
  });

  it('provider message is truncated', () => {
    const longMessage = 'A'.repeat(500);
    const error = classifyOpenViduError(400, { error: longMessage }, 'POST', '/sessions');
    expect(error.providerMessage!.length).toBeLessThanOrEqual(200);
  });

  it('normalizeToMediaError maps correctly', () => {
    const ovError = new OpenViduError('AUTH', 'Auth failed', { httpStatus: 401 });
    const mediaError = normalizeToMediaError(ovError);
    expect(mediaError).toBeInstanceOf(MediaError);
    expect(mediaError.code).toBe('MEDIA_PROVIDER_AUTH_FAILED');
    expect(mediaError.provider).toBe('openvidu');
  });
});

// ─── OpenViduMediaServer — Session Operations ────────────────────

describe('OpenViduMediaServer — Sessions', () => {
  let server: OpenViduMediaServer;

  beforeEach(() => {
    const transport = createTransport(async (method, path, body) => {
      if (method === 'POST' && path === '/sessions') {
        return {
          id: 'ov-sess-1',
          sessionId: 'ov-sess-1',
          createdAt: Date.now(),
        };
      }
      if (method === 'GET' && path === '/sessions') {
        return [];
      }
      if (method === 'GET' && path === '/sessions/ov-sess-1') {
        return { id: 'ov-sess-1', sessionId: 'ov-sess-1' };
      }
      if (method === 'DELETE' && path === '/sessions/ov-sess-1') {
        return undefined;
      }
      throw new Error(`Unhandled: ${method} ${path}`);
    });

    server = new OpenViduMediaServer(
      {
        url: 'https://test.openvidu.local',
        apiBase: '/openvidu/api',
        username: 'TESTUSER',
        secret: 'test-secret',
      },
      transport,
    );
  });

  it('createSession returns active session with external ID', async () => {
    const session = await server.createSession();
    expect(session.status).toBe('active');
    expect(session.provider).toBe('openvidu');
    expect(session.externalSessionId).toBe('ov-sess-1');
    expect(session.id).toBeDefined();
  });

  it('createSession with custom ID', async () => {
    const session = await server.createSession({ id: 'my-session' });
    expect(session.id).toBe('my-session');
    expect(session.customId).toBe(true);
  });

  it('getSession returns session from registry', async () => {
    const created = await server.createSession({ id: 'sess-1' });
    const retrieved = await server.getSession('sess-1');
    expect(retrieved?.id).toBe('sess-1');
    expect(retrieved?.status).toBe('active');
  });

  it('getSession returns undefined for closed session', async () => {
    const created = await server.createSession({ id: 'sess-1' });
    await server.closeSession('sess-1');
    const retrieved = await server.getSession('sess-1');
    expect(retrieved).toBeUndefined();
  });

  it('closeSession marks session as closed', async () => {
    await server.createSession({ id: 'sess-1' });
    await server.closeSession('sess-1');
    const sessions = await server.listSessions();
    expect(sessions).toHaveLength(0);
  });

  it('closeSession throws for non-existent session', async () => {
    await expect(server.closeSession('non-existent')).rejects.toThrow('Media session not found');
  });

  it('closeSession throws for already closed session', async () => {
    await server.createSession({ id: 'sess-1' });
    await server.closeSession('sess-1');
    await expect(server.closeSession('sess-1')).rejects.toThrow('already closed');
  });

  it('listSessions excludes closed sessions', async () => {
    await server.createSession({ id: 'sess-1' });
    await server.createSession({ id: 'sess-2' });
    await server.closeSession('sess-1');
    const sessions = await server.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('sess-2');
  });
});

// ─── OpenViduMediaServer — Connection Operations ─────────────────

describe('OpenViduMediaServer — Connections', () => {
  let server: OpenViduMediaServer;

  beforeEach(() => {
    const transport = createTransport(async (method, path, body) => {
      if (method === 'POST' && path === '/sessions') {
        return { id: 'ov-sess-1', sessionId: 'ov-sess-1' };
      }
      if (method === 'POST' && path === '/sessions/ov-sess-1/connection') {
        return {
          id: 'ov-conn-1',
          connectionId: 'ov-conn-1',
          sessionId: 'ov-sess-1',
          role: (body as Record<string, unknown>)?.role ?? 'PUBLISHER',
          token: 'tok_wss_viduk_session1_tokenABC',
        };
      }
      if (method === 'GET' && path === '/sessions') {
        return [];
      }
      if (method === 'DELETE' && path === '/sessions/ov-sess-1') {
        return undefined;
      }
      if (method === 'DELETE' && path.startsWith('/sessions/ov-sess-1/connection/')) {
        return undefined; // 204 No Content
      }
      throw new Error(`Unhandled: ${method} ${path}`);
    });

    server = new OpenViduMediaServer(
      {
        url: 'https://test.openvidu.local',
        apiBase: '/openvidu/api',
        username: 'TESTUSER',
        secret: 'test-secret',
      },
      transport,
    );
  });

  it('createConnection returns connection + credential', async () => {
    await server.createSession({ id: 'sess-1' });
    const result = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    expect(result.connection).toBeDefined();
    expect(result.credential).toBeDefined();
    expect(result.connection.status).toBe('active');
    expect(result.connection.sessionId).toBe('sess-1');
  });

  it('createConnection credential contains secret via consumption', async () => {
    await server.createSession({ id: 'sess-1' });
    const result = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    const secret = consumeMediaConnectionCredential(result.credential);
    expect(secret).toBe('tok_wss_viduk_session1_tokenABC');
  });

  it('createConnection credential does not expose secret via JSON', async () => {
    await server.createSession({ id: 'sess-1' });
    const result = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    const json = JSON.stringify(result);
    expect(json).not.toContain('tok_wss_viduk_session1_tokenABC');
    expect(json).toContain('sess-1');
  });

  it('createConnection maps SUBSCRIBER role', async () => {
    await server.createSession({ id: 'sess-1' });
    const result = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.SUBSCRIBER,
    });

    expect(result.connection.capabilities.publishAudio).toBe(false);
    expect(result.connection.capabilities.publishVideo).toBe(false);
    expect(result.connection.capabilities.subscribe).toBe(true);
  });

  it('createConnection rejects unrepresentable capabilities', async () => {
    await server.createSession({ id: 'sess-1' });
    await expect(
      server.createConnection('sess-1', {
        capabilities: {
          publishAudio: true,
          publishVideo: false,
          subscribe: false,
          moderate: false,
        },
      }),
    ).rejects.toThrow('not supported');
  });

  it('createConnection throws for non-existent session', async () => {
    await expect(
      server.createConnection('non-existent', {
        capabilities: MediaCapabilities.PUBLISHER,
      }),
    ).rejects.toThrow('not found');
  });

  it('closeConnection calls DELETE on provider', async () => {
    let deleteCalled = false;
    let deletePath = '';

    const trackingTransport = createTransport(async (method, path, body) => {
      if (method === 'POST' && path === '/sessions') {
        return { id: 'ov-sess-1', sessionId: 'ov-sess-1' };
      }
      if (method === 'POST' && path === '/sessions/ov-sess-1/connection') {
        return {
          id: 'ov-conn-1',
          connectionId: 'ov-conn-1',
          sessionId: 'ov-sess-1',
          role: 'PUBLISHER',
          token: 'tok_test',
        };
      }
      if (method === 'DELETE' && path.startsWith('/sessions/ov-sess-1/connection/')) {
        deleteCalled = true;
        deletePath = path;
        return undefined; // 204
      }
      if (method === 'GET' && path === '/sessions') return [];
      return {};
    });

    const trackingServer = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/openvidu/api', username: 'u', secret: 's' },
      trackingTransport,
    );

    await trackingServer.createSession({ id: 'sess-1' });
    const { connection } = await trackingServer.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    await trackingServer.closeConnection(connection.id);

    expect(deleteCalled).toBe(true);
    expect(deletePath).toBe('/sessions/ov-sess-1/connection/ov-conn-1');
  });

  it('closeConnection handles provider 404 (already gone)', async () => {
    const transport = createTransport(async (method, path) => {
      if (method === 'POST' && path === '/sessions') {
        return { id: 'ov-sess-1', sessionId: 'ov-sess-1' };
      }
      if (method === 'POST' && path === '/sessions/ov-sess-1/connection') {
        return {
          id: 'ov-conn-1',
          connectionId: 'ov-conn-1',
          sessionId: 'ov-sess-1',
          role: 'PUBLISHER',
          token: 'tok_test',
        };
      }
      if (method === 'DELETE' && path.startsWith('/sessions/ov-sess-1/connection/')) {
        throw new OpenViduError('NOT_FOUND', 'Connection not found', { httpStatus: 404 });
      }
      if (method === 'GET' && path === '/sessions') return [];
      return {};
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/openvidu/api', username: 'u', secret: 's' },
      transport,
    );

    await server.createSession({ id: 'sess-1' });
    const { connection } = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    // Should not throw — connection already gone on provider is OK
    await server.closeConnection(connection.id);
    const retrieved = await server.getConnection(connection.id);
    expect(retrieved).toBeUndefined();
  });

  it('closeConnection throws provider errors (not 404)', async () => {
    const transport = createTransport(async (method, path) => {
      if (method === 'POST' && path === '/sessions') {
        return { id: 'ov-sess-1', sessionId: 'ov-sess-1' };
      }
      if (method === 'POST' && path === '/sessions/ov-sess-1/connection') {
        return {
          id: 'ov-conn-1',
          connectionId: 'ov-conn-1',
          sessionId: 'ov-sess-1',
          role: 'PUBLISHER',
          token: 'tok_test',
        };
      }
      if (method === 'DELETE' && path.startsWith('/sessions/ov-sess-1/connection/')) {
        throw new OpenViduError('AUTH', 'Not authorized', { httpStatus: 401 });
      }
      if (method === 'GET' && path === '/sessions') return [];
      return {};
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/openvidu/api', username: 'u', secret: 's' },
      transport,
    );

    await server.createSession({ id: 'sess-1' });
    const { connection } = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    await expect(server.closeConnection(connection.id)).rejects.toThrow(MediaError);
  });

  it('closeConnection marks connection as disconnected', async () => {
    await server.createSession({ id: 'sess-1' });
    const { connection } = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    await server.closeConnection(connection.id);
    const retrieved = await server.getConnection(connection.id);
    expect(retrieved).toBeUndefined();
  });

  it('closeConnection is idempotent for already disconnected', async () => {
    await server.createSession({ id: 'sess-1' });
    const { connection } = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    await server.closeConnection(connection.id);
    await server.closeConnection(connection.id); // Should not throw
  });

  it('listConnections excludes disconnected', async () => {
    await server.createSession({ id: 'sess-1' });
    const { connection: conn1 } = await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });
    await server.createConnection('sess-1', {
      capabilities: MediaCapabilities.SUBSCRIBER,
    });

    await server.closeConnection(conn1.id);
    const active = await server.listConnections('sess-1');
    expect(active).toHaveLength(1);
  });
});

// ─── OpenViduMediaServer — Error Handling ────────────────────────

describe('OpenViduMediaServer — Error Handling', () => {
  it('auth error throws MediaError with correct code', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('AUTH', 'Authentication failed', {
        httpStatus: 401,
      });
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );

    try {
      await server.createSession();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MediaError);
      expect((error as MediaError).code).toBe('MEDIA_PROVIDER_AUTH_FAILED');
    }
  });

  it('not found error throws MediaError with correct code', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('NOT_FOUND', 'Not found', { httpStatus: 404 });
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );

    await expect(server.createSession()).rejects.toThrow(MediaError);
  });

  it('network error throws retryable MediaError', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('NETWORK', 'Timeout', { retryable: true });
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );

    await expect(server.createSession()).rejects.toThrow(MediaError);
  });
});

// ─── Security Tests ──────────────────────────────────────────────

describe('Security', () => {
  it('Authorization header never logged in errors', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('AUTH', 'Auth failed', {
        httpStatus: 401,
        operation: 'POST /sessions',
      });
    });

    const server = new OpenViduMediaServer(
      {
        url: 'https://test.local',
        apiBase: '/api',
        username: 'SECRET_USER',
        secret: 'SUPER_SECRET_PASSWORD',
      },
      transport,
    );

    try {
      await server.createSession();
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('SECRET_USER');
      expect(message).not.toContain('SUPER_SECRET_PASSWORD');
      expect(message).not.toContain('Basic');
    }
  });

  it('OPENVIDU_SECRET never serialized in MediaError', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('AUTH', 'Auth failed', { httpStatus: 401 });
    });

    const server = new OpenViduMediaServer(
      {
        url: 'https://test.local',
        apiBase: '/api',
        username: 'user',
        secret: 'my-secret-value-123',
      },
      transport,
    );

    try {
      await server.createSession();
      expect.fail('Should have thrown');
    } catch (error) {
      const json = JSON.stringify(error);
      expect(json).not.toContain('my-secret-value-123');
    }
  });

  it('connection credential never ambiently serialized', async () => {
    const transport = createTransport(async (method, path, body) => {
      if (method === 'POST' && path === '/sessions') {
        return { id: 'ov-1', sessionId: 'ov-1' };
      }
      if (method === 'POST' && path === '/sessions/ov-1/connection') {
        return {
          id: 'ov-conn-1',
          connectionId: 'ov-conn-1',
          sessionId: 'ov-1',
          role: 'PUBLISHER',
          token: 'tok_secret_value_xyz',
        };
      }
      if (method === 'GET' && path === '/sessions') return [];
      return {};
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );

    await server.createSession({ id: 's1' });
    const result = await server.createConnection('s1', {
      capabilities: MediaCapabilities.PUBLISHER,
    });

    // JSON.stringify the credential — must not expose secret
    const credJson = JSON.stringify(result.credential);
    expect(credJson).not.toContain('tok_secret_value_xyz');

    // JSON.stringify the full result — must not expose secret
    const resultJson = JSON.stringify(result);
    expect(resultJson).not.toContain('tok_secret_value_xyz');

    // Object spread — must not expose secret
    const spread = { ...result.credential };
    expect((spread as Record<string, unknown>).value).toBeUndefined();
    expect((spread as Record<string, unknown>).token).toBeUndefined();
  });

  it('provider response token never logged in errors', async () => {
    const transport = createTransport(async (method, path) => {
      if (method === 'POST' && path === '/sessions') {
        return { id: 'ov-1', sessionId: 'ov-1' };
      }
      if (method === 'POST' && path === '/sessions/ov-1/connection') {
        // Simulate a provider error that includes a token in the response
        throw new OpenViduError('PROVIDER_ERROR', 'Connection rejected', {
          httpStatus: 500,
          providerMessage: 'Token expired tok_provider_token_abc',
        });
      }
      if (method === 'GET' && path === '/sessions') return [];
      return {};
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );

    await server.createSession({ id: 's1' });
    try {
      await server.createConnection('s1', {
        capabilities: MediaCapabilities.PUBLISHER,
      });
      expect.fail('Should have thrown');
    } catch (error) {
      const json = JSON.stringify(error);
      expect(json).not.toContain('tok_provider_token_abc');
    }
  });

  it('domain errors contain no credentials', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('INVALID', 'Bad request', { httpStatus: 400 });
    });

    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 'my-secret-credential-xyz' },
      transport,
    );

    try {
      await server.createSession();
      expect.fail('Should have thrown');
    } catch (error) {
      const json = JSON.stringify(error);
      // Must not contain the actual secret value
      expect(json).not.toContain('my-secret-credential-xyz');
      // Must not contain auth header artifacts
      expect(json).not.toContain('Basic');
      expect(json).not.toContain('Authorization');
    }
  });
});

// ─── Health Check ────────────────────────────────────────────────

describe('Health Check', () => {
  it('returns true when provider is reachable', async () => {
    const transport = createTransport(async () => []);
    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );
    expect(await server.healthCheck()).toBe(true);
  });

  it('returns false when provider is unreachable', async () => {
    const transport = createTransport(async () => {
      throw new OpenViduError('NETWORK', 'Connection refused', { retryable: true });
    });
    const server = new OpenViduMediaServer(
      { url: 'https://test.local', apiBase: '/api', username: 'u', secret: 's' },
      transport,
    );
    expect(await server.healthCheck()).toBe(false);
  });
});

// ─── Capabilities ────────────────────────────────────────────────

describe('Capabilities', () => {
  it('reports correct VidUK capabilities', () => {
    const server = new OpenViduMediaServer({
      url: 'https://test.local',
      apiBase: '/api',
      username: 'u',
      secret: 's',
    });

    const caps = server.getCapabilities();
    expect(caps.provider).toBe('openvidu');
    expect(caps.recording).toBe(false);
    expect(caps.transcoding).toBe(false);
    expect(caps.simulcast).toBe(false);
    expect(caps.moderation).toBe(true);
    expect(caps.sessions).toBe(true);
    expect(caps.connections).toBe(true);
  });
});

// ─── Port Compatibility ──────────────────────────────────────────

describe('Port Compatibility', () => {
  it('OpenViduMediaServer satisfies MediaServer interface', () => {
    const server: MediaServer = new OpenViduMediaServer({
      url: 'https://test.local',
      apiBase: '/api',
      username: 'u',
      secret: 's',
    });
    expect(server.provider).toBe('openvidu');
  });
});
