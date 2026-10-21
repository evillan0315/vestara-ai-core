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
import { COLOR, ELEVATION, FONT_SIZE, MARKETPLACE_LAYOUT, MOTION, SHELL, SIZING, UI_COMPONENT } from './tokens.js';

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
    '--vestara-surface-composer': theme.surface.composer,
    '--vestara-surface-assistant': theme.surface.assistant,
    '--vestara-surface-overlay': theme.surface.overlay,
    '--vestara-surface-interactive': theme.surface.interactive,
    '--vestara-surface-interactive-hover': theme.surface.interactiveHover,

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
    '--vestara-accent-glow': theme.accent.glow,
    '--vestara-accent-bg': theme.accent.bg,
    '--vestara-accent-border': theme.accent.border,
    '--vestara-accent-border-hover': theme.accent.borderHover,
    '--vestara-accent-border-active': theme.accent.borderActive,
    '--vestara-accent-text': theme.accent.text,
    '--vestara-accent-text-hover': theme.accent.textHover,
    '--vestara-accent-text-muted': theme.accent.textMuted,
    '--vestara-accent-overlay': theme.accent.overlay,

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

    // Activity Room operations palette
    '--vestara-activity-room-primary': theme.activityRoom.primary,
    '--vestara-activity-room-primary-light': theme.activityRoom.primaryLight,
    '--vestara-activity-room-primary-dark': theme.activityRoom.primaryDark,
    '--vestara-activity-room-panel': theme.activityRoom.panel,
    '--vestara-activity-room-panel-raised': theme.activityRoom.panelRaised,
    '--vestara-activity-room-border': theme.activityRoom.border,
    '--vestara-activity-room-border-strong': theme.activityRoom.borderStrong,

    // Elevation (theme-invariant shadows — sourced from ELEVATION tokens,
    // not per-theme values). Previously only --vestara-elevation-md existed
    // as a hand-mirrored stopgap in workspace index.css, leaving sm/lg/xl
    // silently undefined wherever consumers referenced them.
    '--vestara-elevation-none': ELEVATION.none,
    '--vestara-elevation-sm': ELEVATION.sm,
    '--vestara-elevation-md': ELEVATION.md,
    '--vestara-elevation-lg': ELEVATION.lg,
    '--vestara-elevation-xl': ELEVATION.xl,
    // VES-DESIGN-007: detached-surface recipes (see tokens.ts ELEVATION).
    '--vestara-elevation-floating': ELEVATION.floating,
    '--vestara-elevation-floating-up': ELEVATION.floatingUp,
    '--vestara-elevation-inset': ELEVATION.inset,
    // Shell (workspace-ui-v2) compositor recipes — windows/dock/login glass.
    '--vestara-elevation-shell-float': ELEVATION.shellFloat,
    '--vestara-elevation-shell-focus': ELEVATION.shellFocus,
    '--vestara-elevation-shell-glow': ELEVATION.shellGlow,

    // Motion (theme-invariant rhythm — sourced from MOTION tokens,
    // not per-theme values). Hosts bind transitions/animations here so
    // behavior stays consistent and honors the shared motion vocabulary.
    '--vestara-motion-fast': MOTION.fast,
    '--vestara-motion-normal': MOTION.normal,
    '--vestara-motion-slow': MOTION.slow,
    '--vestara-motion-slower': MOTION.slower,
    '--vestara-motion-easing': MOTION.easing.default,

    // VES-DESIGN-007: font-size scale (theme-invariant — the size axis of
    // TYPOGRAPHY, sourced from FONT_SIZE tokens, not per-theme values).
    // Before this, the TYPOGRAPHY steps were reachable only as TS constants
    // and had no CSS variable, so any component needing one specific size had
    // to hardcode `text-[Npx]`. These names intentionally avoid the legacy
    // xs/sm/base/lg/2xl overrides in apps/workspace/src/styles/index.css.
    '--vestara-font-size-micro-small': FONT_SIZE.microSmall,
    '--vestara-font-size-micro': FONT_SIZE.micro,
    '--vestara-font-size-caption': FONT_SIZE.caption,
    '--vestara-font-size-label': FONT_SIZE.label,
    '--vestara-font-size-body-small': FONT_SIZE.bodySmall,
    '--vestara-font-size-code': FONT_SIZE.code,
    '--vestara-font-size-body': FONT_SIZE.body,
    '--vestara-font-size-title-small': FONT_SIZE.titleSmall,
    '--vestara-font-size-section-title': FONT_SIZE.sectionTitle,
    '--vestara-font-size-page-title': FONT_SIZE.pageTitle,
    '--vestara-font-size-title-large': FONT_SIZE.titleLarge,
    '--vestara-font-size-display': FONT_SIZE.display,

    // VES-DESIGN-008: sizing scale (theme-invariant geometry sourced from
    // SIZING tokens). SIZING already existed in tokens.ts but was never emitted
    // as CSS variables, so any `--vestara-sizing-*` reference resolved to
    // nothing — the same silent-undefined trap VES-DESIGN-007 closed for
    // font sizes. Only the scroll bounds are emitted so far; the remaining
    // SIZING groups can follow as consumers adopt them.
    '--vestara-sizing-scroll-max-height': SIZING.scroll.maxHeight,
    '--vestara-sizing-scroll-dialog-max-height': SIZING.scroll.dialogMaxHeight,
    // VES-UI-001 T1: desktop top bar geometry (theme-invariant).
    '--vestara-sizing-topbar-height': SIZING.topbar.height,
    '--vestara-sizing-topbar-spotlight-width': SIZING.topbar.spotlightWidth,
    // Shell navigation geometry (theme-invariant, sourced from SIZING.sidebar).
    // The collapsed rail derives from the top-bar height (2× rows) so the
    // icon rail stays square with the full-width header rhythm.
    '--vestara-sizing-sidebar-width': SIZING.sidebar.width,
    '--vestara-sizing-sidebar-collapsed-width': SIZING.sidebar.collapsedWidth,

    // Shell (workspace-ui-v2) fixed identity palette (theme-invariant —
    // sourced from COLOR.shell, not per-theme values). The teal desktop keeps
    // one identity in every theme mode.
    '--vestara-surface-shell-canvas': COLOR.shell.canvas,
    '--vestara-surface-shell-panel': COLOR.shell.panel,
    '--vestara-surface-shell-raised': COLOR.shell.raised,
    '--vestara-surface-shell-hover': COLOR.shell.hover,
    '--vestara-border-shell': COLOR.shell.border,
    '--vestara-accent-shell': COLOR.shell.accent,
    '--vestara-accent-shell-glow': COLOR.shell.accentGlow,
    '--vestara-text-shell-primary': COLOR.shell.textPrimary,
    '--vestara-text-shell-secondary': COLOR.shell.textSecondary,
    '--vestara-text-shell-muted': COLOR.shell.textMuted,
    '--vestara-text-shell-faint': COLOR.shell.textFaint,
    '--vestara-text-shell-bright': COLOR.shell.textBright,
    '--vestara-status-shell-success': COLOR.shell.success,
    '--vestara-status-shell-warning': COLOR.shell.warning,
    '--vestara-status-shell-danger': COLOR.shell.danger,
    '--vestara-status-shell-danger-light': COLOR.shell.dangerLight,
    '--vestara-status-shell-info': COLOR.shell.info,
    '--vestara-color-shell-ink': COLOR.shell.ink,
    '--vestara-color-shell-shadow': COLOR.shell.shadowBlack,
    // Shell display face (Instrument Serif — fixed shell identity).
    '--vestara-font-family-display': SHELL.fontDisplay,

    // VES-DESIGN-005 §M: Discover gallery layout (theme-invariant geometry
    // sourced from MARKETPLACE_LAYOUT — identical in dark/light).
    '--vestara-marketplace-card-padding': MARKETPLACE_LAYOUT.cardPadding,
    '--vestara-marketplace-card-radius': MARKETPLACE_LAYOUT.cardRadius,
    '--vestara-marketplace-card-gap': MARKETPLACE_LAYOUT.cardGap,
    '--vestara-marketplace-discover-grid-gap': MARKETPLACE_LAYOUT.discoverGridGap,
    '--vestara-marketplace-discover-main-gap': MARKETPLACE_LAYOUT.discoverMainGap,
    '--vestara-marketplace-discover-side-gap': MARKETPLACE_LAYOUT.discoverSideGap,
    '--vestara-marketplace-hero-padding': MARKETPLACE_LAYOUT.heroPadding,
    '--vestara-marketplace-hero-radius': MARKETPLACE_LAYOUT.heroRadius,
    '--vestara-marketplace-hero-gap': MARKETPLACE_LAYOUT.heroGap,
    '--vestara-marketplace-benefits-padding': MARKETPLACE_LAYOUT.benefitsPadding,
    '--vestara-marketplace-pill-padding': MARKETPLACE_LAYOUT.pillPadding,
    '--vestara-marketplace-pill-radius': MARKETPLACE_LAYOUT.pillRadius,
    '--vestara-marketplace-tag-padding': MARKETPLACE_LAYOUT.tagPadding,
    '--vestara-marketplace-install-padding': MARKETPLACE_LAYOUT.installPadding,
    '--vestara-marketplace-side-card-padding': MARKETPLACE_LAYOUT.sideCardPadding,
    '--vestara-marketplace-icon-box-size': MARKETPLACE_LAYOUT.iconBoxSize,
    '--vestara-marketplace-icon-box-radius': MARKETPLACE_LAYOUT.iconBoxRadius,
    '--vestara-marketplace-category-tile-size': MARKETPLACE_LAYOUT.categoryTileSize,

    // VES-DESIGN-006: @vestara/ui-components palette. Each value aliases a
    // dynamic canonical token, so the extracted component gallery follows
    // the selected theme mode, accent palette, and workspace profile.
    '--vestara-surface-os-canvas': UI_COMPONENT.surface.canvas,
    '--vestara-surface-os-panel': UI_COMPONENT.surface.panel,
    '--vestara-surface-os-raised': UI_COMPONENT.surface.raised,
    '--vestara-surface-os-elevated': UI_COMPONENT.surface.elevated,
    '--vestara-surface-os-hover': UI_COMPONENT.surface.hover,
    '--vestara-surface-os-inset': UI_COMPONENT.surface.inset,
    '--vestara-border-os-subtle': UI_COMPONENT.border.subtle,
    '--vestara-border-os-default': UI_COMPONENT.border.default,
    '--vestara-border-os-strong': UI_COMPONENT.border.strong,
    '--vestara-text-os-primary': UI_COMPONENT.text.primary,
    '--vestara-text-os-secondary': UI_COMPONENT.text.secondary,
    '--vestara-text-os-muted': UI_COMPONENT.text.muted,
    '--vestara-text-os-faint': UI_COMPONENT.text.faint,
    '--vestara-accent-os-teal': UI_COMPONENT.accent.teal,
    '--vestara-accent-os-cyan': UI_COMPONENT.accent.cyan,
    '--vestara-accent-os-amber': UI_COMPONENT.accent.amber,
    '--vestara-status-os-success': UI_COMPONENT.status.success,
    '--vestara-status-os-warning': UI_COMPONENT.status.warning,
    '--vestara-status-os-danger': UI_COMPONENT.status.danger,
    '--vestara-status-os-info': UI_COMPONENT.status.info,
    '--vestara-color-os-on-accent': UI_COMPONENT.color.onAccent,
    '--vestara-color-os-inverse': UI_COMPONENT.color.inverse,
    '--vestara-color-os-auth-canvas': UI_COMPONENT.color.authCanvas,
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
