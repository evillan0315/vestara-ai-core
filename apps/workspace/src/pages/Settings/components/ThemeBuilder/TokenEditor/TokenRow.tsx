import { useMemo, useCallback, useState, useRef } from 'react';
import type { SemanticToken } from '../../../../../lib/theme';
import { ColorTokenEditor } from './ColorTokenEditor';
import { LengthTokenEditor } from './LengthTokenEditor';
import { FontTokenEditor } from './FontTokenEditor';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context';
import { surface, focus, input } from '../../../settings-ui';

interface TokenRowProps {
  token: SemanticToken;
}

function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback(() => {
    if (triggerRef.current && tooltipRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2 - tooltipRect.width / 2,
      });
      setIsVisible(true);
    }
  }, []);

  const hideTooltip = useCallback(() => {
    setIsVisible(false);
  }, []);

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={isVisible ? 'tooltip' : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className="flex h-6 w-6 items-center justify-center rounded-[var(--vestara-radius)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))] transition-colors"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v4M10 14h.01" />
        </svg>
      </button>
      {isVisible && (
        <div
          ref={tooltipRef}
          id="token-tooltip"
          role="tooltip"
          className="fixed z-50 max-w-xs rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 py-2 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] shadow-[0_12px_36px_rgb(0_0_0/0.18)] pointer-events-none"
          style={{ top: position.top, left: position.left }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function TokenValueDisplay({ token, currentValue }: { token: SemanticToken; currentValue: string }) {
  if (token.type === 'color') {
    return (
      <span className="flex items-center gap-2">
        <span
          className="size-6 shrink-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))]"
          style={{ backgroundColor: currentValue }}
          aria-label={`Current color: ${currentValue}`}
        />
        <code className="font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
          {currentValue}
        </code>
      </span>
    );
  }
  if (token.type === 'length') {
    return (
      <code className="font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
        {currentValue}
      </code>
    );
  }
  if (token.type === 'font-stack') {
    return (
      <code className="font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] max-w-[200px] truncate block">
        {currentValue}
      </code>
    );
  }
  return (
    <code className="font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
      {currentValue}
    </code>
  );
}

function ResetButton({ token, onReset, disabled }: { token: SemanticToken; onReset: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={disabled}
      aria-label={`Reset ${token.label} to default`}
      className="flex h-8 w-8 items-center justify-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:border-[var(--vestara-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      title="Reset to default"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 4v12M4 10h12" />
      </svg>
    </button>
  );
}

export function TokenRow({ token }: TokenRowProps) {
  const { updateToken, resetToken, editingTheme, getTokenByCssVar } = useThemeBuilder();

  const tokenDef = useMemo(() => getTokenByCssVar(token.cssVar), [getTokenByCssVar, token.cssVar]);
  const currentValue = useMemo(() => {
    if (!editingTheme) return token.defaultValue;
    if (token.lightValue && editingTheme.lightTokens?.[token.cssVar]) {
      return editingTheme.lightTokens[token.cssVar];
    }
    if (token.darkValue && editingTheme.darkTokens?.[token.cssVar]) {
      return editingTheme.darkTokens[token.cssVar];
    }
    return editingTheme.tokens[token.cssVar] ?? token.defaultValue;
  }, [editingTheme, token]);

  const isModified = currentValue !== token.defaultValue;
  const hasLightDark = Boolean(token.lightValue || token.darkValue);

  const handleUpdate = useCallback((value: string, mode?: 'light' | 'dark') => {
    updateToken(token.cssVar, value, mode);
  }, [updateToken, token.cssVar]);

  const handleReset = useCallback(() => {
    resetToken(token.cssVar);
  }, [resetToken, token.cssVar]);

  const EditorControl = useMemo(() => {
    switch (token.type) {
      case 'color':
        return (
          <ColorTokenEditor
            token={token}
            currentValue={currentValue}
            onUpdate={handleUpdate}
            onReset={handleReset}
            hasLightDark={hasLightDark}
          />
        );
      case 'length':
        return (
          <LengthTokenEditor
            token={token}
            currentValue={currentValue}
            onUpdate={handleUpdate}
            onReset={handleReset}
          />
        );
      case 'font-stack':
        return (
          <FontTokenEditor
            token={token}
            currentValue={currentValue}
            onUpdate={handleUpdate}
            onReset={handleReset}
          />
        );
      default:
        return (
          <input
            type="text"
            value={currentValue}
            onChange={(e) => handleUpdate(e.target.value)}
            className={input}
            style={{ width: '120px' }}
            aria-label={token.label}
          />
        );
    }
  }, [token, currentValue, handleUpdate, handleReset, hasLightDark]);

  return (
    <div
      className="group grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5 sm:px-5 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] last:border-b-0"
      role="listitem"
    >
      <div className="flex items-center gap-3 min-w-0">
        <label
          htmlFor={`token-${token.cssVar}`}
          className="flex items-center gap-2 min-w-[200px] sm:min-w-[240px]"
        >
          <span className="text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] truncate">
            {token.label}
          </span>
          {token.description && (
            <Tooltip label={token.description}>
              <span className="sr-only">{token.description}</span>
            </Tooltip>
          )}
        </label>
        <span id={`token-${token.cssVar}-var`} className="hidden size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] font-mono text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:grid">
          {token.cssVar}
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 sm:justify-center">
        <TokenValueDisplay token={token} currentValue={currentValue} />
      </div>

      <div className="flex items-center justify-end gap-2 sm:justify-center min-w-[200px]">
        {EditorControl}
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0">
        <ResetButton token={token} onReset={handleReset} disabled={!isModified} />
      </div>
    </div>
  );
}