/**
 * VESTARA Extractor — export panel (Phase 3, Screen 4).
 *
 * Format FilterChips (React / TypeScript / Vue / Plain JSX), tokens
 * toggle, and four actions: ZIP download, barrel download, npm-command
 * copy, tokens copy. All output is labelled best-effort preview.
 */

import { useState } from 'react';
import { button, buttonPrimary, chip, muted, panel, panelBody, panelHeader } from '../styles.js';
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  NPM_INSTALL_COMMAND,
  buildBarrel,
  buildFileList,
  buildZip,
  downloadBlob,
  type ExportFormat,
} from './exportLib.js';
import type { ExtractedComponent } from './types.js';

interface ExportSectionProps {
  readonly components: readonly ExtractedComponent[];
  readonly tokensCss: string;
  readonly manifestJson: string;
  readonly onToast: (message: string) => void;
  readonly onCopy: (text: string) => Promise<boolean>;
}

export default function ExportSection({ components, tokensCss, manifestJson, onToast, onCopy }: ExportSectionProps) {
  const [format, setFormat] = useState<ExportFormat>(DEFAULT_EXPORT_FORMAT);
  const [includeTokens, setIncludeTokens] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleZip(): Promise<void> {
    if (components.length === 0) {
      onToast('Nothing to export yet.');
      return;
    }
    setBusy(true);
    try {
      const bytes = await buildZip(buildFileList(components, format, tokensCss, manifestJson, includeTokens));
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
      downloadBlob('vestara-ui-extract.zip', blob);
      onToast(`Exported ${components.length} components as ${format}.`);
    } catch {
      onToast('Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={panel} aria-label="Export">
      <div className={panelHeader}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--vestara-text-secondary)]">
          Export — {components.length} components
        </h2>
      </div>
      <div className={`${panelBody} space-y-3`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={format === f.id}
              onClick={() => setFormat(f.id)}
              className={`${chip} ${format === f.id ? 'border-[var(--vestara-accent-border-active)] text-[var(--vestara-accent-text)]' : muted}`}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={includeTokens}
            onClick={() => setIncludeTokens((v) => !v)}
            className={`${chip} ${includeTokens ? 'border-[var(--vestara-accent-border-active)] text-[var(--vestara-accent-text)]' : muted}`}
          >
            {includeTokens ? 'Tokens: on' : 'Tokens: off'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void handleZip()}>
            {busy ? 'Building…' : 'Download ZIP'}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => {
              downloadBlob('index.js', new Blob([buildBarrel(components, format)], { type: 'text/javascript' }));
              onToast('Barrel index.js downloaded.');
            }}
          >
            Barrel index.js
          </button>
          <button
            type="button"
            className={button}
            onClick={() =>
              void onCopy(NPM_INSTALL_COMMAND).then((ok) =>
                onToast(ok ? 'Install command copied.' : 'Copy failed.'),
              )
            }
          >
            Copy npm command
          </button>
          <button
            type="button"
            className={button}
            onClick={() => void onCopy(tokensCss).then((ok) => onToast(ok ? 'Tokens copied.' : 'Copy failed.'))}
          >
            Copy tokens
          </button>
        </div>
        <p className={`text-xs ${muted}`}>
          Best-effort preview output — review before shipping. ZIP ships components, barrel, manifest, package.json
          {includeTokens ? ', and tokens.css.' : '.'}
        </p>
      </div>
    </section>
  );
}
