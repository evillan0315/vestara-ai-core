import { useEffect } from 'react';
import { ACCENT_PALETTES, useTheme } from '../../lib/theme.js';

function faviconSvg(accent: string, light: string, dark: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 512 512" fill="none">` +
    `<defs>` +
    `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
    `<stop offset="0%" stop-color="${light}"/>` +
    `<stop offset="45%" stop-color="${accent}"/>` +
    `<stop offset="100%" stop-color="${dark}"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<g transform="translate(46 46) scale(0.82)">` +
    `<path d="M40 40 L190 40 L256 170 L322 40 L472 40 L282 470 L230 470 Z" fill="url(#g)"/>` +
    `<path d="M105 80 L180 80 L256 235 L332 80 L407 80 L270 410 L242 410 Z" fill="#111111"/>` +
    `</g>` +
    `</svg>`
  );
}

/**
 * Keeps the browser tab icon in sync with the selected accent color.
 *
 * `index.html` points at the static gold `/favicon.svg` as a fallback;
 * this component replaces it at runtime with a data-URL mark built from
 * the active accent palette, and updates it whenever the accent changes.
 * Renders nothing.
 */
export function DynamicFavicon(): null {
  const { settings } = useTheme();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const palette = ACCENT_PALETTES[settings.colorTheme];
    if (!palette) return;
    const href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(palette.hex, palette.light, palette.dark))}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = href;
  }, [settings.colorTheme]);

  return null;
}
