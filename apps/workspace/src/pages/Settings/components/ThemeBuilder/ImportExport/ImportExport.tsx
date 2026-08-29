import { useState } from 'react';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context';
import { ImportDialog } from './ImportDialog';
import { ExportDialog } from './ExportDialog';
import { ShareDialog } from './ShareDialog';
import { Button, focus, surface } from '../../../settings-ui';

type ImportExportTab = 'import' | 'export' | 'share';

export function ImportExport() {
  const { customThemes } = useThemeBuilder();
  const [activeTab, setActiveTab] = useState<ImportExportTab>('import');
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);

  return (
    <section className="flex flex-col h-full" aria-label="Import / Export">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
        <div className="flex items-center gap-1 p-1 bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] rounded-[var(--vestara-radius)]" role="tablist" aria-label="Import/Export actions">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'import'}
            aria-controls="import-panel"
            id="import-tab"
            onClick={() => {
              setActiveTab('import');
              setShowImport(true);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === 'import'
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'
            }`}
          >
            <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Import
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'export'}
            aria-controls="export-panel"
            id="export-tab"
            onClick={() => {
              setActiveTab('export');
              setShowExport(true);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === 'export'
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'
            }`}
          >
            <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'share'}
            aria-controls="share-panel"
            id="share-tab"
            onClick={() => {
              setActiveTab('share');
              setShowShare(true);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === 'share'
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'
            }`}
          >
            <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share
          </button>
        </div>
      </div>

      <div
        role="tabpanel"
        id="import-panel"
        aria-labelledby="import-tab"
        hidden={activeTab !== 'import'}
        className="flex-1 overflow-auto p-3"
      >
        <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
          <div className={`flex-1 ${surface} rounded-[var(--vestara-radius-lg)] p-6`}>
            <div className="text-center">
              <svg
                className="mx-auto size-16 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <h3 className="mt-4 text-base font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                Import Themes
              </h3>
              <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] max-w-xs mx-auto">
                Import themes from JSON files or paste JSON directly. Supports single themes or arrays of themes.
              </p>
              <div className="mt-6 space-y-3">
                <Button onClick={() => setShowImport(true)} primary className="w-full sm:w-auto">
                  <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Open Import Dialog
                </Button>
                <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  Drag & drop .json files or paste JSON
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            <p>
              <strong>Supported formats:</strong> Single theme object or array of themes. Uses Zod schema validation.
            </p>
            <p className="mt-1">
              <strong>Merge strategies:</strong> Replace All (clear existing), Add New (only new IDs), Update Existing (update matches, add new).
            </p>
            <p className="mt-1">
              <strong>Validation:</strong> Each theme validated against CustomThemeSchema with detailed error reporting.
            </p>
          </div>
        </div>
      </div>

      <div
        role="tabpanel"
        id="export-panel"
        aria-labelledby="export-tab"
        hidden={activeTab !== 'export'}
        className="flex-1 overflow-auto p-3"
      >
        <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
          <div className={`flex-1 ${surface} rounded-[var(--vestara-radius-lg)] p-6`}>
            <div className="text-center">
              <svg
                className="mx-auto size-16 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <h3 className="mt-4 text-base font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                Export Themes
              </h3>
              <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] max-w-xs mx-auto">
                Export themes as .vestara-theme.json files. Download single themes or all custom themes at once.
              </p>
              <div className="mt-6 space-y-3">
                <Button onClick={() => setShowExport(true)} primary className="w-full sm:w-auto">
                  <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Open Export Dialog
                </Button>
                <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  JSON or Base64 clipboard copy available
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            <p>
              <strong>Single theme:</strong> Downloads as <code>{'theme-name.vestara-theme.json'}</code>
            </p>
            <p className="mt-1">
              <strong>All themes:</strong> Downloads as <code>vestara-themes.json</code> (array)
            </p>
            <p className="mt-1">
              <strong>Clipboard:</strong> Copy JSON (pretty) or Base64 encoded for sharing
            </p>
          </div>
        </div>
      </div>

      <div
        role="tabpanel"
        id="share-panel"
        aria-labelledby="share-tab"
        hidden={activeTab !== 'share'}
        className="flex-1 overflow-auto p-3"
      >
        <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
          <div className={`flex-1 ${surface} rounded-[var(--vestara-radius-lg)] p-6`}>
            <div className="text-center">
              <svg
                className="mx-auto size-16 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              <h3 className="mt-4 text-base font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                Share Theme
              </h3>
              <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] max-w-xs mx-auto">
                Generate a shareable URL containing the full theme. Recipients can import directly via the link.
              </p>
              <div className="mt-6 space-y-3">
                <Button onClick={() => setShowShare(true)} primary className="w-full sm:w-auto">
                  <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Open Share Dialog
                </Button>
                <p className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  Generates ?theme={'<base64>'} URL with optional QR code
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            <p>
              <strong>URL format:</strong>{' '}
              <code>{`${window.location.origin}${window.location.pathname}?theme=<base64>`}</code>
            </p>
            <p className="mt-1">
              <strong>QR Code:</strong> Optional QR code for mobile sharing (requires QRCode library)
            </p>
            <p className="mt-1">
              <strong>No server:</strong> Theme data encoded entirely in URL, no backend storage needed
            </p>
          </div>
        </div>
      </div>

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        existingThemes={customThemes}
        onImport={(themes, strategy) => {
          // The actual import logic will be handled by the context
          // This is a placeholder - the dialog handles the import internally
          console.log('Import themes:', themes, 'strategy:', strategy);
        }}
      />

      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        themes={customThemes}
      />

      <ShareDialog
        open={showShare}
        onClose={() => setShowShare(false)}
        themes={customThemes}
      />
    </section>
  );
}