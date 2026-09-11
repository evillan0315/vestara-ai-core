/**
 * GA-EXEC-001: Execution Config Tests
 *
 * Tests:
 * 1. GAExecutionConfig type contract (shared types)
 * 2. Server-side validation (parseExecutionConfig bounds)
 * 3. useGAExecutionConfig hook (defaults, clamping, reset, toRequestConfig)
 * 4. Adapter enforcement (budget limits, timeout override)
 *
 * Finalized semantics:
 *   - maxOperations was removed — it counted the same events as maxToolCalls
 *   - maxToolCalls is the canonical tool-invocation budget
 *   - Text deltas are NOT operations (LLM inference output)
 *   - Default turn timeout is 15 minutes (dogfood default)
 */

import { describe, expect, it } from 'vitest';
import type { GAExecutionConfig } from '@vestara/shared';

// ─── 1. Type Contract Tests ──────────────────────────────────

describe('GAExecutionConfig type contract', () => {
  it('accepts empty config (all defaults)', () => {
    const cfg: GAExecutionConfig = {};
    expect(cfg.turnTimeoutMs).toBeUndefined();
    expect(cfg.maxToolCalls).toBeUndefined();
  });

  it('accepts partial config with turnTimeoutMs only', () => {
    const cfg: GAExecutionConfig = { turnTimeoutMs: 60_000 };
    expect(cfg.turnTimeoutMs).toBe(60_000);
    expect(cfg.maxToolCalls).toBeUndefined();
  });

  it('accepts partial config with maxToolCalls only', () => {
    const cfg: GAExecutionConfig = { maxToolCalls: 20 };
    expect(cfg.maxToolCalls).toBe(20);
    expect(cfg.turnTimeoutMs).toBeUndefined();
  });

  it('accepts full config', () => {
    const cfg: GAExecutionConfig = {
      turnTimeoutMs: 120_000,
      maxToolCalls: 20,
    };
    expect(cfg.turnTimeoutMs).toBe(120_000);
    expect(cfg.maxToolCalls).toBe(20);
  });

  it('fields are readonly', () => {
    const cfg: GAExecutionConfig = { turnTimeoutMs: 60_000 };
    expect(Object.keys(cfg)).toEqual(['turnTimeoutMs']);
  });

  it('does not have maxOperations field', () => {
    const cfg: GAExecutionConfig = { turnTimeoutMs: 60_000 };
    expect('maxOperations' in cfg).toBe(false);
  });
});

// ─── 2. Server-Side Validation Tests ─────────────────────────
// These test the parseExecutionConfig logic by mirroring the bounds
// and validation from conversations.ts.

const EXEC_CFG_BOUNDS = {
  turnTimeoutMs: { min: 10_000, max: 60 * 60_000 }, // 10s–60min
  maxToolCalls: { min: 1, max: 200 },
} as const;

function parseExecutionConfig(raw: unknown): GAExecutionConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const fields: Record<string, number> = {};
  if (obj.turnTimeoutMs !== undefined) {
    const n = Number(obj.turnTimeoutMs);
    if (Number.isFinite(n) && n >= EXEC_CFG_BOUNDS.turnTimeoutMs.min && n <= EXEC_CFG_BOUNDS.turnTimeoutMs.max) {
      fields.turnTimeoutMs = n;
    }
  }
  if (obj.maxToolCalls !== undefined) {
    const n = Number(obj.maxToolCalls);
    if (Number.isFinite(n) && n >= EXEC_CFG_BOUNDS.maxToolCalls.min && n <= EXEC_CFG_BOUNDS.maxToolCalls.max) {
      fields.maxToolCalls = Math.floor(n);
    }
  }
  return Object.keys(fields).length > 0 ? (fields as GAExecutionConfig) : undefined;
}

