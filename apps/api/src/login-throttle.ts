/**
 * Login rate limiter — sliding-window throttle for public credential
 * endpoints (login, password, MFA verify). Local-first and dependency-free:
 * attempt timestamps per client key are held in memory and pruned lazily.
 * Loopback callers (CLI/TUI on this machine) are never throttled.
 */

import type * as http from 'node:http';

export interface LoginThrottleOptions {
  readonly maxAttempts: number;
  readonly windowMs: number;
}

export function loginThrottleOptions(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LoginThrottleOptions {
  const maxAttempts = Number.parseInt(env.VESTARA_AUTH_LOGIN_MAX_ATTEMPTS ?? '10', 10);
  const windowMs = Number.parseInt(env.VESTARA_AUTH_LOGIN_WINDOW_MS ?? '60000', 10);
  return {
    maxAttempts: Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 10,
    windowMs: Number.isInteger(windowMs) && windowMs > 0 ? windowMs : 60_000,
  };
}

/**
 * Resolve the throttle key, or null when exempt. The key is always the
 * socket address — X-Forwarded-For is untrusted input (rotating it must not
 * escape the bucket). Direct loopback connections (local CLI/TUI, tests)
 * are exempt; forwarded claims from loopback are still counted.
 */
function throttleKey(req: http.IncomingMessage): string | null {
  const remote = req.socket?.remoteAddress ?? 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  const hasForwardedClaim = typeof forwarded === 'string' && forwarded.split(',')[0].trim() !== '';
  if (!hasForwardedClaim && (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) {
    return null;
  }
  return remote;
}

export class LoginThrottle {
  private readonly attempts = new Map<string, number[]>();
  private readonly options: LoginThrottleOptions;

  constructor(options?: Partial<LoginThrottleOptions>) {
    const defaults = loginThrottleOptions();
    this.options = { ...defaults, ...options };
  }

  /**
   * Record an attempt for this request. Returns the seconds to wait when
   * throttled, or 0 when the attempt may proceed. Direct loopback connections
   * are never throttled.
   */
  take(req: http.IncomingMessage, now = Date.now()): number {
    const key = throttleKey(req);
    if (key === null) return 0;
    const cutoff = now - this.options.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length >= this.options.maxAttempts) {
      const retryMs = recent[0] + this.options.windowMs - now;
      this.attempts.set(key, recent);
      return Math.max(1, Math.ceil(retryMs / 1000));
    }
    recent.push(now);
    this.attempts.set(key, recent);
    if (this.attempts.size > 1024) {
      for (const [k, v] of this.attempts) {
        if (v.every((at) => at <= cutoff)) this.attempts.delete(k);
        if (this.attempts.size <= 1024) break;
      }
    }
    return 0;
  }
}

/** Shared process-wide throttle for the credential endpoints. */
export const loginThrottle = new LoginThrottle();

/**
 * Enforce the throttle: writes 429 + Retry-After and returns false when the
 * caller must back off, true when the request may proceed.
 */
export function requireLoginThrottle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  throttle: LoginThrottle = loginThrottle,
): boolean {
  const retryAfter = throttle.take(req);
  if (retryAfter <= 0) return true;
  const data = JSON.stringify({ error: 'Too many login attempts. Try again later.' });
  res.writeHead(429, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Retry-After': String(retryAfter),
  });
  res.end(data);
  return false;
}
