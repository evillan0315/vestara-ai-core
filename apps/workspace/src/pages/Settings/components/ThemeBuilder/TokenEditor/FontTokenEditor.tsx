import { useMemo, useCallback } from 'react';
import type { SemanticToken } from '../../../../../lib/theme';
import { Segmented, input, focus } from '../../../settings-ui';

interface FontTokenEditorProps {
  token: SemanticToken;
  currentValue: string;
  onUpdate: (value: string) => void;
  onReset: () => void;
}

const FONT_FAMILY_OPTIONS = [
  { value: 'ui-sans-serif, system-ui, -apple-system, sans-serif', label: 'System' },
  { value: 'ui-serif, "Times New Roman", Georgia, serif', label: 'Serif' },
  { value: 'ui-monospace, "JetBrains Mono", "Fira Code", monospace', label: 'Mono' },
] as const;

const FONT_SIZE_OPTIONS = [
  { value: '10.75px', label: 'XS' },
  { value: '12.25px', label: 'SM' },
  { value: '14.25px', label: 'Base' },
  { value: '16.25px', label: 'LG' },
] as const;

const FONT_WEIGHT_OPTIONS = [
  { value: '400', label: 'Normal' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
] as const;

function getFontFamilyOptions(token: SemanticToken) {
  if (token.name === 'typography-font-family') {
    return FONT_FAMILY_OPTIONS;
  }
  return [];
}

function getFontSizeOptions(token: SemanticToken) {
  if (token.name.startsWith('typography-font-size')) {
    return FONT_SIZE_OPTIONS;
  }
  return [];
}

function getFontWeightOptions(token: SemanticToken) {
  if (token.name.startsWith('typography-font-weight')) {
    return FONT_WEIGHT_OPTIONS;
  }
  return [];
}

export function FontTokenEditor({
  token,
  currentValue,
  onUpdate,
  onReset,
}: FontTokenEditorProps) {
  const fontFamilyOptions = useMemo(() => getFontFamilyOptions(token), [token]);
  const fontSizeOptions = useMemo(() => getFontSizeOptions(token), [token]);
  const fontWeightOptions = useMemo(() => getFontWeightOptions(token), [token]);

  const handleChange = useCallback(
    (value: string) => {
      onUpdate(value);
    },
    [onUpdate]
  );

  const isModified = currentValue !== token.defaultValue;

  if (fontFamilyOptions.length > 0) {
    return (
      <div className="flex items-center gap-2" role="group" aria-label={`${token.label} font family`}>
        <select
          value={currentValue}
          onChange={(e) => handleChange(e.target.value)}
          className={input}
          style={{ minWidth: '200px' }}
          aria-label={token.label}
        >
          {fontFamilyOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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

  if (fontSizeOptions.length > 0) {
    const currentIndex = fontSizeOptions.findIndex((o) => o.value === currentValue);
    const selectedValue = currentIndex >= 0 ? fontSizeOptions[currentIndex].value : fontSizeOptions[1].value;

    return (
      <div className="flex items-center gap-2" role="group" aria-label={`${token.label} font size`}>
        <Segmented
          label={token.label}
          value={selectedValue}
          options={fontSizeOptions.map((o) => o.value) as readonly string[]}
          onChange={handleChange}
        />
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

  if (fontWeightOptions.length > 0) {
    const currentIndex = fontWeightOptions.findIndex((o) => o.value === currentValue);
    const selectedValue = currentIndex >= 0 ? fontWeightOptions[currentIndex].value : fontWeightOptions[0].value;

    return (
      <div className="flex items-center gap-2" role="group" aria-label={`${token.label} font weight`}>
        <Segmented
          label={token.label}
          value={selectedValue}
          options={fontWeightOptions.map((o) => o.value) as readonly string[]}
          onChange={handleChange}
        />
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

  return (
    <input
      type="text"
      value={currentValue}
      onChange={(e) => handleChange(e.target.value)}
      className={input}
      style={{ width: '200px' }}
      aria-label={token.label}
    />
  );
}