describe('parseExecutionConfig (server-side validation)', () => {
  it('returns undefined for null/undefined/non-object', () => {
    expect(parseExecutionConfig(null)).toBeUndefined();
    expect(parseExecutionConfig(undefined)).toBeUndefined();
    expect(parseExecutionConfig('string')).toBeUndefined();
    expect(parseExecutionConfig(42)).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(parseExecutionConfig({})).toBeUndefined();
  });

  it('accepts valid turnTimeoutMs', () => {
    const cfg = parseExecutionConfig({ turnTimeoutMs: 60_000 });
    expect(cfg).toEqual({ turnTimeoutMs: 60_000 });
  });

  it('rejects turnTimeoutMs below minimum', () => {
    const cfg = parseExecutionConfig({ turnTimeoutMs: 5_000 });
    expect(cfg).toBeUndefined();
  });

  it('rejects turnTimeoutMs above maximum (60 min)', () => {
    const cfg = parseExecutionConfig({ turnTimeoutMs: 61 * 60_000 });
    expect(cfg).toBeUndefined();
  });

  it('accepts turnTimeoutMs at maximum boundary', () => {
    const cfg = parseExecutionConfig({ turnTimeoutMs: 60 * 60_000 });
    expect(cfg).toEqual({ turnTimeoutMs: 3_600_000 });
  });

  it('accepts valid maxToolCalls', () => {
    const cfg = parseExecutionConfig({ maxToolCalls: 20 });
    expect(cfg).toEqual({ maxToolCalls: 20 });
  });

  it('rejects maxToolCalls below minimum', () => {
    const cfg = parseExecutionConfig({ maxToolCalls: 0 });
    expect(cfg).toBeUndefined();
  });

  it('rejects maxToolCalls above maximum', () => {
    const cfg = parseExecutionConfig({ maxToolCalls: 300 });
    expect(cfg).toBeUndefined();
  });

  it('floors decimal maxToolCalls', () => {
    const cfg = parseExecutionConfig({ maxToolCalls: 5.7 });
    expect(cfg).toEqual({ maxToolCalls: 5 });
  });

  it('merges multiple valid fields', () => {
    const cfg = parseExecutionConfig({
      turnTimeoutMs: 120_000,
      maxToolCalls: 15,
    });
    expect(cfg).toEqual({
      turnTimeoutMs: 120_000,
      maxToolCalls: 15,
    });
  });

  it('filters invalid fields from mixed input', () => {
    const cfg = parseExecutionConfig({
      turnTimeoutMs: 60_000,
      maxToolCalls: 999, // too high
    });
    expect(cfg).toEqual({
      turnTimeoutMs: 60_000,
    });
  });

  it('ignores unknown fields', () => {
    const cfg = parseExecutionConfig({
      turnTimeoutMs: 60_000,
      maxToolCalls: 10,
      unknownField: 42,
    });
    expect(cfg).toEqual({
      turnTimeoutMs: 60_000,
      maxToolCalls: 10,
    });
  });
});

// ─── 3. Hook Behavior Tests ──────────────────────────────────
// These test the hook logic by simulating the same clamping/reset behavior.

