/**
 * VES-UI-003: CSS Variable Generation
 *
 * Generates CSS custom properties from theme tokens.
 * Output can be injected into `:root` or `[data-theme]` selectors.
 *
 * VES-DESIGN-002: Canonical CSS variable contract.
 * All variables are deterministic outputs of the token authority.
 *
 * Architecture Traceability:
 *   VES-UI-A: Design Tokens (phases 0-2)
 *   VES-DESIGN-002: Canonical Token Contract §J
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-003
 *   @see docs/architecture/VES-DESIGN-002-CANONICAL-TOKEN-CONTRACT.md
 */

import type { Theme } from './themes.js';

// ─── CSS Variable Generator ────────────────────────────────────

/**
 * Generate CSS custom properties from a theme.
 * Returns a flat record of CSS variable name → value.
 *
 * VES-DESIGN-002 §J: Canonical semantic tokens deterministically
 * produce canonical CSS variables.
 */
export function generateCSSVariables(theme: Theme): Record<string, string> {
  return {
    // Surface (VES-DESIGN-002 §P)
    '--vestara-surface-canvas': theme.surface.canvas,
    '--vestara-surface-shell': theme.surface.shell,
    '--vestara-surface-panel': theme.surface.panel,
    '--vestara-surface-panel-raised': theme.surface.panelRaised,
    '--vestara-surface-overlay': theme.surface.overlay,
    '--vestara-surface-interactive': theme.surface.interactive,

    // Text (VES-DESIGN-002 §I)
    '--vestara-text-primary': theme.text.primary,
    '--vestara-text-secondary': theme.text.secondary,
    '--vestara-text-muted': theme.text.muted,
    '--vestara-text-disabled': theme.text.disabled,

    // Border (VES-DESIGN-002 §I)
    '--vestara-border-subtle': theme.border.subtle,
    '--vestara-border-default': theme.border.default,
    '--vestara-border-strong': theme.border.strong,
    '--vestara-border-focus': theme.border.focus,

    // Accent (VES-DESIGN-002 §I)
    '--vestara-accent-primary': theme.accent.primary,
    '--vestara-accent-secondary': theme.accent.secondary,
    '--vestara-accent-bg': theme.accent.bg,
    '--vestara-accent-border': theme.accent.border,
    '--vestara-accent-border-hover': theme.accent.borderHover,
    '--vestara-accent-border-active': theme.accent.borderActive,
    '--vestara-accent-text': theme.accent.text,
    '--vestara-accent-text-hover': theme.accent.textHover,
    '--vestara-accent-text-muted': theme.accent.textMuted,

    // Status (VES-DESIGN-002 §K)
    '--vestara-status-success': theme.status.success,
    '--vestara-status-success-bg': theme.status.successBg,
    '--vestara-status-success-border': theme.status.successBorder,
    '--vestara-status-warning': theme.status.warning,
    '--vestara-status-warning-bg': theme.status.warningBg,
    '--vestara-status-warning-border': theme.status.warningBorder,
    '--vestara-status-error': theme.status.error,
    '--vestara-status-error-bg': theme.status.errorBg,
    '--vestara-status-error-border': theme.status.errorBorder,
    '--vestara-status-info': theme.status.info,
    '--vestara-status-info-bg': theme.status.infoBg,
    '--vestara-status-info-border': theme.status.infoBorder,
    '--vestara-status-running': theme.status.running,
    '--vestara-status-pending': theme.status.pending,
    '--vestara-status-disabled': theme.status.disabled,
    // GA-STATE-001: runtime session status
    '--vestara-status-active': theme.status.active,
    '--vestara-status-idle': theme.status.idle,
    '--vestara-status-unknown': theme.status.unknown,
    // VES-UI-003: tool/files semantic tokens (cyan)
    '--vestara-status-tool': theme.status.tool,
    '--vestara-status-tool-bg': theme.status.toolBg,
    '--vestara-status-tool-border': theme.status.toolBorder,

    // VES-DESIGN-005: marketplace premium tokens
    '--vestara-marketplace-primary': theme.marketplace.primary,
    '--vestara-marketplace-primary-bg': theme.marketplace.primaryBg,
    '--vestara-marketplace-primary-border': theme.marketplace.primaryBorder,
    '--vestara-marketplace-rating': theme.marketplace.rating,
    '--vestara-marketplace-featured-bg': theme.marketplace.featuredBg,
    '--vestara-marketplace-featured-text': theme.marketplace.featuredText,
    '--vestara-marketplace-agent': theme.marketplace.agent,
    '--vestara-marketplace-skill': theme.marketplace.skill,
    '--vestara-marketplace-provider': theme.marketplace.provider,
    '--vestara-marketplace-theme': theme.marketplace.theme,
    '--vestara-marketplace-workflow': theme.marketplace.workflow,
    '--vestara-marketplace-mcp': theme.marketplace.mcp,
    '--vestara-marketplace-command': theme.marketplace.command,
    '--vestara-marketplace-module': theme.marketplace.module,
    '--vestara-marketplace-plugin': theme.marketplace.plugin,
    '--vestara-marketplace-standards': theme.marketplace.standards,
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
export function applyCSSVariables(element: HTMLElement, theme: Theme): void {
  const vars = generateCSSVariables(theme);
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }
}
