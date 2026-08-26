import { useState, useCallback, useMemo } from 'react';
import type { SemanticToken } from '../../../../../lib/theme';
import { input, focus } from '../../../settings-ui';

interface ColorTokenEditorProps {
  token: SemanticToken;
  currentValue: string;
  onUpdate: (value: string, mode?: 'light' | 'dark') => void;
  onReset: () => void;
  hasLightDark: boolean;
}

export function ColorTokenEditor({
  token,
  currentValue,
  onUpdate,
  onReset,
  hasLightDark,
}: ColorTokenEditorProps) {
  const [lightValue, setLightValue] = useState(token.lightValue || token.defaultValue);
  const [darkValue, setDarkValue] = useState(token.darkValue || token.defaultValue);
  const [showLightDark, setShowLightDark] = useState(hasLightDark);

  const handleLightChange = useCallback(
    (value: string) => {
      setLightValue(value);
      onUpdate(value, 'light');
    },
    [onUpdate]
  );

  const handleDarkChange = useCallback(
    (value: string) => {
      setDarkValue(value);
      onUpdate(value, 'dark');
    },
    [onUpdate]
  );

  const handleValueChange = useCallback(
    (value: string) => {
      onUpdate(value);
    },
    [onUpdate]
  );

  const editors = useMemo(() => {
    if (showLightDark && hasLightDark) {
      return (
        <div className="flex items-center gap-3" role="group" aria-label={`${token.label} color pickers`}>
          <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
            <label
              htmlFor={`color-${token.cssVar}-light`}
              className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
            >
              Light
            </label>
            <div className="relative">
              <input
                id={`color-${token.cssVar}-light`}
                type="color"
                value={lightValue}
                onChange={(e) => handleLightChange(e.target.value)}
                className="h-8 w-12 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] cursor-pointer"
                aria-label={`${token.label} light mode color`}
              />
              <input
                type="text"
                value={lightValue}
                onChange={(e) => handleLightChange(e.target.value)}
                className="absolute inset-0 h-8 w-12 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-transparent px-2 text-[var(--vestara-font-size-xs)] font-mono text-[var(--vestara-color-text-primary,var(--vestara-text))] pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
            <label
              htmlFor={`color-${token.cssVar}-dark`}
              className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
            >
              Dark
            </label>
            <div className="relative">
              <input
                id={`color-${token.cssVar}-dark`}
                type="color"
                value={darkValue}
                onChange={(e) => handleDarkChange(e.target.value)}
                className="h-8 w-12 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] cursor-pointer"
                aria-label={`${token.label} dark mode color`}
              />
              <input
                type="text"
                value={darkValue}
                onChange={(e) => handleDarkChange(e.target.value)}
                className="absolute inset-0 h-8 w-12 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-transparent px-2 text-[var(--vestara-font-size-xs)] font-mono text-[var(--vestara-color-text-primary,var(--vestara-text))] pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2" role="group" aria-label={`${token.label} color picker`}>
        <div className="relative">
          <input
            id={`color-${token.cssVar}`}
            type="color"
            value={currentValue}
            onChange={(e) => handleValueChange(e.target.value)}
            className="h-8 w-12 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] cursor-pointer"
            aria-label={`${token.label} color`}
          />
          <input
            type="text"
            value={currentValue}
            onChange={(e) => handleValueChange(e.target.value)}
            className={input}
            style={{ width: '90px' }}
            aria-label={`${token.label} hex value`}
          />
        </div>
        {hasLightDark && (
          <button
            type="button"
            onClick={() => setShowLightDark(!showLightDark)}
            aria-label={showLightDark ? 'Show single color picker' : 'Show light/dark color pickers'}
            aria-pressed={showLightDark}
            className="flex h-8 min-w-8 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] transition-colors"
            title={showLightDark ? 'Show single color picker' : 'Show light/dark color pickers'}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="10" r="4" />
              <path d="M10 2v4M10 14v4M2 10h4M14 10h4" />
            </svg>
          </button>
        )}
      </div>
    );
  }, [
    token,
    currentValue,
    lightValue,
    darkValue,
    showLightDark,
    hasLightDark,
    handleLightChange,
    handleDarkChange,
    handleValueChange,
  ]);

  return <>{editors}</>;
}