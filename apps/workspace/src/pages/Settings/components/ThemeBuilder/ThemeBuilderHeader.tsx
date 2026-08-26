import { useMemo } from 'react';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context';
import { Button, focus } from '../../../settings-ui';

export function ThemeBuilderHeader() {
  const { editingTheme, customThemes, saveTheme, resetEditingTheme, applyThemeToPreview } = useThemeBuilder();

  const hasUnsavedChanges = useMemo(() => {
    if (!editingTheme) return false;
    const existing = customThemes.find((t) => t.id === editingTheme.id);
    if (!existing) return true;
    return (
      JSON.stringify(existing.tokens) !== JSON.stringify(editingTheme.tokens) ||
      JSON.stringify(existing.lightTokens) !== JSON.stringify(editingTheme.lightTokens) ||
      JSON.stringify(existing.darkTokens) !== JSON.stringify(editingTheme.darkTokens) ||
      JSON.stringify(existing.profile) !== JSON.stringify(editingTheme.profile) ||
      existing.name !== editingTheme.name ||
      existing.description !== editingTheme.description
    );
  }, [editingTheme, customThemes]);

  const handleSave = async () => {
    if (!editingTheme) return;
    await saveTheme(editingTheme);
  };

  const handleDiscard = () => {
    resetEditingTheme();
  };

  const handleApply = () => {
    if (!editingTheme) return;
    applyThemeToPreview(editingTheme);
  };

  return (
    <header
      className="flex items-center justify-between gap-4 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 sm:px-5 bg-[var(--vestara-color-surface-panel,var(--color-zinc-950))]"
      role="banner"
    >
      <div className="flex items-center gap-4">
        <h1 className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
          Theme Builder
        </h1>
        {hasUnsavedChanges && (
          <span
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[var(--vestara-radius)] bg-[var(--vestara-amber)]/10 border border-[var(--vestara-amber)]/30 text-[var(--vestara-amber)] text-[var(--vestara-font-size-xs)] font-medium"
            aria-live="polite"
          >
            <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Unsaved changes
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleDiscard}
          disabled={!hasUnsavedChanges}
          className="text-xs"
        >
          Discard
        </Button>
        <Button
          onClick={handleSave}
          primary
          disabled={!hasUnsavedChanges || !editingTheme}
          className="text-xs"
        >
          Save Theme
        </Button>
        <Button
          onClick={handleApply}
          primary
          disabled={!editingTheme}
          className="text-xs"
        >
          Apply
        </Button>
      </div>
    </header>
  );
}