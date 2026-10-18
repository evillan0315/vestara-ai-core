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

// GA-EXEC-003: must mirror the adapter (TURN_TIMEOUT_MS 60m /
// DEFAULT_MAX_TOOL_CALLS 150) and useGAExecutionConfig DEFAULTS.
const DEFAULTS = { turnTimeoutMs: 60 * 60 * 1000, maxToolCalls: 150 };

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
      className="absolute bottom-full mb-2 right-0 z-[100] w-72 rounded-xl border border-(--vestara-border-default)/60 bg-(--vestara-surface-canvas)/95 shadow-(--vestara-elevation-floating) backdrop-blur-xl"
      role="dialog"
      aria-label="Execution controls"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--vestara-border-default)/60 px-3 py-2">
        <span className="text-(--vestara-font-size-label) font-medium uppercase tracking-wider text-(--vestara-text-secondary)">
          Execution Limits
        </span>
        {isCustom && (
          <button
            type="button"
            onClick={onReset}
            className="text-(--vestara-font-size-caption) text-(--vestara-accent-text)/80 hover:text-(--vestara-accent-text) transition-colors cursor-pointer"
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
      <div className="border-t border-(--vestara-border-default)/60 px-3 py-2">
        <div className="text-(--vestara-font-size-caption) text-(--vestara-text-disabled) space-y-1">
          <div className="flex justify-between">
            <span>Context window</span>
            <span className="text-(--vestara-text-muted)">128K tokens (provider)</span>
          </div>
          <div className="flex justify-between">
            <span>Max output</span>
            <span className="text-(--vestara-text-muted)">8,192 tokens (provider)</span>
          </div>
          <div className="flex justify-between">
            <span>Iterations</span>
            <span className="text-(--vestara-text-muted)">OpenCode-controlled</span>
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
        <label className="text-(--vestara-font-size-label) text-(--vestara-text-secondary)">{label}</label>
        <span
          className={`text-(--vestara-font-size-label) font-mono ${
            isDefault || isUnlimited ? 'text-(--vestara-text-disabled)' : 'text-(--vestara-accent-text)'
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
        className="w-full h-1 appearance-none rounded-full bg-(--vestara-surface-interactive) accent-(--vestara-accent) cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-(--vestara-accent) [&::-webkit-slider-thumb]:shadow-[0_0_6px_color-mix(in_srgb,var(--vestara-accent)_50%,transparent)]"
        aria-label={label}
      />
    </div>
  );
}
