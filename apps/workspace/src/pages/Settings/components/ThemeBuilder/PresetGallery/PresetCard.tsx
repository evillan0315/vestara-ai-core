import { useEffect, useRef, useState } from 'react';
import { VestaraModal } from '../../../../../components/ui/VestaraModal.js';
import type { CustomTheme } from '../../../../../lib/theme.js';
import { useTheme } from '../../../../../lib/theme.js';
import { Button, focus, surface } from '../../../settings-ui.js';

interface PresetCardProps {
  theme: CustomTheme;
  onCustomize: () => void;
  onApply: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  isDragging?: boolean;
  dragHandleProps?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
}

function generateThumbnailStyle(theme: CustomTheme): React.CSSProperties {
  const accentToken = theme.tokens['--vestara-accent'] || theme.tokens['--color-accent-primary'] || '#f59e0b';
  const _accentLightToken =
    theme.lightTokens?.['--vestara-accent-light'] || theme.lightTokens?.['--color-accent-light'] || '#fbbf24';
  const accentDarkToken =
    theme.darkTokens?.['--vestara-accent-dark'] || theme.darkTokens?.['--color-accent-dark'] || '#d97706';
  const bgApp = theme.tokens['--color-bg-app'] || '#09090b';
  const bgElevated = theme.tokens['--color-bg-elevated'] || '#18181b';
  const surfacePanel = theme.tokens['--color-surface-panel'] || '#18181b';
  const borderDefault = theme.tokens['--color-border-default'] || '#3f3f46';
  const _textPrimary = theme.tokens['--vestara-text'] || '#e4e4e7';
  const _textMuted = theme.tokens['--vestara-text-muted'] || '#71717a';

  const _lightBgApp = theme.lightTokens?.['--color-bg-app'] || '#fafaf5';
  const _lightBgElevated = theme.lightTokens?.['--color-bg-elevated'] || '#f0f0ea';
  const _lightSurfacePanel = theme.lightTokens?.['--color-surface-panel'] || '#f0f0ea';
  const _lightBorderDefault = theme.lightTokens?.['--color-border-default'] || '#c8c8c0';
  const _lightTextPrimary = theme.lightTokens?.['--vestara-text'] || '#3a3a34';
  const _lightTextMuted = theme.lightTokens?.['--vestara-text-muted'] || '#888880';

  return {
    background: `
      linear-gradient(135deg, ${bgApp} 0%, ${bgElevated} 50%, ${surfacePanel} 100%),
      linear-gradient(135deg, ${accentToken} 0%, ${accentDarkToken} 100%)
    `
      .replace(/\s+/g, ' ')
      .trim(),
    backgroundSize: '100% 100%, 60% 40%',
    backgroundPosition: '0 0, right top',
    backgroundRepeat: 'no-repeat',
    border: `1px solid ${borderDefault}`,
    position: 'relative',
    overflow: 'hidden',
  } as React.CSSProperties;
}

function generateLightThumbnailStyle(theme: CustomTheme): React.CSSProperties {
  const accentToken = theme.lightTokens?.['--vestara-accent'] || theme.tokens['--color-accent-primary'] || '#b45309';
  const _accentLightToken = theme.lightTokens?.['--vestara-accent-light'] || '#d97706';
  const accentDarkToken = theme.lightTokens?.['--vestara-accent-dark'] || '#92400e';
  const bgApp = theme.lightTokens?.['--color-bg-app'] || '#fafaf5';
  const bgElevated = theme.lightTokens?.['--color-bg-elevated'] || '#f0f0ea';
  const surfacePanel = theme.lightTokens?.['--color-surface-panel'] || '#f0f0ea';
  const borderDefault = theme.lightTokens?.['--color-border-default'] || '#c8c8c0';

  return {
    background: `
      linear-gradient(135deg, ${bgApp} 0%, ${bgElevated} 50%, ${surfacePanel} 100%),
      linear-gradient(135deg, ${accentToken} 0%, ${accentDarkToken} 100%)
    `
      .replace(/\s+/g, ' ')
      .trim(),
    backgroundSize: '100% 100%, 60% 40%',
    backgroundPosition: '0 0, right top',
    backgroundRepeat: 'no-repeat',
    border: `1px solid ${borderDefault}`,
    position: 'relative',
    overflow: 'hidden',
  } as React.CSSProperties;
}

