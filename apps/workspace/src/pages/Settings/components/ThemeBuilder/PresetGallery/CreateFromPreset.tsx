import { useCallback, useEffect, useState } from 'react';
import { VestaraModal } from '../../../../../components/ui/VestaraModal.js';
import type { CustomTheme } from '../../../../../lib/theme.js';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context.js';
import { Button, input } from '../../../settings-ui.js';

interface CreateFromPresetProps {
  open: boolean;
  onClose: () => void;
  baseTheme: CustomTheme | null;
  existingTheme?: CustomTheme | null;
  onSubmit: (theme: CustomTheme) => void;
}

export function CreateFromPreset({ open, onClose, baseTheme, existingTheme, onSubmit }: CreateFromPresetProps) {
  const { builtInThemes, customThemes, createFromPreset } = useThemeBuilder();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseThemeId, setBaseThemeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allThemes = [...builtInThemes, ...customThemes];

  useEffect(() => {
    if (open) {
      if (existingTheme) {
        setName(existingTheme.name);
        setDescription(existingTheme.description);
        setBaseThemeId(existingTheme.baseThemeId);
      } else if (baseTheme) {
        setName(`${baseTheme.name} (Custom)`);
        setDescription(`Customized from ${baseTheme.name}`);
        setBaseThemeId(baseTheme.id);
      } else {
        setName('');
        setDescription('');
        setBaseThemeId(builtInThemes[0]?.id || '');
      }
      setError(null);
    }
  }, [open, baseTheme, existingTheme, builtInThemes]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Theme name is required');
        return;
      }
      if (!baseThemeId) {
        setError('Base theme is required');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const overrides: Partial<CustomTheme> = {
          name: name.trim(),
          description: description.trim(),
        };

        const newTheme = existingTheme
          ? { ...existingTheme, ...overrides, updatedAt: new Date().toISOString() }
          : createFromPreset(baseThemeId, overrides);

        onSubmit(newTheme);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create theme');
      } finally {
        setLoading(false);
      }
    },
    [name, description, baseThemeId, existingTheme, createFromPreset, onSubmit, onClose],
  );

  if (!open) return null;

  return (
    <VestaraModal
      onClose={onClose}
      className="max-w-md"
      ariaLabel={existingTheme ? 'Edit Custom Theme' : 'Create Theme from Preset'}
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-1">
            {existingTheme ? 'Edit Custom Theme' : 'Create Theme from Preset'}
          </h3>
          <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            {existingTheme
              ? 'Modify the theme details.'
              : 'Give your new theme a name and description, then start customizing.'}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="theme-name"
              className="block text-xs font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] mb-1"
            >
              Theme Name{' '}
              <span className="text-[var(--vestara-red)]" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="theme-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Theme"
              className={input}
              aria-required="true"
              aria-invalid={!!error}
            />
          </div>

          <div>
            <label
              htmlFor="theme-description"
              className="block text-xs font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] mb-1"
            >
              Description
            </label>
            <textarea
              id="theme-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your theme"
              rows={3}
              className={`${input} min-h-[72px] resize-y font-normal`}
            />
          </div>

          <div>
            <label
              htmlFor="base-theme"
              className="block text-xs font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] mb-1"
            >
              Base Theme{' '}
              <span className="text-[var(--vestara-red)]" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="base-theme"
              value={baseThemeId}
              onChange={(e) => setBaseThemeId(e.target.value)}
              className={input}
              aria-required="true"
            >
              {allThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name} {theme.isBuiltIn ? '(Built-in)' : '(Custom)'}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div
              className="text-xs text-[var(--vestara-red)] bg-[color-mix(in_srgb,var(--vestara-red)_10%,transparent)] border border-[color-mix(in_srgb,var(--vestara-red)_30%,transparent)] rounded-[var(--vestara-radius)] p-2"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end pt-2 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
          <Button type="button" onClick={onClose} className="text-xs px-3 py-1.5">
            Cancel
          </Button>
          <Button type="submit" primary disabled={loading} className="text-xs px-4 py-1.5">
            {loading ? 'Creating...' : existingTheme ? 'Save Changes' : 'Create Theme'}
          </Button>
        </div>
      </form>
    </VestaraModal>
  );
}
