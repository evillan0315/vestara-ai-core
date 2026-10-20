/** @vitest-environment jsdom */

/**
 * GA-EXEC-003 — composer budget contract.
 *
 * The workspace setting (Settings → Assistant Execution) is the baseline; the
 * composer sends an override only when the user touched a value. The wire
 * contract is "omit when untouched", so an untouched composer must send no
 * `executionConfig` and let the server read the workspace setting. An explicit
 * 0 (unlimited) must survive as 0, including when it equals the baseline.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGAExecutionConfig } from './useGAExecutionConfig';

const ADAPTER_DEFAULTS = { maxToolCalls: 150, turnTimeoutMs: 3_600_000 };

function mockSettings(overrides: { maxToolCalls?: number; turnTimeoutMs?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      settings: [
        {
          key: 'assistantExecution.maxToolCalls',
          value: overrides.maxToolCalls ?? ADAPTER_DEFAULTS.maxToolCalls,
        },
        {
          key: 'assistantExecution.turnTimeoutMs',
          value: overrides.turnTimeoutMs ?? ADAPTER_DEFAULTS.turnTimeoutMs,
        },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useGAExecutionConfig', () => {
  it('uses the workspace setting as the displayed baseline and omits it from the request', async () => {
    mockSettings({ maxToolCalls: 200 });
    const { result } = renderHook(() => useGAExecutionConfig());

    await waitFor(() => expect(result.current.defaults.maxToolCalls).toBe(200));
    expect(result.current.config.maxToolCalls).toBe(200);
    expect(result.current.isCustom).toBe(false);
    expect(result.current.toRequestConfig()).toBeUndefined();
  });

  it('sends an explicit 0 as unlimited', async () => {
    mockSettings();
    const { result } = renderHook(() => useGAExecutionConfig());
    await waitFor(() => expect(result.current.defaults.maxToolCalls).toBe(150));

    act(() => result.current.setMaxToolCalls(0));

    expect(result.current.isCustom).toBe(true);
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 0 });
  });

  it('sends an explicit value even when it equals the workspace baseline', async () => {
    mockSettings({ maxToolCalls: 200 });
    const { result } = renderHook(() => useGAExecutionConfig());
    await waitFor(() => expect(result.current.defaults.maxToolCalls).toBe(200));

    act(() => result.current.setMaxToolCalls(200));

    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 200 });
  });

  it('clamps values to the server bounds', async () => {
    mockSettings();
    const { result } = renderHook(() => useGAExecutionConfig());
    await waitFor(() => expect(result.current.defaults.maxToolCalls).toBe(150));

    act(() => result.current.setMaxToolCalls(9_999));
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 200 });

    act(() => result.current.setMaxToolCalls(-5));
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 0 });
  });

  it('carries a timeout override only when it differs from the baseline', async () => {
    mockSettings({ turnTimeoutMs: 900_000 });
    const { result } = renderHook(() => useGAExecutionConfig());
    await waitFor(() => expect(result.current.defaults.turnTimeoutMs).toBe(900_000));

    act(() => result.current.setTurnTimeoutMs(900_000));
    expect(result.current.toRequestConfig()).toBeUndefined();

    act(() => result.current.setTurnTimeoutMs(1_800_000));
    expect(result.current.toRequestConfig()).toEqual({ turnTimeoutMs: 1_800_000 });
  });

  it('resets to the workspace baseline', async () => {
    mockSettings({ maxToolCalls: 200 });
    const { result } = renderHook(() => useGAExecutionConfig());
    await waitFor(() => expect(result.current.defaults.maxToolCalls).toBe(200));

    act(() => result.current.setMaxToolCalls(50));
    act(() => result.current.resetToDefaults());

    expect(result.current.config.maxToolCalls).toBe(200);
    expect(result.current.isCustom).toBe(false);
    expect(result.current.toRequestConfig()).toBeUndefined();
  });

  it('falls back to the adapter defaults when settings are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result } = renderHook(() => useGAExecutionConfig());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.defaults).toEqual(ADAPTER_DEFAULTS);
    expect(result.current.toRequestConfig()).toBeUndefined();
  });
});
