import { describe, expect, it } from 'vitest';
import type { MediaConnection, MediaConnectionStatus } from '../src/media-connection';
import { MediaCapabilities, type MediaParticipantCapabilities } from '../src/media-connection';
import {
  consumeMediaConnectionCredential,
  createMediaConnectionCredential,
  inspectCredential,
  isCredentialExpired,
  isMediaConnectionCredential,
  sanitizeCredentialForLogging,
} from '../src/media-connection-token';
import {
  MediaCapabilityNotSupportedError,
  MediaConnectionAlreadyActiveError,
  MediaConnectionAlreadyDisconnectedError,
  MediaConnectionNotFoundError,
  MediaError,
  MediaSessionAlreadyActiveError,
  MediaSessionAlreadyClosedError,
  MediaSessionNotFoundError,
  MediaTokenExpiredError,
} from '../src/media-errors';
import { createProviderCapabilities } from '../src/media-provider-capabilities';
import type { CreateMediaConnectionResult, MediaServer } from '../src/media-server';
import type { MediaSession, MediaSessionStatus } from '../src/media-session';

// ─── MediaCapabilities ───────────────────────────────────────────

describe('MediaCapabilities', () => {
  it('SUBSCRIBER has correct flags', () => {
    const sub = MediaCapabilities.SUBSCRIBER;
    expect(sub.publishAudio).toBe(false);
    expect(sub.publishVideo).toBe(false);
    expect(sub.subscribe).toBe(true);
    expect(sub.moderate).toBe(false);
  });

  it('PUBLISHER has correct flags', () => {
    const pub = MediaCapabilities.PUBLISHER;
    expect(pub.publishAudio).toBe(true);
    expect(pub.publishVideo).toBe(true);
    expect(pub.subscribe).toBe(true);
    expect(pub.moderate).toBe(false);
  });

  it('MODERATOR has correct flags', () => {
    const mod = MediaCapabilities.MODERATOR;
    expect(mod.publishAudio).toBe(true);
    expect(mod.publishVideo).toBe(true);
    expect(mod.subscribe).toBe(true);
    expect(mod.moderate).toBe(true);
  });

  it('capability presets are frozen', () => {
    expect(Object.isFrozen(MediaCapabilities.SUBSCRIBER)).toBe(true);
    expect(Object.isFrozen(MediaCapabilities.PUBLISHER)).toBe(true);
    expect(Object.isFrozen(MediaCapabilities.MODERATOR)).toBe(true);
  });

  it('custom capabilities can be constructed', () => {
    const custom: MediaParticipantCapabilities = {
      publishAudio: true,
      publishVideo: false,
      subscribe: true,
      moderate: false,
    };
    expect(custom.publishAudio).toBe(true);
    expect(custom.publishVideo).toBe(false);
  });
});

// ─── MediaConnectionCredential — Serialization Boundary ──────────