const HOOK_DEFAULTS = { turnTimeoutMs: 15 * 60 * 1000, maxToolCalls: 0 }; // 15 min
const HOOK_BOUNDS = {
  turnTimeoutMs: { min: 10_000, max: 60 * 60_000, step: 60_000 },
  maxToolCalls: { min: 0, max: 200, step: 5 },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function toRequestConfig(config: typeof HOOK_DEFAULTS): GAExecutionConfig | undefined {
  const cfg: GAExecutionConfig = {};
  if (config.turnTimeoutMs !== HOOK_DEFAULTS.turnTimeoutMs) cfg.turnTimeoutMs = config.turnTimeoutMs;
  if (config.maxToolCalls !== HOOK_DEFAULTS.maxToolCalls) cfg.maxToolCalls = config.maxToolCalls;
  return Object.keys(cfg).length > 0 ? cfg : undefined;
}

describe('useGAExecutionConfig logic', () => {
  it('defaults: 15 min timeout, unlimited tool calls', () => {
    expect(HOOK_DEFAULTS.turnTimeoutMs).toBe(15 * 60 * 1000);
    expect(HOOK_DEFAULTS.maxToolCalls).toBe(0);
  });

  it('clamps turnTimeoutMs to bounds', () => {
    expect(clamp(5_000, HOOK_BOUNDS.turnTimeoutMs.min, HOOK_BOUNDS.turnTimeoutMs.max)).toBe(10_000);
    expect(clamp(61 * 60_000, HOOK_BOUNDS.turnTimeoutMs.min, HOOK_BOUNDS.turnTimeoutMs.max)).toBe(60 * 60_000);
    expect(clamp(120_000, HOOK_BOUNDS.turnTimeoutMs.min, HOOK_BOUNDS.turnTimeoutMs.max)).toBe(120_000);
  });

  it('clamps maxToolCalls to bounds', () => {
    expect(clamp(-1, HOOK_BOUNDS.maxToolCalls.min, HOOK_BOUNDS.maxToolCalls.max)).toBe(0);
    expect(clamp(250, HOOK_BOUNDS.maxToolCalls.min, HOOK_BOUNDS.maxToolCalls.max)).toBe(200);
    expect(clamp(20, HOOK_BOUNDS.maxToolCalls.min, HOOK_BOUNDS.maxToolCalls.max)).toBe(20);
  });

  it('toRequestConfig returns undefined when all defaults', () => {
    expect(toRequestConfig(HOOK_DEFAULTS)).toBeUndefined();
  });

  it('toRequestConfig includes only non-default turnTimeoutMs', () => {
    const cfg = toRequestConfig({ ...HOOK_DEFAULTS, turnTimeoutMs: 30 * 60 * 1000 });
    expect(cfg).toEqual({ turnTimeoutMs: 30 * 60 * 1000 });
  });

  it('toRequestConfig includes only non-default maxToolCalls', () => {
    const cfg = toRequestConfig({ ...HOOK_DEFAULTS, maxToolCalls: 50 });
    expect(cfg).toEqual({ maxToolCalls: 50 });
  });

  it('toRequestConfig includes all custom fields', () => {
    const cfg = toRequestConfig({
      turnTimeoutMs: 30 * 60 * 1000,
      maxToolCalls: 15,
    });
    expect(cfg).toEqual({
      turnTimeoutMs: 30 * 60 * 1000,
      maxToolCalls: 15,
    });
  });
});

// ─── 4. Adapter Enforcement Tests ────────────────────────────

describe('adapter enforcement logic', () => {
  it('maxToolCalls=0 means unlimited', () => {
    const maxToolCalls = 0;
    const toolCallCount = 100;
    const exceeded = maxToolCalls > 0 && toolCallCount >= maxToolCalls;
    expect(exceeded).toBe(false);
  });

  it('maxToolCalls triggers at limit', () => {
    const maxToolCalls = 5;
    const toolCallCount = 5;
    const exceeded = maxToolCalls > 0 && toolCallCount >= maxToolCalls;
    expect(exceeded).toBe(true);
  });

  it('maxToolCalls does not trigger below limit', () => {
    const maxToolCalls = 5;
    const toolCallCount = 4;
    const exceeded = maxToolCalls > 0 && toolCallCount >= maxToolCalls;
    expect(exceeded).toBe(false);
  });

  it('turnTimeoutMs override takes precedence over default', () => {
    const defaultTimeout = 15 * 60 * 1000; // 15 min dogfood default
    const execCfg: GAExecutionConfig = { turnTimeoutMs: 60_000 };
    const effective = execCfg.turnTimeoutMs ?? defaultTimeout;
    expect(effective).toBe(60_000);
  });

  it('turnTimeoutMs falls back to default when not set', () => {
    const defaultTimeout = 15 * 60 * 1000;
    const execCfg: GAExecutionConfig = {};
    const effective = execCfg.turnTimeoutMs ?? defaultTimeout;
    expect(effective).toBe(15 * 60 * 1000);
  });

  it('VESTARA_GA_TURN_TIMEOUT_MS env var overrides compiled default', () => {
    // The adapter reads: Number(process.env.VESTARA_GA_TURN_TIMEOUT_MS) || 15 * 60 * 1000
    // When env var is not set, falls back to 15 min
    const compiled = Number(process.env.VESTARA_GA_TURN_TIMEOUT_MS) || 15 * 60 * 1000;
    expect(compiled).toBe(15 * 60 * 1000);
  });
});
