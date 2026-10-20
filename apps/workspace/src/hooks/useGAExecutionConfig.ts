/**
 * GA-EXEC-001 / GA-EXEC-003: useGAExecutionConfig
 *
 * Per-turn execution configuration for the Assistant composers.
 *
 * Authority:
 *   1. Workspace setting (`assistantExecution.*`, saved from Settings →
 *      Assistant Execution) — loaded here as the displayed baseline and read
 *      again server-side by the adapter when a turn omits a field.
 *   2. Composer override (this hook) — sent in the POST body and wins for
 *      that turn only.
 *   3. Adapter constants — the fallback when neither is present.
 *
 * The wire contract is "omit when untouched": an untouched field is not sent,
 * so the workspace setting applies. An explicit 0 for maxToolCalls means
 * unlimited and must always be sent when the user chose it.
 *
 * OpenCode/provider-owned limits (contextWindow, maxOutput, maxIterations)
 * are NOT exposed here — they remain at the provider layer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GAExecutionConfig } from '@vestara/shared';

// ─── Fallbacks (must equal the adapter constants) ─────────────

// GA-EXEC-003: these MUST equal the adapter constants. `toRequestConfig()`
// omits untouched fields, so a mismatch here means the UI displays one number
// while the adapter enforces another — which is how hour-long turns (60m
// deadline) went unexplained behind a "15m" label.
const FALLBACK_DEFAULTS: Required<GAExecutionConfig> = {
  turnTimeoutMs: 60 * 60 * 1000, // matches adapter TURN_TIMEOUT_MS
  maxToolCalls: 150, // matches adapter DEFAULT_MAX_TOOL_CALLS
};

/** Validation bounds (must match server-side EXEC_CFG_BOUNDS). */
const BOUNDS = {
  turnTimeoutMs: { min: 10_000, max: 60 * 60_000 },
  maxToolCalls: { min: 0, max: 200 },
} as const;

const SETTINGS_ENDPOINT = '/api/settings';

// ─── Types ───────────────────────────────────────────────────

export interface GAExecutionConfigState {
  /** Current turn timeout in ms. */
  turnTimeoutMs: number;
  /** Max tool calls per turn. 0 = unlimited. */
  maxToolCalls: number;
}

export interface UseGAExecutionConfigReturn {
  /** Current (effective, displayed) config state. */
  config: GAExecutionConfigState;
  /** Workspace-configured baseline from Settings; adapter constants when unavailable. */
  defaults: GAExecutionConfigState;
  /** Whether the composer will send an override for the next turn. */
  isCustom: boolean;
  /** Set turn timeout (clamped to bounds). */
  setTurnTimeoutMs: (value: number) => void;
  /** Set max tool calls (clamped to bounds). */
  setMaxToolCalls: (value: number) => void;
  /** Reset all fields to the workspace baseline. */
  resetToDefaults: () => void;
  /** Convert to GAExecutionConfig for the POST body (omit untouched fields). */
  toRequestConfig: () => GAExecutionConfig | undefined;
}

// ─── Helpers ─────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function boundedValue(
  value: unknown,
  bounds: { readonly min: number; readonly max: number },
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clamp(value, bounds.min, bounds.max);
}

interface SettingsResponse {
  readonly settings?: readonly { readonly key: string; readonly value: unknown }[];
}

// ─── Hook ────────────────────────────────────────────────────

export function useGAExecutionConfig(): UseGAExecutionConfigReturn {
  const [defaults, setDefaults] = useState<GAExecutionConfigState>(FALLBACK_DEFAULTS);
  const [config, setConfig] = useState<GAExecutionConfigState>(FALLBACK_DEFAULTS);
  // Explicit user intent is tracked separately for maxToolCalls so an
  // explicit 0 (unlimited) — or an explicit value equal to the baseline —
  // is still sent. Untouched => omitted => workspace setting applies.
  const touchedRef = useRef({ maxToolCalls: false, turnTimeoutMs: false });
  const [maxToolCallsTouched, setMaxToolCallsTouched] = useState(false);

  // Load the workspace baseline so the composer shows the same number the
  // server will enforce. A failure keeps the adapter constants; the server
  // remains authoritative either way.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(SETTINGS_ENDPOINT);
        if (!response.ok) return;
        const body = (await response.json()) as SettingsResponse;
        const read = (key: string) => body.settings?.find((setting) => setting.key === key)?.value;
        const workspaceBudget: GAExecutionConfigState = {
          maxToolCalls: boundedValue(
            read('assistantExecution.maxToolCalls'),
            BOUNDS.maxToolCalls,
            FALLBACK_DEFAULTS.maxToolCalls,
          ),
          turnTimeoutMs: boundedValue(
            read('assistantExecution.turnTimeoutMs'),
            BOUNDS.turnTimeoutMs,
            FALLBACK_DEFAULTS.turnTimeoutMs,
          ),
        };
        if (!active) return;
        setDefaults(workspaceBudget);
        setConfig((previous) => ({
          maxToolCalls: touchedRef.current.maxToolCalls ? previous.maxToolCalls : workspaceBudget.maxToolCalls,
          turnTimeoutMs: touchedRef.current.turnTimeoutMs ? previous.turnTimeoutMs : workspaceBudget.turnTimeoutMs,
        }));
      } catch {
        // Settings unavailable — keep the adapter fallbacks.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setTurnTimeoutMs = useCallback((value: number) => {
    touchedRef.current.turnTimeoutMs = true;
    setConfig((previous) => ({
      ...previous,
      turnTimeoutMs: clamp(value, BOUNDS.turnTimeoutMs.min, BOUNDS.turnTimeoutMs.max),
    }));
  }, []);

  const setMaxToolCalls = useCallback((value: number) => {
    touchedRef.current.maxToolCalls = true;
    setMaxToolCallsTouched(true);
    setConfig((previous) => ({
      ...previous,
      maxToolCalls: clamp(value, BOUNDS.maxToolCalls.min, BOUNDS.maxToolCalls.max),
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    touchedRef.current = { maxToolCalls: false, turnTimeoutMs: false };
    setMaxToolCallsTouched(false);
    setConfig(defaults);
  }, [defaults]);

  const toRequestConfig = useCallback((): GAExecutionConfig | undefined => {
    // Canonical GAExecutionConfig is readonly; build a mutable local that is
    // assignable to it rather than mutating the readonly contract.
    const cfg: { -readonly [K in keyof GAExecutionConfig]: GAExecutionConfig[K] } = {};
    if (config.turnTimeoutMs !== defaults.turnTimeoutMs) cfg.turnTimeoutMs = config.turnTimeoutMs;
    if (maxToolCallsTouched) cfg.maxToolCalls = config.maxToolCalls;
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  }, [config, defaults, maxToolCallsTouched]);

  // VES-PERF-001D: stable identity so memoized children (ComposeInput,
  // ExecutionTray) are not forced to rerender on every streaming token.
  // isCustom describes "a request override will be sent", including an
  // explicit value equal to the workspace baseline.
  const isCustom =
    maxToolCallsTouched || config.turnTimeoutMs !== defaults.turnTimeoutMs;

  return useMemo(
    () => ({
      config,
      defaults,
      isCustom,
      setTurnTimeoutMs,
      setMaxToolCalls,
      resetToDefaults,
      toRequestConfig,
    }),
    [config, defaults, isCustom, setTurnTimeoutMs, setMaxToolCalls, resetToDefaults, toRequestConfig],
  );
}