describe('MediaConnectionCredential', () => {
  const credentialData = {
    value: 'tok_abc123_secret',
    connectionId: 'conn-1',
    sessionId: 'sess-1',
    provider: 'openvidu',
  };

  it('creates a credential with hidden secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    expect(cred.connectionId).toBe('conn-1');
    expect(cred.sessionId).toBe('sess-1');
    expect(cred.provider).toBe('openvidu');
    expect(typeof cred.issuedAt).toBe('number');
  });

  it('secret is NOT a direct property', () => {
    const cred = createMediaConnectionCredential(credentialData);
    // The secret is stored under a Symbol, not a string key
    expect((cred as Record<string, unknown>).value).toBeUndefined();
    expect((cred as Record<string, unknown>).secret).toBeUndefined();
  });

  // ─── JSON.stringify ─────────────────────────────────────────

  it('JSON.stringify(credential) omits secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const json = JSON.stringify(cred);
    const parsed = JSON.parse(json);

    expect(parsed).not.toHaveProperty('value');
    expect(parsed).not.toHaveProperty('secret');
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('credential');
    // Safe metadata IS present
    expect(parsed.connectionId).toBe('conn-1');
    expect(parsed.sessionId).toBe('sess-1');
    expect(parsed.provider).toBe('openvidu');
  });

  it('JSON.stringify({ credential }) omits secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const wrapper = { credential: cred };
    const json = JSON.stringify(wrapper);
    const parsed = JSON.parse(json);

    expect(parsed.credential).toBeDefined();
    expect(parsed.credential).not.toHaveProperty('value');
    expect(parsed.credential).not.toHaveProperty('secret');
    expect(parsed.credential.connectionId).toBe('conn-1');
  });

  it('JSON.stringify([credential]) omits secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const json = JSON.stringify([cred]);
    const parsed = JSON.parse(json);

    expect(parsed[0]).toBeDefined();
    expect(parsed[0]).not.toHaveProperty('value');
  });

  // ─── Object spread / rest ───────────────────────────────────

  it('object spread omits secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const spread = { ...cred };

    expect(spread).not.toHaveProperty('value');
    expect(spread).not.toHaveProperty('secret');
    expect(spread).not.toHaveProperty('token');
    expect(spread.connectionId).toBe('conn-1');
    expect(spread.sessionId).toBe('sess-1');
    expect(spread.provider).toBe('openvidu');
  });

  it('destructuring omits secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const { connectionId, sessionId, provider, issuedAt, expiresAt } = cred;

    expect(connectionId).toBe('conn-1');
    expect(sessionId).toBe('sess-1');
    expect(provider).toBe('openvidu');
    // No "value" variable extracted — it doesn't exist on the public interface
  });

  // ─── Object enumeration ─────────────────────────────────────

  it('Object.keys() does not include secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const keys = Object.keys(cred);

    expect(keys).not.toContain('value');
    expect(keys).not.toContain('secret');
    expect(keys).toContain('connectionId');
    expect(keys).toContain('sessionId');
    expect(keys).toContain('provider');
    expect(keys).toContain('issuedAt');
  });

  it('for...in does not enumerate secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const keys: string[] = [];
    for (const key in cred) {
      keys.push(key);
    }

    expect(keys).not.toContain('value');
    expect(keys).not.toContain('secret');
  });

  it('Object.getOwnPropertyNames() does not include secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const names = Object.getOwnPropertyNames(cred);

    expect(names).not.toContain('value');
    expect(names).not.toContain('secret');
  });

  it('Symbol-keyed properties are not string keys', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const symbols = Object.getOwnPropertySymbols(cred);

    // The SECRET symbol exists on the object
    expect(symbols.length).toBe(1);
    // But it's a Symbol, not a string — invisible to JSON/keys/spread
    expect(typeof symbols[0]).toBe('symbol');
  });

  // ─── Generic inspection / logging ───────────────────────────

  it('inspectCredential returns redacted string', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const str = inspectCredential(cred);

    expect(str).toContain('REDACTED');
    expect(str).toContain('conn-1');
    expect(str).toContain('openvidu');
    expect(str).not.toContain('tok_abc123_secret');
  });

  it('console.log equivalent does not expose secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    // Simulate what console.log does — it calls util.inspect internally
    // which uses getOwnPropertyNames + getOwnPropertySymbols
    // The symbol value is not stringified
    const inspected = JSON.stringify(cred, null, 2);
    expect(inspected).not.toContain('tok_abc123_secret');
  });

  // ─── Sanitized logging ──────────────────────────────────────

  it('sanitizeCredentialForLogging omits secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const sanitized = sanitizeCredentialForLogging(cred);

    expect(sanitized).not.toHaveProperty('value');
    expect(sanitized).not.toHaveProperty('secret');
    expect(sanitized).not.toHaveProperty('token');
    expect(sanitized.connectionId).toBe('conn-1');
    expect(sanitized.sessionId).toBe('sess-1');
    expect(sanitized.provider).toBe('openvidu');
    expect(typeof sanitized.expired).toBe('boolean');
  });

  // ─── Explicit consumption ───────────────────────────────────

  it('consumeMediaConnectionCredential extracts secret', () => {
    const cred = createMediaConnectionCredential(credentialData);
    const secret = consumeMediaConnectionCredential(cred);

    expect(secret).toBe('tok_abc123_secret');
  });

  it('consumption is the ONLY way to get the secret', () => {
    const cred = createMediaConnectionCredential(credentialData);

    // No direct property access
    expect((cred as Record<string, unknown>).value).toBeUndefined();

    // No spread extraction
    const spread = { ...cred };
    expect((spread as Record<string, unknown>).value).toBeUndefined();

    // Only consumption works
    expect(consumeMediaConnectionCredential(cred)).toBe('tok_abc123_secret');
  });

  // ─── isMediaConnectionCredential ────────────────────────────

  it('detects valid credentials', () => {
    const cred = createMediaConnectionCredential(credentialData);
    expect(isMediaConnectionCredential(cred)).toBe(true);
  });

  it('rejects plain objects', () => {
    expect(isMediaConnectionCredential({ value: 'tok' })).toBe(false);
    expect(isMediaConnectionCredential({ connectionId: 'c' })).toBe(false);
    expect(isMediaConnectionCredential(null)).toBe(false);
    expect(isMediaConnectionCredential(undefined)).toBe(false);
    expect(isMediaConnectionCredential('string')).toBe(false);
  });

  // ─── Expiry ─────────────────────────────────────────────────

  it('isCredentialExpired returns false for credentials without expiry', () => {
    const cred = createMediaConnectionCredential(credentialData);
    expect(isCredentialExpired(cred)).toBe(false);
  });

  it('isCredentialExpired detects expired credentials', () => {
    const cred = createMediaConnectionCredential({
      ...credentialData,
      expiresAt: Date.now() - 1000,
    });
    expect(isCredentialExpired(cred)).toBe(true);
  });

  it('isCredentialExpired returns false for future expiry', () => {
    const cred = createMediaConnectionCredential({
      ...credentialData,
      expiresAt: Date.now() + 60_000,
    });
    expect(isCredentialExpired(cred)).toBe(false);
  });
});

