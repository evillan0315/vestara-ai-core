import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { SemanticToken } from '../../../../../lib/theme';
import { input, focus } from '../../../settings-ui';

interface LengthTokenEditorProps {
  token: SemanticToken;
  currentValue: string;
  onUpdate: (value: string) => void;
  onReset: () => void;
}

function parseLength(value: string): { num: number; unit: string } {
  const match = value.match(/^([\d.]+)(.*)$/);
  if (!match) return { num: 0, unit: 'px' };
  const num = parseFloat(match[1]);
  const unit = match[2] || 'px';
  return { num, unit };
}

function getSliderConfig(token: SemanticToken, unit: string): { min: number; max: number; step: number } {
  const { num: defaultNum } = parseLength(token.defaultValue);

  if (token.category === 'radius') {
    if (unit === 'px') return { min: 0, max: 50, step: 1 };
    return { min: 0, max: 3, step: 0.1 };
  }
  if (token.category === 'spacing') {
    if (unit === 'rem') return { min: 0, max: 5, step: 0.125 };
    if (unit === 'px') return { min: 0, max: 80, step: 1 };
    return { min: 0, max: 5, step: 0.125 };
  }
  if (token.category === 'typography') {
    if (unit === 'px') return { min: 8, max: 48, step: 0.25 };
    return { min: 0.5, max: 3, step: 0.125 };
  }
  if (unit === 'px') return { min: 0, max: 100, step: 1 };
  if (unit === 'rem') return { min: 0, max: 10, step: 0.125 };
  if (unit === 'em') return { min: 0, max: 10, step: 0.125 };
  return { min: 0, max: 100, step: 1 };
}

export function LengthTokenEditor({
  token,
  currentValue,
  onUpdate,
  onReset,
}: LengthTokenEditorProps) {
  const { num: currentNum, unit } = parseLength(currentValue);
  const { num: defaultNum } = parseLength(token.defaultValue);
  const config = getSliderConfig(token, unit);

  const [sliderValue, setSliderValue] = useState(currentNum);
  const [inputValue, setInputValue] = useState(currentValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateValue = useCallback(
    (value: string) => {
      setInputValue(value);
      const { num } = parseLength(value);
      setSliderValue(num);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(value);
      }, 150);
    },
    [onUpdate]
  );

  const handleSliderChange = useCallback(
    (value: number) => {
      const newValue = `${value}${unit}`;
      setInputValue(newValue);
      setSliderValue(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(newValue);
      }, 150);
    },
    [onUpdate, unit]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateValue(e.target.value);
    },
    [updateValue]
  );

  const handleInputBlur = useCallback(() => {
    const { num } = parseLength(inputValue);
    if (num < config.min) {
      updateValue(`${config.min}${unit}`);
    } else if (num > config.max) {
      updateValue(`${config.max}${unit}`);
    }
  }, [inputValue, config, unit, updateValue]);

  useEffect(() => {
    setSliderValue(currentNum);
    setInputValue(currentValue);
  }, [currentValue, currentNum]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isModified = currentValue !== token.defaultValue;

  return (
    <div className="flex items-center gap-2" role="group" aria-label={`${token.label} length editor`}>
      <div className="flex-1 min-w-[120px] max-w-[200px]">
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step}
          value={sliderValue}
          onChange={(e) => handleSliderChange(Number(e.target.value))}
          className="w-full accent-[var(--vestara-accent)]"
          aria-label={`${token.label} slider`}
          aria-valuemin={config.min}
          aria-valuemax={config.max}
          aria-valuenow={sliderValue}
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={inputValue.replace(unit, '')}
          onChange={(e) => updateValue(`${e.target.value}${unit}`)}
          onBlur={handleInputBlur}
          min={config.min}
          max={config.max}
          step={config.step}
          className={`${input} w-20 text-center`}
          aria-label={`${token.label} value`}
        />
        <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] shrink-0">
          {unit}
        </span>
      </div>
      {isModified && (
        <button
          type="button"
          onClick={onReset}
          aria-label={`Reset ${token.label} to default`}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] transition-colors"
          title="Reset to default"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </button>
      )}
    </div>
  );
}