export function PresetCard({
  theme,
  onCustomize,
  onApply,
  onDuplicate,
  onDelete,
  onExport,
  isDragging = false,
  dragHandleProps,
}: PresetCardProps) {
  const { resolved } = useTheme();
  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showActions) {
        setShowActions(false);
      }
    };
    if (showActions) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showActions]);

  const thumbnailStyle = resolved === 'light' ? generateLightThumbnailStyle(theme) : generateThumbnailStyle(theme);

  const isBuiltIn = theme.isBuiltIn;
  const accentColor = theme.tokens['--vestara-accent'] || theme.tokens['--color-accent-primary'] || '#f59e0b';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowActions(true);
      setTimeout(() => cardRef.current?.querySelector('[data-action="customize"]')?.focus(), 0);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Let grid navigation handle arrows
    }
  };

  return (
    <>
      <article
        ref={cardRef}
        className={`group relative overflow-hidden transition-all duration-200 ${surface} rounded-[var(--vestara-radius-lg)] border ${focus} ${
          isDragging ? 'opacity-50 rotate-2 shadow-xl z-10' : ''
        } ${theme.isBuiltIn ? '' : 'hover:shadow-[0_8px_24px_rgb(0_0_0/0.3)]'}`}
        style={{ borderColor: 'var(--vestara-color-border-subtle, var(--color-zinc-800))' }}
        onMouseEnter={() => !isDragging && setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        onFocusWithin={() => setShowActions(true)}
        onBlur={() => setShowActions(false)}
        onKeyDown={handleKeyDown}
        aria-label={`${theme.name}${isBuiltIn ? ' (built-in)' : ' (custom)'}`}
        draggable={!isBuiltIn}
        {...dragHandleProps}
      >
        <div className="aspect-[4/3] relative overflow-hidden" style={thumbnailStyle} aria-hidden="true">
          <div
            className="absolute bottom-2 right-2 size-6 rounded-full border-2 flex items-center justify-center"
            style={{
              backgroundColor: accentColor,
              borderColor: accentColor,
            }}
            aria-hidden="true"
          >
            <span className="text-[10px] text-black/80" aria-hidden="true">
              ✦
            </span>
          </div>
          {isDragging && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center" aria-hidden="true">
              <span className="text-lg text-white font-mono">⠿ Drag to reorder</span>
            </div>
          )}
        </div>

        <div className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] truncate">
                {theme.name}
              </h4>
              <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] truncate mt-0.5">
                {theme.description}
              </p>
            </div>
            {isBuiltIn && (
              <span className="shrink-0 text-[10px] font-mono text-[var(--vestara-accent-text)] px-1.5 py-0.5 rounded-[var(--vestara-radius)] bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)]">
                Built-in
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden="true" />
              <span>{theme.baseThemeId}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded-[var(--vestara-radius)] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
              {theme.profile?.colorTheme ? theme.profile.colorTheme : 'default'}
            </span>
          </div>

          <fieldset
            className={`flex items-center gap-1.5 transition-opacity duration-200 ${
              showActions ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
            aria-label="Theme actions"
          >
            <Button
              data-action="customize"
              size="sm"
              onClick={onCustomize}
              className="flex-1 min-h-8 text-xs"
              aria-label={`Customize ${theme.name}`}
            >
              {isBuiltIn ? 'Customize' : 'Edit'}
            </Button>
            <Button
              size="sm"
              primary
              onClick={onApply}
              className="flex-1 min-h-8 text-xs"
              aria-label={`Apply ${theme.name}`}
            >
              Apply
            </Button>
            {!isBuiltIn && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDuplicate}
                  className="min-h-8 p-1.5"
                  aria-label={`Duplicate ${theme.name}`}
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onExport}
                  className="min-h-8 p-1.5"
                  aria-label={`Export ${theme.name}`}
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="min-h-8 p-1.5 text-[var(--vestara-red)] hover:bg-[color-mix(in_srgb,var(--vestara-red)_10%,transparent)]"
                  aria-label={`Delete ${theme.name}`}
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </Button>
              </>
            )}
          </fieldset>
        </div>

        {dragHandleProps && !isBuiltIn && (
          <button
            type="button"
            draggable
            onDragStart={dragHandleProps.onDragStart}
            onDragEnd={dragHandleProps.onDragEnd}
            className="absolute top-2 left-2 cursor-grab active:cursor-grabbing text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-accent)] transition-colors select-none opacity-40 hover:opacity-100 leading-none p-1 rounded hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] border border-transparent hover:border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dragHandleProps.onDragStart(e as unknown as React.DragEvent);
              }
            }}
          >
            <span className="text-xs">⠿</span>
          </button>
        )}
      </article>

      <VestaraModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        className="max-w-sm"
        ariaLabel={`Delete ${theme.name}`}
      >
        <div className="p-5">
          <h3 className="text-sm font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-2">
            Delete Theme
          </h3>
          <p className="text-xs text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] mb-1">
            Are you sure you want to delete this custom theme?
          </p>
          <p className="text-xs text-[var(--vestara-color-text-primary,var(--vestara-text))] font-mono bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)/50] rounded p-2 mb-3">
            {theme.name}
          </p>
          <p className="text-[10px] text-[var(--vestara-red)] mb-4">This action cannot be undone.</p>
          <div className="flex items-center gap-2 justify-end">
            <Button onClick={() => setShowDeleteConfirm(false)} className="text-xs px-3 py-1.5">
              Cancel
            </Button>
            <Button
              primary
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
              className="text-xs px-4 py-1.5 bg-[var(--vestara-red)] hover:bg-[var(--vestara-red)]/80 border-[var(--vestara-red)]"
            >
              Delete
            </Button>
          </div>
        </div>
      </VestaraModal>
    </>
  );
}
