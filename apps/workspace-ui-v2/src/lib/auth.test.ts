/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assistantFetch,
  clearAssistantThread,
  clearAssistantToken,
  readAssistantThread,
  readAssistantToken,
  storeAssistantThread,
  storeAssistantToken,
} from './auth';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('assistant auth store', () => {
  it('round-trips the token without touching fixtures or source', () => {
    expect(readAssistantToken()).toBe('');
    storeAssistantToken('tok-abc');
    expect(readAssistantToken()).toBe('tok-abc');
    clearAssistantToken();
    expect(readAssistantToken()).toBe('');
  });

  it('round-trips the thread id for session affinity', () => {
    expect(readAssistantThread()).toBeNull();
    storeAssistantThread('conv-1');
    expect(readAssistantThread()).toBe('conv-1');
    clearAssistantThread();
    expect(readAssistantThread()).toBeNull();
  });

  it('attaches Bearer only when a token exists', async () => {
    const seen: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        new Headers(init?.headers).forEach((v, k) => {
          seen[k] = v;
        });
        return { ok: true } as Response;
      }),
    );
    await assistantFetch('/api/auth/me');
    expect(seen['authorization']).toBeUndefined();
    storeAssistantToken('tok-abc');
    await assistantFetch('/api/auth/me');
    expect(seen['authorization']).toBe('Bearer tok-abc');
  });
});
