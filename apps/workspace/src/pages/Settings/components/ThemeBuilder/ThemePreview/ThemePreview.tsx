import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { PreviewComponents } from './PreviewComponents.js';
import { PreviewToolbar } from './PreviewToolbar.js';
import { useThemeBuilder } from '../../../../../lib/theme-builder-context.js';

const surface = 'border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]';
const radiusLg = 'rounded-[var(--vestara-radius-lg)]';
const textPrimary = 'text-[var(--vestara-color-text-primary,var(--vestara-text))]';
const textMuted = 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]';
const borderSubtle = 'border-[var(--vestara-color-border-subtle,var(--color-zinc-800))]';

const VIEWPORT_WIDTHS = {
  mobile: '375px',
  tablet: '768px',
  desktop: '1024px',
  full: '100%',
} as const;

const PREVIEW_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Theme Preview</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body { font-family: var(--vestara-font-family, ui-sans-serif, system-ui, -apple-system, sans-serif); font-size: var(--vestara-font-size-base, 14.25px); color: var(--vestara-color-text-primary, #e4e4e7); background: var(--vestara-color-bg-app, #09090b); }
    #root { height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function ThemePreview() {
  const {
    editingTheme,
    applyThemeToPreview,
    previewMode,
  } = useThemeBuilder();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>('dark');
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop' | 'full'>('full');
  const [isLoading, setIsLoading] = useState(true);
  const previewDocRef = useRef<Document | null>(null);

  const applyThemeToIframe = useCallback((theme: typeof editingTheme) => {
    if (!theme || !previewDocRef.current) return;
    const doc = previewDocRef.current;
    const root = doc.documentElement;
    const resolved = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

    for (const [cssVar, value] of Object.entries(theme.tokens)) {
      root.style.setProperty(cssVar, value);
    }
    if (resolved === 'light' && theme.lightTokens) {
      for (const [cssVar, value] of Object.entries(theme.lightTokens)) {
        root.style.setProperty(cssVar, value);
      }
    } else if (resolved === 'dark' && theme.darkTokens) {
      for (const [cssVar, value] of Object.entries(theme.darkTokens)) {
        root.style.setProperty(cssVar, value);
      }
    }
  }, []);

  const debouncedApplyTheme = useMemo(
    () => debounce(applyThemeToIframe, 150),
    [applyThemeToIframe]
  );

  useEffect(() => {
    if (editingTheme) {
      debouncedApplyTheme(editingTheme);
    }
  }, [editingTheme, debouncedApplyTheme]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) throw new Error('No contentDocument');

        previewDocRef.current = doc;
        doc.open();
        doc.write(PREVIEW_HTML);
        doc.close();

        const root = doc.documentElement;
        root.setAttribute('data-theme', themeMode === 'system'
          ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
          : themeMode);

        if (editingTheme) {
          applyThemeToIframe(editingTheme);
        }

        setIframeReady(true);
        setIsLoading(false);
        setIframeError(null);
      } catch (err) {
        setIframeError(err instanceof Error ? err.message : 'Failed to initialize preview');
        setIsLoading(false);
      }
    };

    iframe.addEventListener('load', handleLoad);

    iframe.src = 'about:blank';
    iframe.sandbox = 'allow-scripts allow-same-origin';

    return () => {
      iframe.removeEventListener('load', handleLoad);
    };
  }, []);

  useEffect(() => {
    if (!previewDocRef.current) return;
    const root = previewDocRef.current.documentElement;
    const resolved = themeMode === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : themeMode;
    root.setAttribute('data-theme', resolved);
    root.classList.toggle('light', resolved === 'light');
    root.classList.toggle('dark', resolved === 'dark');
    if (editingTheme) {
      applyThemeToIframe(editingTheme);
    }
  }, [themeMode, editingTheme, applyThemeToIframe]);

  const handleRefresh = useCallback(() => {
    if (!iframeRef.current || !editingTheme) return;
    setIsLoading(true);
    iframeRef.current.src = 'about:blank';
    setTimeout(() => {
      iframeRef.current!.src = 'about:blank';
    }, 0);
  }, [editingTheme]);

  const handleViewportChange = useCallback((newViewport: 'mobile' | 'tablet' | 'desktop' | 'full') => {
    setViewport(newViewport);
  }, []);

  if (!previewMode) {
    return (
      <div className={`flex items-center justify-center h-full ${surface} ${radiusLg} ${borderSubtle}`}>
        <div className="text-center p-8">
          <svg className="mx-auto size-12 ${textMuted}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <p className="mt-4 text-[var(--vestara-font-size-base)] font-medium ${textPrimary}">Preview Disabled</p>
          <p className="mt-1 ${textMuted}">Enable preview mode to see live theme changes</p>
        </div>
      </div>
    );
  }

  if (iframeError) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${surface} ${radiusLg} ${borderSubtle} p-6`}>
        <svg className="size-12 text-[var(--vestara-red)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="mt-4 text-center text-[var(--vestara-font-size-base)] font-medium ${textPrimary}">Preview Error</p>
        <p className="mt-1 text-center ${textMuted}">{iframeError}</p>
        <button
          onClick={handleRefresh}
          className="mt-4 min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent)] text-[var(--color-zinc-950)] px-3 text-[var(--vestara-font-size-sm)] font-medium hover:bg-[var(--vestara-accent-light)]"
        >
          Retry
        </button>
      </div>
    );
  }

  const viewportWidth = VIEWPORT_WIDTHS[viewport];

  return (
    <div className="flex flex-col h-full">
      <PreviewToolbar
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        viewport={viewport}
        onViewportChange={handleViewportChange}
        onRefresh={handleRefresh}
        isLoading={isLoading}
      />

      <div className="flex-1 relative overflow-hidden ${radiusLg} ${borderSubtle} bg-[var(--vestara-color-bg-app,var(--color-zinc-950))]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--vestara-color-bg-app,var(--color-zinc-950))] z-10">
            <div className="text-center">
              <svg className="mx-auto size-8 animate-spin text-[var(--vestara-accent)]" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="mt-3 ${textMuted}">Loading preview...</p>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          title="Theme Preview"
          className="w-full h-full border-0"
          style={{
            width: viewport === 'full' ? '100%' : viewportWidth,
            maxWidth: viewport === 'full' ? 'none' : viewportWidth,
            margin: viewport === 'full' ? '0' : '0 auto',
          }}
          aria-label="Theme preview iframe"
        />
      </div>
    </div>
  );
}