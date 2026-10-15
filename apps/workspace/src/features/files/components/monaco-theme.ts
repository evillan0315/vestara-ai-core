/**
 * Vestara Monaco Theme
 *
 * Builds the `vestara-dark` / `vestara-light` Monaco editor themes from the
 * live Vestara tokens so the code editor follows the selected appearance
 * mode and accent palette without a second palette.
 *
 * Monaco theme colors must be plain RRGGBB hex, but computed token values
 * can be color-mix() expressions now that surfaces carry the selected
 * accent (getComputedStyle substitutes var(--vestara-accent) yet keeps the
 * color-mix() wrapper, which Monaco rejects with "Illegal value for token
 * color"). Values resolve through the browser and flatten to opaque hex,
 * compositing translucency over the editor canvas.
 *
 * Monaco snapshots theme colors at defineTheme time — call
 * defineVestaraEditorTheme again on every accent/mode change, not just at
 * editor mount.
 *
 * Architecture Traceability:
 *   FILES-ASSETS-001: Assets, Media Preview & Reusable Code Viewer/Editor
 */

import type { OnMount } from '@monaco-editor/react';

export type MonacoInstance = Parameters<OnMount>[1];

export type EditorAppearance = 'dark' | 'light';

/** Accent wash over the canvas for the editor background (opaque, dark-first). */
const EDITOR_BG_MIX_DARK = 0.14;
const EDITOR_BG_MIX_LIGHT = 0.08;

type Rgba = [number, number, number, number];
type Rgb = [number, number, number];

function hexToRgba(value: string): Rgba {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) return [0, 0, 0, 1];
  const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

/**
 * Parse a computed CSS color into [r, g, b, a] (0-255 channels).
 * Handles comma- and space-separated rgb()/rgba() (with slash alpha)
 * plus color(srgb …) — computed serialization varies by browser.
 */
function parseComputedRgb(css: string): Rgba | null {
  const fn = /^(rgba?|color)\((.+)\)$/i.exec(css.trim());
  if (!fn) return null;
  const isColorFn = fn[1].toLowerCase() === 'color';
  const toChannel = (token: string): number | null => {
    const v = token.trim();
    if (!v || /^[a-zA-Z]/.test(v)) return null; // colorspace tags like 'srgb'
    if (v.endsWith('%')) {
      const n = parseFloat(v);
      return Number.isNaN(n) ? null : (n / 100) * 255;
    }
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  };
  const [rgbBody, alphaBody] = fn[2].split('/');
  const channels = rgbBody
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map(toChannel)
    .filter((n): n is number => n !== null);
  if (channels.length < 3) return null;
  let [r, g, b] = channels;
  if (isColorFn && Math.max(r, g, b) <= 1) {
    r *= 255;
    g *= 255;
    b *= 255;
  }
  let a = 1;
  if (alphaBody !== undefined) {
    const t = alphaBody.trim();
    const n = parseFloat(t);
    if (!Number.isNaN(n)) a = t.endsWith('%') ? n / 100 : n;
  }
  return [r, g, b, a];
}

function rgbToHex(r: number, g: number, b: number): string {
  const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `${byte(r)}${byte(g)}${byte(b)}`;
}

/** Resolve a computed token value to [r, g, b, a]. Plain hex parses directly; anything else goes through a probe element. */
function resolveTokenRgba(probe: HTMLElement, raw: string, fallback: string): Rgba {
  const value = raw.trim() || fallback;
  if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return hexToRgba(value);
  try {
    probe.style.color = '';
    probe.style.color = value;
    if (!probe.style.color) return hexToRgba(fallback);
    return parseComputedRgb(getComputedStyle(probe).color) ?? hexToRgba(fallback);
  } catch {
    return hexToRgba(fallback);
  }
}

