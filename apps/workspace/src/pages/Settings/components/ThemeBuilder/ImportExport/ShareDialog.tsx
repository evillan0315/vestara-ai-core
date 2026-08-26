import { useCallback, useMemo, useState } from 'react';
import type { CustomTheme } from '../../../../../lib/theme';
import { generateShareableUrl } from '../../../../../lib/theme-builder-schemas';
import { useToasts } from '../../../../../components/Toast';
import { Button, focus, surface } from '../../../settings-ui';

function generateQRCodeDataUrl(text: string, size = 200): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve('');
      return;
    }
    canvas.width = size;
    canvas.height = size;

    const qrLib = (window as unknown as { QRCode?: unknown }).QRCode;
    if (!qrLib) {
      resolve('');
      return;
    }

    const qr = new (qrLib as new () => {
      makeCode: (text: string) => void;
      _el: HTMLCanvasElement;
      _o: { width: number; height: number };
    })();
    qr.makeCode(text);
    resolve(qr._el.toDataURL());
  });
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

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  themes: CustomTheme[];
}

export function ShareDialog({ open, onClose, themes }: ShareDialogProps) {
  const { addToast } = useToasts();
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const customThemes = useMemo(() => themes.filter((t) => !t.isBuiltIn), [themes]);
  const selectedTheme = useMemo(
    () => customThemes.find((t) => t.id === selectedThemeId) || customThemes[0] || null,
    [customThemes, selectedThemeId],
  );

  const generateUrl = useCallback(() => {
    if (!selectedTheme) return;
    const url = generateShareableUrl(selectedTheme);
    setShareUrl(url);
    setCopied(false);
    setQrCodeUrl('');
    setShowQr(false);
    addToast({ type: 'success', message: 'Shareable URL generated' });
  }, [selectedTheme, addToast]);

  const handleCopyUrl = useCallback(async () => {
    if (!shareUrl) return;
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      addToast({ type: 'success', message: 'URL copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } else {
      addToast({ type: 'error', message: 'Failed to copy URL' });
    }
  }, [shareUrl, addToast]);

  const handleGenerateQr = useCallback(async () => {
    if (!shareUrl || isGeneratingQr) return;
    setIsGeneratingQr(true);
    try {
      const qrUrl = await generateQRCodeDataUrl(shareUrl);
      if (qrUrl) {
        setQrCodeUrl(qrUrl);
        setShowQr(true);
        addToast({ type: 'success', message: 'QR code generated' });
      } else {
        addToast({ type: 'warning', message: 'QR code generation not available' });
      }
    } catch {
      addToast({ type: 'error', message: 'Failed to generate QR code' });
    } finally {
      setIsGeneratingQr(false);
    }
  }, [shareUrl, isGeneratingQr, addToast]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div className={`w-full max-w-md max-h-[90vh] overflow-hidden ${surface} rounded-[var(--vestara-radius-lg)] shadow-xl`}>
        <header className="flex items-center justify-between border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3">
          <h2 id="share-dialog-title" className="text-base font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Share Theme
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[var(--vestara-radius)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] transition-colors"
            aria-label="Close share dialog"
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
                Create custom themes first to share them
              </p>
            </div>
          ) : (
            <>
              <section aria-labelledby="select-theme-heading">
                <h3 id="select-theme-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                  Select Theme to Share
                </h3>
                <label htmlFor="share-theme-select" className="block text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  Choose a theme
                </label>
                <select
                  id="share-theme-select"
                  value={selectedThemeId || ''}
                  onChange={(e) => setSelectedThemeId(e.target.value || null)}
                  className={`w-full mt-1 ${'min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset'}`}
                  disabled={customThemes.length === 0}
                >
                  <option value="">Choose a theme…</option>
                  {customThemes.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </section>

              {selectedTheme && (
                <section aria-labelledby="theme-details-heading">
                  <h3 id="theme-details-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                    Theme Details
                  </h3>
                  <div className={`rounded-[var(--vestara-radius)] border p-3 ${surface}`}>
                    <p className="font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                      {selectedTheme.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                      {selectedTheme.description || 'No description'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                      <span>Tokens: {Object.keys(selectedTheme.tokens).length}</span>
                      <span>Base: {selectedTheme.baseThemeId}</span>
                    </div>
                  </div>
                </section>
              )}

              <section aria-labelledby="generate-heading">
                <h3 id="generate-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                  Generate Share URL
                </h3>
                <div className="space-y-3">
                  <Button
                    onClick={generateUrl}
                    disabled={!selectedTheme}
                    primary
                    className="w-full"
                  >
                    Generate Shareable URL
                  </Button>

                  {shareUrl && (
                    <div className="space-y-2">
                      <label htmlFor="share-url" className="block text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                        Shareable URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="share-url"
                          type="text"
                          value={shareUrl}
                          readOnly
                          className={`flex-1 ${'min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset'}`}
                          aria-describedby="share-url-hint"
                        />
                        <Button
                          onClick={handleCopyUrl}
                          disabled={copied}
                          className="shrink-0 whitespace-nowrap"
                        >
                          {copied ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                      <p id="share-url-hint" className="text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                        URL format: <code>{`${window.location.origin}${window.location.pathname}?theme=<base64>`}</code>
                      </p>

                      <div className="flex gap-2 pt-2">
                        <Button onClick={handleGenerateQr} disabled={isGeneratingQr} className="flex-1">
                          {isGeneratingQr ? 'Generating…' : 'Generate QR Code'}
                        </Button>
                        <Button onClick={() => setShowQr(!showQr)} disabled={!qrCodeUrl} className="flex-1" variant="secondary">
                          {showQr ? 'Hide QR' : 'Show QR'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {showQr && qrCodeUrl && (
                <section aria-labelledby="qr-heading">
                  <h3 id="qr-heading" className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] mb-3">
                    QR Code
                  </h3>
                  <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-[var(--vestara-radius)]">
                    <img
                      src={qrCodeUrl}
                      alt={`QR code for sharing ${selectedTheme?.name || 'theme'}`}
                      className="size-48"
                    />
                    <p className="text-center text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                      Scan with mobile device to open theme
                    </p>
                    <Button onClick={() => setShowQr(false)} className="text-xs">
                      Close QR Code
                    </Button>
                  </div>
                </section>
              )}

              <section className="pt-4 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]" aria-labelledby="info-heading">
                <h3 id="info-heading" className="sr-only">How it works</h3>
                <div className="space-y-2 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  <p>
                    <strong>Shareable URLs</strong> encode the entire theme as a Base64 string in the query parameter.
                    Anyone with the link can import the theme directly into their Theme Builder.
                  </p>
                  <p>
                    The URL contains all tokens, profiles, and TUI palette data. No server storage required.
                  </p>
                  <p>
                    <strong>Security note:</strong> Only share themes with trusted recipients. The URL contains the full theme definition.
                  </p>
                </div>
              </section>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </div>
  );
}