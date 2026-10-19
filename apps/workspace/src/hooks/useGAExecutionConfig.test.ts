/** @vitest-environment jsdom */

/**
 * GA-EXEC-003 — session-local execution budget contract.
 *
 * The Activity Room composer and the Global Assistant both derive their
 * request body from this hook. The wire contract is "omit when untouched":
 * an untouched hook must send no `executionConfig`, so the adapter default
 * (150 tool calls) applies. An explicit 0 (unlimited) must survive as 0 —
 * that is the only way to lift the cap (bounds are 0..200, so 150 is not the
 * maximum).
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGAExecutionConfig } from './useGAExecutionConfig';

describe('useGAExecutionConfig', () => {
  it('omits executionConfig while untouched so the adapter default applies', () => {
    const { result } = renderHook(() => useGAExecutionConfig());

    expect(result.current.config).toEqual({ turnTimeoutMs: 3_600_000, maxToolCalls: 150 });
    expect(result.current.isCustom).toBe(false);
    expect(result.current.toRequestConfig()).toBeUndefined();
  });

  it('sends an explicit 0 as unlimited', () => {
    const { result } = renderHook(() => useGAExecutionConfig());

    act(() => result.current.setMaxToolCalls(0));

    expect(result.current.isCustom).toBe(true);
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 0 });
  });

  it('sends a raised budget and clamps to the server bounds', () => {
    const { result } = renderHook(() => useGAExecutionConfig());

    act(() => result.current.setMaxToolCalls(200));
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 200 });

    act(() => result.current.setMaxToolCalls(9_999));
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 200 });

    act(() => result.current.setMaxToolCalls(-5));
    expect(result.current.toRequestConfig()).toEqual({ maxToolCalls: 0 });
  });

  it('carries a turn timeout override independently of the tool budget', () => {
    const { result } = renderHook(() => useGAExecutionConfig());

    act(() => result.current.setTurnTimeoutMs(900_000));

    expect(result.current.toRequestConfig()).toEqual({ turnTimeoutMs: 900_000 });
  });

  it('returns to the omitted-default shape on reset', () => {
    const { result } = renderHook(() => useGAExecutionConfig());

    act(() => result.current.setMaxToolCalls(0));
    act(() => result.current.resetToDefaults());

    expect(result.current.isCustom).toBe(false);
    expect(result.current.toRequestConfig()).toBeUndefined();
  });
});