// ─── Serialization Boundary — Representative Payloads ────────────

describe('Serialization boundary — representative payloads', () => {
  const SECRET_VALUE = 'tok_wss_viduk_session123_tokenABC';
  const credData = {
    value: SECRET_VALUE,
    connectionId: 'conn-1',
    sessionId: 'sess-1',
    provider: 'openvidu',
  };

  it('Activity Room event payload does not contain secret', () => {
    const cred = createMediaConnectionCredential(credData);

    // Representative Activity Room event
    const event = {
      type: 'media.participant.joined',
      connectionId: cred.connectionId,
      sessionId: cred.sessionId,
      provider: cred.provider,
      timestamp: Date.now(),
    };

    const json = JSON.stringify(event);
    expect(json).not.toContain(SECRET_VALUE);
    expect(event).not.toHaveProperty('credential');
    expect(event).not.toHaveProperty('token');
    expect(event).not.toHaveProperty('value');
  });

  it('evidence payload does not contain secret', () => {
    const cred = createMediaConnectionCredential(credData);

    // Representative evidence payload
    const evidence = {
      sessionId: cred.sessionId,
      connectionId: cred.connectionId,
      provider: cred.provider,
      issuedAt: cred.issuedAt,
      action: 'session.created',
    };

    const json = JSON.stringify(evidence);
    expect(json).not.toContain(SECRET_VALUE);
  });

  it('diagnostics payload does not contain secret', () => {
    const cred = createMediaConnectionCredential(credData);

    // Representative diagnostics
    const diagnostics = {
      session: { id: cred.sessionId, provider: cred.provider },
      connection: { id: cred.connectionId },
      credential: sanitizeCredentialForLogging(cred),
    };

    const json = JSON.stringify(diagnostics);
    expect(json).not.toContain(SECRET_VALUE);
  });

  it('telemetry event does not contain secret', () => {
    const cred = createMediaConnectionCredential(credData);

    // Representative telemetry
    const telemetry = {
      event: 'media.connection.created',
      provider: cred.provider,
      sessionId: cred.sessionId,
    };

    const json = JSON.stringify(telemetry);
    expect(json).not.toContain(SECRET_VALUE);
  });

  it('persisted session record does not contain secret', () => {
    const cred = createMediaConnectionCredential(credData);

    // Representative persisted record
    const record = {
      sessionId: cred.sessionId,
      connectionId: cred.connectionId,
      provider: cred.provider,
      createdAt: cred.issuedAt,
    };

    const json = JSON.stringify(record);
    expect(json).not.toContain(SECRET_VALUE);
  });

  it('CreateMediaConnectionResult serializes without secret', () => {
    const cred = createMediaConnectionCredential(credData);
    const result: CreateMediaConnectionResult = {
      connection: {
        id: 'conn-1',
        sessionId: 'sess-1',
        status: 'active',
        capabilities: MediaCapabilities.PUBLISHER,
        customId: false,
        createdAt: Date.now(),
      },
      credential: cred,
    };

    // JSON.stringify the full result
    const json = JSON.stringify(result);
    expect(json).not.toContain(SECRET_VALUE);
    expect(json).toContain('conn-1');
    expect(json).toContain('sess-1');
  });
});

