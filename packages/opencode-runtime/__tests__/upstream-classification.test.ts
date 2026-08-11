import { describe, expect, it } from 'vitest';
import { isOpenCodeIntegrationError, mapUpstreamStatus, OpenCodeIntegrationError } from '../src/client/opencode-errors';

describe('OpenCode upstream failure classification', () => {
  it('classifies 401/403 as an authentication failure', () => {
    for (const status of [401, 403]) {
      const error = mapUpstreamStatus(status);
      expect(error).toBeInstanceOf(OpenCodeIntegrationError);
      expect(error.code).toBe('OPENCODE_AUTHENTICATION_FAILED');
      expect(error.retryable).toBe(false);
    }
  });

  it('classifies 404 as a missing resource/session', () => {
    expect(mapUpstreamStatus(404).code).toBe('OPENCODE_SESSION_NOT_FOUND');
    expect(mapUpstreamStatus(404, 'session-1').code).toBe('OPENCODE_SESSION_NOT_FOUND');
  });

  it('classifies 5xx and throttling as retryable upstream errors', () => {
    for (const status of [408, 429, 500, 502, 503, 504, 599]) {
      const error = mapUpstreamStatus(status);
      expect(error).toBeInstanceOf(OpenCodeIntegrationError);
      expect(error.code).toBe('OPENCODE_UPSTREAM_ERROR');
      expect(error.retryable).toBe(true);
    }
  });

  it('never surfaces raw upstream text — the message is stable', () => {
    const error = mapUpstreamStatus(502);
    expect(error.message).toBe('OpenCode returned an unexpected error.');
  });

  it('round-trips through isOpenCodeIntegrationError', () => {
    expect(isOpenCodeIntegrationError(mapUpstreamStatus(503))).toBe(true);
    expect(isOpenCodeIntegrationError(new Error('plain'))).toBe(false);
  });
});
