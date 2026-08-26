import { useCallback, useMemo, useState } from 'react';
import type { CustomTheme } from '../../../../../lib/theme';
import { serializeThemeForExport, serializeThemesForExport } from '../../../../../lib/theme-builder-schemas';
import { useToasts } from '../../../../../components/Toast';
import { Button, input, focus, surface } from '../../../settings-ui';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  themes: CustomTheme[];
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ExportDialog({ open, onClose, themes }: ExportDialogProps) {
  const { addToast } = useToasts();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [copyFormat, setCopyFormat] = useState<'json' | 'base64'>('json');
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  const customThemes = useMemo(() => themes.filter((t) => !t.isBuiltIn), [themes]);
  const selectedTheme = useMemo(
    () => customThemes.find((t) => t.id === selectedThemeId) || customThemes[0] || null,
    [customThemes, selectedThemeId],
  );

  const handleExportSingle = useCallback(async () => {
    if (!selectedTheme) return;
    const json = serializeThemeForExport(selectedTheme);
    const filename = `${selectedTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.vestara-theme.json`;
    downloadFile(json, filename, 'application/json');
    addToast({ type: 'success', message: `Exported "${selectedTheme.name}"` });
    onClose();
  }, [selectedTheme, addToast, onClose]);

  const handleExportAll = useCallback(async () => {
    if (customThemes.length === 0) {
      addToast({ type: 'warning', message: 'No custom themes to export' });
      return;
    }
    const json = serializeThemesForExport(customThemes);
    downloadFile(json, 'vestara-themes.json', 'application/json');
    addToast({ type: 'success', message: `Exported ${customThemes.length} themes` });
    onClose();
  }, [customThemes, addToast, onClose]);

  const handleCopy = useCallback(async () => {
    if (!selectedTheme) return;
    setIsCopying(true);
    const json = serializeThemeForExport(selectedTheme);
    const content = copyFormat === 'base64' ? btoa(json) : json;
    const success = await copyToClipboard(content);
    setIsCopying(false);
    if (success) {
      addToast({ type: 'success', message: `Copied ${copyFormat.toUpperCase()} to clipboard` });
    } else {
      addToast({ type: 'error', message: 'Failed to copy to clipboard' });
    }
  }, [selectedTheme, copyFormat, addToast]);

  const handlePreview = useCallback((json: string) => {
    setShowPreview(json);
  }, []);

  const handlePreviewSingle = useCallback(() => {
    if (selectedTheme) {
      handlePreview(serializeThemeForExport(selectedTheme));
    }
  }, [selectedTheme, handlePreview]);

  const handlePreviewAll = useCallback(() => {
    handlePreview(serializeThemesForExport(customThemes));
  }, [customThemes, handlePreview]);

  const getThemeSize = (theme: CustomTheme): string => {
    return formatBytes(new Blob([serializeThemeForExport(theme)]).size);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div className={`w-full max-w-2xl max-h-[90vh] overflow-hidden ${surface} rounded-[var(--vestara-radius-lg)] shadow-xl`}>
        <header className="flex items-center justify-between border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3">
          <h2 id="export-dialog-title" className="text-base font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Export Themes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[var(--vestara-radius)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] transition-colors"
            aria-label="Close export dialog"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-6">
          {customThemes.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto size-12 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
              <h3 className="mt-4 text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                No Custom Themes
              </h3>
              <p className="mt-1 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                Create custom themes first to export them
              </p>
            </div>
          ) : (
            <>
              <section aria-labelledby="export-single-heading">
                <h3 id="export-single-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                  Export Single Theme
                </h3>
                <div className="space-y-3">
                  <label htmlFor="export-theme-select" className="block text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                    Select theme
                  </label>
                  <select
                    id="export-theme-select"
                    value={selectedThemeId || ''}
                    onChange={(e) => setSelectedThemeId(e.target.value || null)}
                    className={`${input} w-full`}
                    disabled={customThemes.length === 0}
                  >
                    <option value="">Choose a theme…</option>
                    {customThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </select>

                  {selectedTheme && (
                    <div className={`rounded-[var(--vestara-radius)] border p-3 ${surface}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                            {selectedTheme.name}
                          </p>
                          <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                            {selectedTheme.description || 'No description'}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                            <span>Tokens: {Object.keys(selectedTheme.tokens).length}</span>
                            <span>Size: {getThemeSize(selectedTheme)}</span>
                            <span>Base: {selectedTheme.baseThemeId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button onClick={handlePreviewSingle} className="text-xs">
                            Preview
                          </Button>
                          <Button primary onClick={handleExportSingle} className="text-xs">
                            Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section aria-labelledby="export-all-heading">
                <h3 id="export-all-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                  Export All Custom Themes
                </h3>
                <div className={`rounded-[var(--vestara-radius)] border p-3 ${surface}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                        {customThemes.length} custom theme{customThemes.length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                        Exports as array in .vestara-themes.json
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button onClick={handlePreviewAll} className="text-xs">
                        Preview
                      </Button>
                      <Button primary onClick={handleExportAll} className="text-xs">
                        Download All
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section aria-labelledby="copy-heading">
                <h3 id="copy-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                  Copy to Clipboard
                </h3>
                <div className="space-y-3">
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
                      Format
                    </legend>
                    <div className="flex gap-2">
                      {(['json', 'base64'] as const).map((fmt) => (
                        <label
                          key={fmt}
                          className={`flex items-center gap-2 rounded-[var(--vestara-radius)] border px-3 py-2 text-xs cursor-pointer transition-colors ${
                            copyFormat === fmt
                              ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)]'
                              : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] hover:border-[var(--vestara-accent-border-hover)]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="copy-format"
                            value={fmt}
                            checked={copyFormat === fmt}
                            onChange={() => setCopyFormat(fmt)}
                            className="accent-[var(--vestara-accent)]"
                          />
                          <span className="font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                            {fmt.toUpperCase()}
                          </span>
                          <span className="text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                            {fmt === 'json' ? 'Pretty-printed JSON' : 'Base64 encoded'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {selectedTheme && (
                    <Button onClick={handleCopy} disabled={isCopying} className="w-full sm:w-auto">
                      {isCopying ? 'Copying…' : `Copy ${copyFormat.toUpperCase()}`}
                    </Button>
                  )}
                </div>
              </section>
            </>
          )}

          {showPreview && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
              role="dialog"
              aria-modal="true"
              aria-labelledby="preview-title"
              onClick={() => setShowPreview(null)}
            >
              <div
                className={`w-full max-w-4xl max-h-[80vh] overflow-hidden ${surface} rounded-[var(--vestara-radius-lg)] shadow-xl`}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="flex items-center justify-between border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3">
                  <h3 id="preview-title" className="text-base font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                    JSON Preview
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => copyToClipboard(showPreview).then((ok) => ok && addToast({ type: 'success', message: 'Copied to clipboard' }))} className="text-xs">
                      Copy
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowPreview(null)}
                      className="p-1 rounded-[var(--vestara-radius)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] transition-colors"
                      aria-label="Close preview"
                    >
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </header>
                <pre className="p-4 overflow-auto max-h-[60vh] text-xs font-mono text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] bg-[var(--vestara-color-bg-app,var(--color-zinc-950))]">
                  {showPreview}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}