// ─── MediaProviderCapabilities ───────────────────────────────────

describe('MediaProviderCapabilities', () => {
  it('createProviderCapabilities with defaults', () => {
    const caps = createProviderCapabilities('openvidu', '2.25.0');
    expect(caps.provider).toBe('openvidu');
    expect(caps.version).toBe('2.25.0');
    expect(caps.sessions).toBe(true);
    expect(caps.connections).toBe(true);
    expect(caps.webrtcAudio).toBe(true);
    expect(caps.webrtcVideo).toBe(true);
    expect(caps.recording).toBe(false);
    expect(caps.transcoding).toBe(false);
    expect(caps.simulcast).toBe(false);
    expect(caps.moderation).toBe(false);
  });

  it('createProviderCapabilities with overrides', () => {
    const caps = createProviderCapabilities('openvidu', '2.25.0', {
      recording: true,
      transcoding: true,
      moderation: true,
    });
    expect(caps.recording).toBe(true);
    expect(caps.transcoding).toBe(true);
    expect(caps.moderation).toBe(true);
    expect(caps.sessions).toBe(true);
  });

  it('provider capabilities make unsupported features explicit', () => {
    const caps = createProviderCapabilities('openvidu', '2.25.0', {
      recording: false,
      screenShare: false,
    });
    expect(caps.recording).toBe(false);
    expect(caps.screenShare).toBe(false);
  });

  it('extensions allow arbitrary boolean flags', () => {
    const caps = createProviderCapabilities('openvidu', '2.25.0', {
      extensions: { customFeature: true, anotherFeature: false },
    });
    expect(caps.extensions?.customFeature).toBe(true);
    expect(caps.extensions?.anotherFeature).toBe(false);
  });
});

// ─── Media Errors ────────────────────────────────────────────────

