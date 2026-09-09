/**
 * VES-UI-003: CSS Variable Generation
 *
 * Generates CSS custom properties from theme tokens.
 * Output can be injected into `:root` or `[data-theme]` selectors.
 *
 * Architecture Traceability:
 *   VES-UI-A: Design Tokens (phases 0-2)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-003
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { Theme } from './themes.js';

// ─── CSS Variable Generator ────────────────────────────────────

/**
 * Generate CSS custom properties from a theme.
 * Returns a flat record of CSS variable name → value.
 */
export function generateCSSVariables(theme: Theme): Record<string, string> {
  return {
    // Surface
    '--vestara-surface-canvas': theme.surface.canvas,
    '--vestara-surface-shell': theme.surface.shell,
    '--vestara-surface-panel': theme.surface.panel,
    '--vestara-surface-panel-raised': theme.surface.panelRaised,
    '--vestara-surface-overlay': theme.surface.overlay,
    '--vestara-surface-interactive': theme.surface.interactive,

    // Text
    '--vestara-text-primary': theme.text.primary,
    '--vestara-text-secondary': theme.text.secondary,
    '--vestara-text-muted': theme.text.muted,
    '--vestara-text-disabled': theme.text.disabled,

    // Border
    '--vestara-border-subtle': theme.border.subtle,
    '--vestara-border-default': theme.border.default,
    '--vestara-border-strong': theme.border.strong,
    '--vestara-border-focus': theme.border.focus,

    // Accent
    '--vestara-accent-primary': theme.accent.primary,
    '--vestara-accent-secondary': theme.accent.secondary,
    '--vestara-accent-bg': theme.accent.bg,
    '--vestara-accent-border': theme.accent.border,
    '--vestara-accent-border-hover': theme.accent.borderHover,
    '--vestara-accent-border-active': theme.accent.borderActive,
    '--vestara-accent-text': theme.accent.text,
    '--vestara-accent-text-hover': theme.accent.textHover,
    '--vestara-accent-text-muted': theme.accent.textMuted,

    // Status
    '--vestara-status-success': theme.status.success,
    '--vestara-status-warning': theme.status.warning,
    '--vestara-status-error': theme.status.error,
    '--vestara-status-info': theme.status.info,
    '--vestara-status-running': theme.status.running,
    '--vestara-status-idle': theme.status.idle,
  };
}

/**
 * Generate a CSS string for `:root` selector.
 */
export function generateRootCSS(theme: Theme): string {
  const vars = generateCSSVariables(theme);
  const lines = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root {\n${lines}\n}`;
}

/**
 * Generate a CSS string for `[data-theme]` selector.
 */
export function generateThemeCSS(theme: Theme): string {
  const vars = generateCSSVariables(theme);
  const lines = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `[data-theme="${theme.mode}"] {\n${lines}\n}`;
}

/**
 * Apply CSS variables to a DOM element.
 */
export function applyCSSVariables(
  element: HTMLElement,
  theme: Theme,
): void {
  const vars = generateCSSVariables(theme);
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }
}
