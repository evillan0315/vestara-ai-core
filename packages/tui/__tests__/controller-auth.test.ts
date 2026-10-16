/**
 * Regression guard: the TUI must send the Bearer token on API requests.
 *
 * The API enforces auth on every /api/* request (VES-AUTH-001). Before this,
 * the controller sent only `X-Vestara-Source: cli`, so runtime status, the
 * provider catalog, and sending all failed with 401.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TuiController } from '../src/controller';

describe('TuiController auth headers', () => {
  const originalKey = process.env.VESTARA_API_KEY;

  beforeEach(() => {
    delete process.env.VESTARA_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.VESTARA_API_KEY;
    else process.env.VESTARA_API_KEY = originalKey;
  });

  function captureFetch(): RequestInit[] {
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        calls.push(init ?? {});
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    return calls;
  }

  it('sends Authorization: Bearer when VESTARA_API_KEY is set', async () => {
    process.env.VESTARA_API_KEY = 'vst_tui_test';
    const calls = captureFetch();
    const controller = new TuiController({ endpoint: 'http://127.0.0.1:3001' });

    // setProviderCredential issues a POST via requestJson.
    for await (const _ of controller.setProviderCredential('openai', 'sk-provider')) {
      // No events when routing state is unset.
    }

    expect(calls.length).toBeGreaterThan(0);
    expect(new Headers(calls[0]?.headers).get('Authorization')).toBe('Bearer vst_tui_test');
  });

  it('omits Authorization when unauthenticated', async () => {
    const calls = captureFetch();
    const controller = new TuiController({ endpoint: 'http://127.0.0.1:3001' });

    for await (const _ of controller.setProviderCredential('openai', 'sk-provider')) {
      // No events when routing state is unset.
    }

    expect(calls.length).toBeGreaterThan(0);
    expect(new Headers(calls[0]?.headers).get('Authorization')).toBeNull();
  });
});
