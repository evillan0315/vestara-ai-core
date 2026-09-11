/**
 * GA-EXEC-001: ExecutionControlsPopover
 *
 * Compact popover for configuring per-turn execution limits.
 * Opens upward from the composer gear icon. Follows the
 * ProviderModelSelector popover pattern.
 *
 * Controls:
 *   - Turn timeout (ms)
 *   - Max tool calls (0 = unlimited)
 *
 * Limits that cannot be truthfully wired (maxIterations, contextWindow,
 * maxOutput) are shown as read-only with "Provider-owned" labels.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { GAExecutionConfigState } from '../../hooks/useGAExecutionConfig';

// ─── Bounds (must match hook + server) ───────────────────────

const BOUNDS = {
  turnTimeoutMs: { min: 10_000, max: 60 * 60_000, step: 60_000 },
  maxToolCalls: { min: 0, max: 200, step: 5 },
} as const;

const DEFAULTS = { turnTimeoutMs: 15 * 60 * 1000, maxToolCalls: 0 };

// ─── Helpers ─────────────────────────────────────────────────

function formatTimeout(ms: number): string {
  if (ms === 0) return 'Default';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatLimit(value: number): string {
  return value === 0 ? 'Unlimited' : String(value);
}

// ─── Component ───────────────────────────────────────────────

interface ExecutionControlsPopoverProps {
  config: GAExecutionConfigState;
  isCustom: boolean;
  onTurnTimeoutChange: (value: number) => void;
  onMaxToolCallsChange: (value: number) => void;
  onReset: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function ExecutionControlsPopover({
  config,
  isCustom,
  onTurnTimeoutChange,
  onMaxToolCallsChange,
  onReset,
  onClose,
  anchorRef,
}: ExecutionControlsPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 right-0 z-[100] w-72 rounded-xl border border-zinc-700/60 bg-zinc-950/95 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      role="dialog"
      aria-label="Execution controls"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Execution Limits
        </span>
        {isCustom && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-amber-400/80 hover:text-amber-300 transition-colors cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-3 px-3 py-3">
        {/* Turn Timeout */}
        <SliderControl
          label="Turn timeout"
          value={config.turnTimeoutMs}
          min={BOUNDS.turnTimeoutMs.min}
          max={BOUNDS.turnTimeoutMs.max}
          step={BOUNDS.turnTimeoutMs.step}
          format={formatTimeout}
          defaultValue={DEFAULTS.turnTimeoutMs}
          onChange={onTurnTimeoutChange}
        />

        {/* Max Tool Calls */}
        <SliderControl
          label="Max tool calls"
          value={config.maxToolCalls}
          min={BOUNDS.maxToolCalls.min}
          max={BOUNDS.maxToolCalls.max}
          step={BOUNDS.maxToolCalls.step}
          format={formatLimit}
          defaultValue={DEFAULTS.maxToolCalls}
          onChange={onMaxToolCallsChange}
        />
      </div>

      {/* Provider-owned limits (read-only) */}
      <div className="border-t border-zinc-800/60 px-3 py-2">
        <div className="text-[10px] text-zinc-600 space-y-1">
          <div className="flex justify-between">
            <span>Context window</span>
            <span className="text-zinc-500">128K tokens (provider)</span>
          </div>
          <div className="flex justify-between">
            <span>Max output</span>
            <span className="text-zinc-500">8,192 tokens (provider)</span>
          </div>
          <div className="flex justify-between">
            <span>Iterations</span>
            <span className="text-zinc-500">OpenCode-controlled</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slider Control ──────────────────────────────────────────

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  format,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  defaultValue: number;
  onChange: (v: number) => void;
}) {
  const isDefault = value === defaultValue;
  const isUnlimited = value === 0 && defaultValue === 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-zinc-400">{label}</label>
        <span
          className={`text-[11px] font-mono ${
            isDefault || isUnlimited ? 'text-zinc-600' : 'text-amber-400'
          }`}
        >
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full h-1 appearance-none rounded-full bg-zinc-800 accent-amber-500 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(245,158,11,0.5)]"
        aria-label={label}
      />
    </div>
  );
}
