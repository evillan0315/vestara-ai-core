/**
 * VES-UI-001 T0: Desktop Shell Token Map
 *
 * Prototype → `--vestara-*` mapping (plan §2). Re-exports canonical
 * authority only — no palette literals live in this file. Components
 * consume the scoped `--ds-*` layer (`desktop-shell.tokens.css`) or
 * `var(--vestara-*)` directly, never these values as raw color.
 *
 * | Prototype              | Canonical token                                  |
 * |------------------------|--------------------------------------------------|
 * | `#2de8c3` (accent)     | `--vestara-accent` via `ACCENT_PALETTES.shell`   |
 * | `#0a1214`              | `--vestara-surface-canvas`                       |
 * | `#0d191b`              | `--vestara-shell-bg`                             |
 * | `#111e20`              | `--vestara-surface-panel`                        |
 * | `#132528`              | `--vestara-surface-panel-raised`                 |
 * | `#1a3a3d` (hairline)   | `--vestara-border-subtle` / accent-border        |
 * | `#5a7a78`              | `--vestara-text-muted`                           |
 * | `#8ab3ad`              | `--vestara-text-secondary`                       |
 * | `#c8ddd9` / `#e6fff9`  | `--vestara-text-primary`                         |
 * | `#4ade80`              | `--vestara-status-success`                       |
 * | `#ff5a5a`              | `--vestara-status-error`                         |
 * | `#facc15`              | `--vestara-status-warning`                       |
 * | `JetBrains Mono`       | `TYPOGRAPHY.code` / `FONT_FAMILIES.mono`         |
 * | `Instrument Serif`     | `FONT_FAMILIES.serif`                            |
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (Phase 0 scaffold)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §2–§3
 */

import { ACCENT_PALETTES } from '@vestara/ui-tokens';

/** Shell accent palette — already exposed in the Settings accent picker. */
export const DESKTOP_SHELL_ACCENT = ACCENT_PALETTES.shell;

/**
 * Scoped token references for the desktop shell. Every value is a
 * `var(--ds-*)` reference into `desktop-shell.tokens.css`, which derives
 * from canonical `--vestara-*` tokens — no hex literals by construction.
 */
export const DESKTOP_SHELL_TOKENS = {
  canvas: 'var(--ds-canvas-bg)',
  surface: 'var(--ds-surface-bg)',
  surfaceRaised: 'var(--ds-surface-raised)',
  border: 'var(--ds-border)',
  accent: 'var(--ds-accent)',
  text: 'var(--ds-text)',
  textSecondary: 'var(--ds-text-secondary)',
  textMuted: 'var(--ds-text-muted)',
  success: 'var(--ds-success)',
  error: 'var(--ds-error)',
  warning: 'var(--ds-warning)',
} as const;

export type DesktopShellTokenKey = keyof typeof DESKTOP_SHELL_TOKENS;