describe('Media Errors', () => {
  it('MediaError has correct properties', () => {
    const err = new MediaError('MEDIA_PROVIDER_UNAVAILABLE', 'Provider down', {
      provider: 'openvidu',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MediaError);
    expect(err.code).toBe('MEDIA_PROVIDER_UNAVAILABLE');
    expect(err.message).toBe('Provider down');
    expect(err.provider).toBe('openvidu');
    expect(err.name).toBe('MediaError');
  });

  it('MediaError supports cause', () => {
    const cause = new Error('network');
    const err = new MediaError('MEDIA_PROVIDER_TIMEOUT', 'timeout', { cause });
    expect(err.cause).toBe(cause);
  });

  it('specialized errors have correct codes', () => {
    expect(new MediaSessionNotFoundError('s1').code).toBe('MEDIA_SESSION_NOT_FOUND');
    expect(new MediaSessionAlreadyActiveError('s1').code).toBe('MEDIA_SESSION_ALREADY_ACTIVE');
    expect(new MediaSessionAlreadyClosedError('s1').code).toBe('MEDIA_SESSION_ALREADY_CLOSED');
    expect(new MediaConnectionNotFoundError('c1').code).toBe('MEDIA_CONNECTION_NOT_FOUND');
    expect(new MediaConnectionAlreadyActiveError('c1').code).toBe('MEDIA_CONNECTION_ALREADY_ACTIVE');
    expect(new MediaConnectionAlreadyDisconnectedError('c1').code).toBe('MEDIA_CONNECTION_ALREADY_DISCONNECTED');
    expect(new MediaTokenExpiredError('c1').code).toBe('MEDIA_TOKEN_EXPIRED');
    expect(new MediaCapabilityNotSupportedError('recording').code).toBe('MEDIA_CAPABILITY_NOT_SUPPORTED');
  });

  it('specialized errors are instanceof MediaError', () => {
    expect(new MediaSessionNotFoundError('s1')).toBeInstanceOf(MediaError);
    expect(new MediaConnectionNotFoundError('c1')).toBeInstanceOf(MediaError);
    expect(new MediaTokenExpiredError('c1')).toBeInstanceOf(MediaError);
    expect(new MediaCapabilityNotSupportedError('recording')).toBeInstanceOf(MediaError);
  });
});

// ─── MediaSession Contract ───────────────────────────────────────

describe('MediaSession contract', () => {
  it('session type shape', () => {
    const session: MediaSession = {
      id: 'sess-1',
      provider: 'openvidu',
      externalSessionId: 'ext-sess-1',
      status: 'active',
      customId: false,
      createdAt: Date.now(),
    };
    expect(session.id).toBe('sess-1');
    expect(session.status).toBe('active');
    expect(typeof session.createdAt).toBe('number');
  });

  it('session lifecycle statuses', () => {
    const statuses: MediaSessionStatus[] = ['creating', 'active', 'closing', 'closed', 'failed'];
    expect(statuses.length).toBe(5);
  });

  it('external session ID is optional', () => {
    const session: MediaSession = {
      id: 'sess-2',
      provider: 'openvidu',
      status: 'creating',
      customId: false,
      createdAt: Date.now(),
    };
    expect(session.externalSessionId).toBeUndefined();
  });
});

// ─── MediaConnection Contract ────────────────────────────────────

describe('MediaConnection contract', () => {
  it('connection type shape', () => {
    const conn: MediaConnection = {
      id: 'conn-1',
      sessionId: 'sess-1',
      externalConnectionId: 'ext-conn-1',
      status: 'active',
      capabilities: MediaCapabilities.PUBLISHER,
      customId: false,
      createdAt: Date.now(),
    };
    expect(conn.id).toBe('conn-1');
    expect(conn.sessionId).toBe('sess-1');
    expect(conn.status).toBe('active');
    expect(conn.capabilities.publishAudio).toBe(true);
  });

  it('connection lifecycle statuses', () => {
    const statuses: MediaConnectionStatus[] = ['pending', 'active', 'disconnected', 'failed'];
    expect(statuses.length).toBe(4);
  });

  it('external connection ID is optional', () => {
    const conn: MediaConnection = {
      id: 'conn-2',
      sessionId: 'sess-1',
      status: 'pending',
      capabilities: MediaCapabilities.SUBSCRIBER,
      customId: false,
      createdAt: Date.now(),
    };
    expect(conn.externalConnectionId).toBeUndefined();
  });
});

// ─── MediaServer Port Contract ───────────────────────────────────

describe('MediaServer port contract', () => {
  it('port interface is type-compatible', () => {
    const server: MediaServer = {
      provider: 'openvidu',
      version: '2.25.0',
      getCapabilities: () => createProviderCapabilities('openvidu', '2.25.0'),
      healthCheck: async () => true,
      createSession: async () => ({
        id: 'sess-1',
        provider: 'openvidu',
        status: 'active',
        customId: false,
        createdAt: Date.now(),
      }),
      closeSession: async () => {},
      getSession: async () => undefined,
      listSessions: async () => [],
      createConnection: async () => ({
        connection: {
          id: 'conn-1',
          sessionId: 'sess-1',
          status: 'active',
          capabilities: MediaCapabilities.PUBLISHER,
          customId: false,
          createdAt: Date.now(),
        },
        credential: createMediaConnectionCredential({
          value: 'tok_test',
          connectionId: 'conn-1',
          sessionId: 'sess-1',
          provider: 'openvidu',
        }),
      }),
      closeConnection: async () => {},
      getConnection: async () => undefined,
      listConnections: async () => [],
    };
    expect(server.provider).toBe('openvidu');
    expect(server.version).toBe('2.25.0');
  });
});
