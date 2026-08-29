import { useCallback, useRef, useState } from 'react';
import type { CustomTheme } from '../../../../../lib/theme';
import {
  parseImportedTheme,
  parseImportedThemes,
  safeValidateCustomTheme,
  safeValidateThemeArray,
} from '../../../../../lib/theme-builder-schemas';
import { useToasts } from '../../../../../components/Toast';
import { Button, input, focus, surface } from '../../../settings-ui';

type MergeStrategy = 'replace' | 'add' | 'update';

interface ImportThemePreview {
  theme: CustomTheme;
  validation: { success: true; data: CustomTheme } | { success: false; error: Error };
  action: 'add' | 'update' | 'skip';
  conflictWith?: CustomTheme;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  existingThemes: CustomTheme[];
  onImport: (themes: CustomTheme[], strategy: MergeStrategy) => void;
}

export function ImportDialog({ open, onClose, existingThemes, onImport }: ImportDialogProps) {
  const { addToast } = useToasts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [pasteJson, setPasteJson] = useState('');
  const [parsedThemes, setParsedThemes] = useState<ImportThemePreview[]>([]);
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('add');
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');

  const validateAndPreview = useCallback(async (json: string) => {
    setIsValidating(true);
    try {
      let themes: CustomTheme[];
      try {
        themes = parseImportedThemes(json);
      } catch {
        const single = parseImportedTheme(json);
        themes = [single];
      }

      const previews: ImportThemePreview[] = themes.map((theme) => {
        const validation = safeValidateCustomTheme(theme);
        const existing = existingThemes.find((t) => t.id === theme.id);
        let action: 'add' | 'update' | 'skip' = 'add';
        if (existing) {
          action = mergeStrategy === 'replace' ? 'update' : mergeStrategy === 'update' ? 'update' : 'skip';
        }
        return {
          theme,
          validation,
          action,
          conflictWith: existing,
        };
      });

      setParsedThemes(previews);
      setShowPreview(true);
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to parse JSON',
      });
      setParsedThemes([]);
      setShowPreview(false);
    } finally {
      setIsValidating(false);
    }
  }, [addToast, existingThemes, mergeStrategy]);

  const handleFileSelect = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        validateAndPreview(text);
      };
      reader.readAsText(file);
    },
    [validateAndPreview],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/json') {
        handleFileSelect(file);
      } else {
        addToast({ type: 'error', message: 'Please drop a .json file' });
      }
    },
    [addToast, handleFileSelect],
  );

  const handlePasteSubmit = useCallback(() => {
    if (pasteJson.trim()) {
      validateAndPreview(pasteJson);
    }
  }, [pasteJson, validateAndPreview]);

  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  const handleImport = useCallback(() => {
    const validThemes = parsedThemes
      .filter((p) => p.validation.success && p.action !== 'skip')
      .map((p) => p.validation.success ? p.validation.data : p.theme);

    if (validThemes.length === 0) {
      addToast({ type: 'warning', message: 'No valid themes to import' });
      return;
    }

    onImport(validThemes, mergeStrategy);
    addToast({ type: 'success', message: `Imported ${validThemes.length} theme${validThemes.length > 1 ? 's' : ''}` });
    onClose();
    setPasteJson('');
    setParsedThemes([]);
    setShowPreview(false);
  }, [parsedThemes, mergeStrategy, onImport, onClose, addToast]);

  const getValidationErrors = (preview: ImportThemePreview): string[] => {
    if (!preview.validation.success) {
      return preview.validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    }
    return [];
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-dialog-title"
    >
      <div className={`w-full max-w-3xl max-h-[90vh] overflow-hidden ${surface} rounded-[var(--vestara-radius-lg)] shadow-xl`}>
        <header className="flex items-center justify-between border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3">
          <h2 id="import-dialog-title" className="text-base font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Import Themes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[var(--vestara-radius)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] transition-colors"
            aria-label="Close import dialog"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="flex gap-2 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pb-4" role="tablist" aria-label="Import method">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'file'}
              aria-controls="file-panel"
              id="file-tab"
              onClick={() => setActiveTab('file')}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
                activeTab === 'file'
                  ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                  : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'
              }`}
            >
              File Upload
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'paste'}
              aria-controls="paste-panel"
              id="paste-tab"
              onClick={() => setActiveTab('paste')}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
                activeTab === 'paste'
                  ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                  : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'
              }`}
            >
              Paste JSON
            </button>
          </div>

          <div role="tabpanel" id="file-panel" aria-labelledby="file-tab" hidden={activeTab !== 'file'}>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleFileClick}
              className={`relative border-2 border-dashed rounded-[var(--vestara-radius-lg)] p-8 text-center transition-colors cursor-pointer ${
                dragActive
                  ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]'
                  : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleFileClick()}
              aria-label="Drop zone for theme file"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-hidden="true"
                tabIndex={-1}
              />
              <svg
                className={`mx-auto size-12 transition-colors ${dragActive ? 'text-[var(--vestara-accent)]' : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="mt-3 text-sm text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                {dragActive ? 'Drop .json file here' : 'Drag & drop .json file, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                Supports single theme or array of themes
              </p>
            </div>
          </div>

          <div role="tabpanel" id="paste-panel" aria-labelledby="paste-tab" hidden={activeTab !== 'paste'}>
            <label htmlFor="paste-json" className="sr-only">
              Paste theme JSON
            </label>
            <textarea
              id="paste-json"
              value={pasteJson}
              onChange={(e) => setPasteJson(e.target.value)}
              placeholder='Paste theme JSON here... Example: {"id": "custom-1", "name": "My Theme", ...}'
              className={`${input} min-h-[150px] font-mono text-xs resize-y`}
              aria-describedby="paste-hint"
            />
            <p id="paste-hint" className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              Paste a single theme object or an array of themes
            </p>
            <Button onClick={handlePasteSubmit} disabled={!pasteJson.trim() || isValidating} className="mt-2">
              {isValidating ? 'Validating…' : 'Validate & Preview'}
            </Button>
          </div>

          {showPreview && (
            <div className="space-y-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] pt-4">
              <h3 className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                Preview ({parsedThemes.length} theme{parsedThemes.length !== 1 ? 's' : ''})
              </h3>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
                  Merge Strategy
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: 'replace', label: 'Replace All', desc: 'Clear existing, import new' },
                      { value: 'add', label: 'Add New', desc: 'Import only themes with new IDs' },
                      { value: 'update', label: 'Update Existing', desc: 'Update matching IDs, add new' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 rounded-[var(--vestara-radius)] border p-2 text-xs cursor-pointer transition-colors ${
                        mergeStrategy === opt.value
                          ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)]'
                          : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] hover:border-[var(--vestara-accent-border-hover)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="merge-strategy"
                        value={opt.value}
                        checked={mergeStrategy === opt.value}
                        onChange={() => setMergeStrategy(opt.value as MergeStrategy)}
                        className="accent-[var(--vestara-accent)]"
                      />
                      <div>
                        <span className="font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                          {opt.label}
                        </span>
                        <span className="ml-2 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                          {opt.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="max-h-64 overflow-auto space-y-2" role="list" aria-label="Themes to import">
                {parsedThemes.map((preview, index) => {
                  const errors = getValidationErrors(preview);
                  const isValid = preview.validation.success;
                  return (
                    <div
                      key={`${preview.theme.id}-${index}`}
                      className={`rounded-[var(--vestara-radius)] border p-3 ${
                        isValid
                          ? 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'
                          : 'border-[var(--vestara-red)/50] bg-[var(--vestara-red)/5]'
                      }`}
                      role="listitem"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                              {preview.theme.name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--vestara-radius)] text-[10px] font-medium ${
                                preview.action === 'add'
                                  ? 'bg-[var(--vestara-green)/10] text-[var(--vestara-green)]'
                                  : preview.action === 'update'
                                  ? 'bg-[var(--vestara-amber)/10] text-[var(--vestara-amber)]'
                                  : 'bg-[var(--vestara-color-border-default,var(--color-zinc-700))] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]'
                              }`}
                            >
                              {preview.action === 'add' && 'Add'}
                              {preview.action === 'update' && 'Update'}
                              {preview.action === 'skip' && 'Skip (conflict)'}
                            </span>
                            {!isValid && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--vestara-radius)] text-[10px] font-medium bg-[var(--vestara-red)/10] text-[var(--vestara-red)]">
                                Invalid
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                            {preview.theme.description || 'No description'}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                            <span>Tokens: {Object.keys(preview.theme.tokens).length}</span>
                            <span>Base: {preview.theme.baseThemeId}</span>
                            {preview.theme.tuiPalette && <span>TUI palette: yes</span>}
                          </div>
                          {errors.length > 0 && (
                            <div className="mt-2 text-[10px] text-[var(--vestara-red)] space-y-0.5" role="alert">
                              {errors.map((err, i) => (
                                <div key={i}>• {err}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newPreviews = [...parsedThemes];
                            newPreviews[index] = { ...newPreviews[index], action: newPreviews[index].action === 'skip' ? 'add' : 'skip' };
                            setParsedThemes(newPreviews);
                          }}
                          className="shrink-0 p-1 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]"
                          aria-label={preview.action === 'skip' ? 'Include this theme' : 'Exclude this theme'}
                        >
                          {preview.action === 'skip' ? (
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          ) : (
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
                <Button onClick={onClose}>Cancel</Button>
                <Button primary onClick={handleImport} disabled={isValidating}>
                  {isValidating ? 'Importing…' : `Import ${parsedThemes.filter((p) => p.validation.success && p.action !== 'skip').length} Theme${parsedThemes.filter((p) => p.validation.success && p.action !== 'skip').length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          )}

          {!showPreview && activeTab === 'file' && (
            <p className="text-center text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] py-8">
              Drop a .json file or click to browse to begin import
            </p>
          )}

          {!showPreview && activeTab === 'paste' && pasteJson.trim() === '' && (
            <p className="text-center text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] py-8">
              Paste theme JSON and click "Validate & Preview" to begin
            </p>
          )}
        </div>
      </div>
    </div>
  );
}