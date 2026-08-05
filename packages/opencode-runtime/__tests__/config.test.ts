import { describe, expect, it } from 'vitest';
import {
  authenticationFailedError,
  mapUpstreamStatus,
  sessionNotFoundError,
  timeoutError,
  unavailableError,
} from '../src/client/opencode-errors.js';
import { OpenCodeConfigError, resolveOpenCodeConfig } from '../src/config.js';

describe('opencode runtime config', () => {
  it('requires a password', () => {
    expect(() => resolveOpenCodeConfig({ baseUrl: 'http://127.0.0.1:4096' })).toThrow(OpenCodeConfigError);
  });

  it('rejects invalid URLs', () => {
    expect(() => resolveOpenCodeConfig({ baseUrl: 'not-a-url', password: 'x' })).toThrow(OpenCodeConfigError);
  });

  it('rejects non-http protocols', () => {
    expect(() => resolveOpenCodeConfig({ baseUrl: 'ftp://example.com', password: 'x' })).toThrow(OpenCodeConfigError);
  });

  it('applies defaults and explicit values', () => {
    const config = resolveOpenCodeConfig({
      baseUrl: 'http://127.0.0.1:4096',
      username: 'vestara',
      password: 'secret',
      requestTimeoutMs: 5000,
    });
    expect(config.username).toBe('vestara');
    expect(config.password).toBe('secret');
    expect(config.requestTimeoutMs).toBe(5000);
    expect(config.healthTimeoutMs).toBe(3000);
    expect(config.policies.allowShell).toBe(false);
    expect(config.policies.allowInstanceDispose).toBe(false);
  });

  it('reads from environment when not provided', () => {
    process.env.OPENCODE_SERVER_PASSWORD = 'env-secret';
    try {
      const config = resolveOpenCodeConfig({});
      expect(config.password).toBe('env-secret');
      expect(config.username).toBe('opencode');
    } finally {
      delete process.env.OPENCODE_SERVER_PASSWORD;
    }
  });
});

describe('opencode error mapping', () => {
  it('maps 401/403 to authentication failure', () => {
    expect(mapUpstreamStatus(401).code).toBe('OPENCODE_AUTHENTICATION_FAILED');
    expect(mapUpstreamStatus(403).code).toBe('OPENCODE_AUTHENTICATION_FAILED');
  });

  it('maps 404 to session not found when a session is present', () => {
    expect(mapUpstreamStatus(404, 'session-1').code).toBe('OPENCODE_SESSION_NOT_FOUND');
    expect(mapUpstreamStatus(404, 'session-1')).toBeInstanceOf(sessionNotFoundError('session-1').constructor);
  });

  it('maps 5xx to upstream error', () => {
    expect(mapUpstreamStatus(500).code).toBe('OPENCODE_UPSTREAM_ERROR');
    expect(mapUpstreamStatus(503).code).toBe('OPENCODE_UPSTREAM_ERROR');
  });

  it('marks timeout and unavailable as retryable', () => {
    expect(timeoutError().retryable).toBe(true);
    expect(timeoutError().code).toBe('OPENCODE_TIMEOUT');
    expect(unavailableError().retryable).toBe(true);
    expect(authenticationFailedError().retryable).toBe(false);
  });
});
