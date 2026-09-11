/**
 * GA-EXEC-001: useGAExecutionConfig
 *
 * Session-local execution configuration for the Global Assistant.
 * Controls Vestara-owned per-turn limits (turnTimeoutMs, maxToolCalls).
 * NOT persisted — resets on page reload.
 *
 * Configuration ownership:
 *   UI (this hook) → POST body → ConversationService → CompletionRequest
 *   → assistant-opencode-adapter (enforcement)
 *
 * OpenCode/provider-owned limits (contextWindow, maxOutput, maxIterations)
 * are NOT exposed here — they remain at the provider layer.
 */

import { useCallback, useState } from 'react';
import type { GAExecutionConfig } from '@vestara/shared';

// ─── Defaults (match adapter constants) ──────────────────────

const DEFAULTS: Required<GAExecutionConfig> = {
  turnTimeoutMs: 15 * 60 * 1000, // 15 minutes (dogfood default)
  maxToolCalls: 0, // 0 = unlimited
};

/** Validation bounds (must match server-side EXEC_CFG_BOUNDS). */
const BOUNDS = {
  turnTimeoutMs: { min: 10_000, max: 60 * 60_000 },
  maxToolCalls: { min: 0, max: 200 },
} as const;

// ─── Types ───────────────────────────────────────────────────

export interface GAExecutionConfigState {
  /** Current turn timeout in ms. 0 = use adapter default. */
  turnTimeoutMs: number;
  /** Max tool calls per turn. 0 = unlimited. */
  maxToolCalls: number;
}

export interface UseGAExecutionConfigReturn {
  /** Current config state. */
  config: GAExecutionConfigState;
  /** Whether any field differs from defaults. */
  isCustom: boolean;
  /** Set turn timeout (clamped to bounds). */
  setTurnTimeoutMs: (value: number) => void;
  /** Set max tool calls (clamped to bounds). */
  setMaxToolCalls: (value: number) => void;
  /** Reset all fields to defaults. */
  resetToDefaults: () => void;
  /** Convert to GAExecutionConfig for the POST body (omit defaults). */
  toRequestConfig: () => GAExecutionConfig | undefined;
}

// ─── Hook ────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isCustomState(state: GAExecutionConfigState): boolean {
  return (
    state.turnTimeoutMs !== DEFAULTS.turnTimeoutMs ||
    state.maxToolCalls !== DEFAULTS.maxToolCalls
  );
}

export function useGAExecutionConfig(): UseGAExecutionConfigReturn {
  const [config, setConfig] = useState<GAExecutionConfigState>({
    turnTimeoutMs: DEFAULTS.turnTimeoutMs,
    maxToolCalls: DEFAULTS.maxToolCalls,
  });

  const setTurnTimeoutMs = useCallback((value: number) => {
    setConfig((prev) => ({
      ...prev,
      turnTimeoutMs: clamp(value, BOUNDS.turnTimeoutMs.min, BOUNDS.turnTimeoutMs.max),
    }));
  }, []);

  const setMaxToolCalls = useCallback((value: number) => {
    setConfig((prev) => ({
      ...prev,
      maxToolCalls: clamp(value, BOUNDS.maxToolCalls.min, BOUNDS.maxToolCalls.max),
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setConfig({
      turnTimeoutMs: DEFAULTS.turnTimeoutMs,
      maxToolCalls: DEFAULTS.maxToolCalls,
    });
  }, []);

  const toRequestConfig = useCallback((): GAExecutionConfig | undefined => {
    const cfg: GAExecutionConfig = {};
    if (config.turnTimeoutMs !== DEFAULTS.turnTimeoutMs) cfg.turnTimeoutMs = config.turnTimeoutMs;
    if (config.maxToolCalls !== DEFAULTS.maxToolCalls) cfg.maxToolCalls = config.maxToolCalls;
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  }, [config]);

  return {
    config,
    isCustom: isCustomState(config),
    setTurnTimeoutMs,
    setMaxToolCalls,
    resetToDefaults,
    toRequestConfig,
  };
}