/** (Re)build the Vestara Monaco theme from the live tokens and apply it. */
export function defineVestaraEditorTheme(monaco: MonacoInstance, mode: EditorAppearance): void {
  const styles = getComputedStyle(document.documentElement);
  const raw = (name: string) => styles.getPropertyValue(name).trim();
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
  document.documentElement.appendChild(probe);
  try {
    const canvasRgba = resolveTokenRgba(probe, raw('--vestara-surface-canvas'), mode === 'dark' ? '#0d1117' : '#ffffff');
    const canvas: Rgb = [canvasRgba[0], canvasRgba[1], canvasRgba[2]];
    // Editor background: a deep "accent bg dark" — the selected accent
    // washed over the canvas (opaque, no translucency), so it stays dark
    // and readable in every palette instead of picking up the loud
    // translucent panel treatment.
    const accentRgba = resolveTokenRgba(probe, raw('--vestara-accent'), '#f59e0b');
    const bgMix = mode === 'dark' ? EDITOR_BG_MIX_DARK : EDITOR_BG_MIX_LIGHT;
    const editorBg = rgbToHex(
      accentRgba[0] * bgMix + canvas[0] * (1 - bgMix),
      accentRgba[1] * bgMix + canvas[1] * (1 - bgMix),
      accentRgba[2] * bgMix + canvas[2] * (1 - bgMix),
    );
    const token = (name: string, fallback: string) => {
      const [r, g, b, a] = resolveTokenRgba(probe, raw(name), fallback);
      if (a >= 1) return rgbToHex(r, g, b);
      return rgbToHex(r * a + canvas[0] * (1 - a), g * a + canvas[1] * (1 - a), b * a + canvas[2] * (1 - a));
    };
    const editorTheme = `vestara-${mode}`;
    monaco.editor.defineTheme(editorTheme, {
      base: mode === 'dark' ? 'vs-dark' : 'vs',
      inherit: false,
      rules: [
        { token: 'comment', foreground: token('--vestara-text-muted', '8b949e'), fontStyle: 'italic' },
        { token: 'keyword', foreground: token('--vestara-accent-text', 'd29922') },
        { token: 'string', foreground: token('--vestara-status-success', '3fb950') },
        { token: 'number', foreground: token('--vestara-status-info', '58a6ff') },
        { token: 'type', foreground: token('--vestara-accent-text', 'd29922') },
        { token: 'delimiter', foreground: token('--vestara-text-secondary', 'c9d1d9') },
      ],
      colors: {
        'editor.background': editorBg,
        'editor.foreground': token('--vestara-text-primary', mode === 'dark' ? '#e6edf3' : '#24292f'),
        'editor.selectionBackground': token('--vestara-accent-bg', '#3d2f0f'),
        'editor.inactiveSelectionBackground': token('--vestara-accent-bg', '#2b2415'),
        'editorLineNumber.foreground': token('--vestara-text-muted', '#8b949e'),
        'editorLineNumber.activeForeground': token('--vestara-accent-text', '#d29922'),
        'editorGutter.background': editorBg,
        'editorCursor.foreground': token('--vestara-accent', '#f59e0b'),
        'editorWidget.background': token('--vestara-surface-panel', mode === 'dark' ? '#161b22' : '#ffffff'),
        'editorWidget.foreground': token('--vestara-text-primary', mode === 'dark' ? '#e6edf3' : '#24292f'),
        // Diagnostic reds follow the selected accent instead of Monaco's
        // default error red (squiggles, glyph markers, ruler, navigation).
        'editorError.foreground': token('--vestara-accent', '#f59e0b'),
        'editorError.border': token('--vestara-accent-border', '#f59e0b'),
        'editorError.background': token('--vestara-accent-bg', '#3d2f0f'),
        'editorOverviewRuler.errorForeground': token('--vestara-accent', '#f59e0b'),
        'editorMarkerNavigationError.background': token('--vestara-accent', '#f59e0b'),
        'editorMarkerNavigationError.headerBackground': token('--vestara-accent-bg', '#3d2f0f'),
      },
    });
    monaco.editor.setTheme(editorTheme);
  } finally {
    probe.remove();
  }
}
