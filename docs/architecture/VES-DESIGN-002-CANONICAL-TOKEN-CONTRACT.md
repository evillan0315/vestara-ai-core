---
title: VES-DESIGN-002 — Canonical Token Contract
version: 1.0.0
status: proposed
milestone: VES-DESIGN-001/002
owner: vestara
last-reviewed: 2026-09-09
next-review: 2026-10-09
---

# VES-DESIGN-002 — Canonical Token Contract

## A. Executive Summary

This document establishes the authoritative design-token and theme contract for Vestara. It identifies the current state of theme authority across the codebase, defines the canonical semantic token vocabulary, and prescribes the dependency direction for all theme-related packages.

**Target invariant:**

```
@vestara/ui-tokens   (Layer 0 — canonical token authority)
        ↓
@vestara/ui-theme    (Layer 1 — MUI/React theme integration)
        ↓
@vestara/ui          (Layer 2 — shared UI primitives)
        ↓
applications / workspaces / features
```

No application, workspace, Activity Room, Global Assistant, Floating Assistant, or future feature may become an independent theme authority.

---

## B. Current Authority Graph

### Three Disconnected Token Systems

| System | Location | Naming Convention | Default Accent | Canvas Color | Status |
|--------|----------|-------------------|---------------|-------------|--------|
| `index.css` (runtime) | `apps/workspace/src/styles/index.css` | `--vestara-accent`, `--vestara-surface`, `--vestara-text` | `#f59e0b` (amber) | `#09090b` | **ACTIVE** — used by all components |
| `@vestara/ui-tokens` | `packages/ui-tokens/src/` | `--vestara-accent-primary`, `--vestara-surface-canvas`, `--vestara-text-primary` | `#d4a853` (gold) | `#09090b` | **UNUSED** — generated CSS variables never consumed |
| `@vestara/design-system` | `packages/design-system/src/` | TypeScript constants only (no CSS) | `#d4a853` (gold) | N/A | **PARTIAL** — accent palettes consumed by `theme.tsx` |

### Runtime Theme Engine

`apps/workspace/src/lib/theme.tsx` is the runtime theme engine:
- `ThemeProvider` wraps the app (mounted in `App.tsx`)
- `applySettings()` (line 1133) sets CSS variables on `document.documentElement.style` at runtime
- Sets `data-theme` attribute and `.light`/`.dark` classes
- Supports `system`, `dark`, and `light` modes
- Persists to localStorage AND server-side (`/api/settings`)
- Consumes `ACCENT_PALETTES` from `@vestara/design-system`

### Authority Flow

```
User toggles theme
  → ThemeProvider state
  → applySettings()
  → 1. Sets --vestara-* variables on document.documentElement.style (JS overrides)
  → 2. Sets data-theme="light"|"dark" attribute
  → 3. Toggles .light/.dark classes on <html>
  → 4. CSS [data-theme="light"] block redefines --color-zinc-* and --vestara-* values
```

---

## C. Current Package/File Ownership Matrix

| Package/File | Role | Dependencies | Theme Authority? |
|-------------|------|-------------|-----------------|
| `packages/ui-tokens/` | Canonical token vocabulary + CSS generation | None (pure TS) | **YES (intended)** |
| `packages/design-system/` | Accent palettes, TUI palette types | None (pure TS) | **Partial** — accent palettes only |
| `packages/ui-theme/` | MUI theme integration | Does not exist yet | **NO** |
| `apps/workspace/src/styles/index.css` | Runtime CSS variables | Tailwind | **YES (de facto)** |
| `apps/workspace/src/lib/theme.tsx` | Runtime theme engine | `@vestara/design-system` | **YES (de facto)** |
| `apps/workspace/src/styles/activity-room.css` | Activity Room CSS | `--vestara-*` tokens | **NO** — aliases only |
| `packages/ui/src/components/` | Shared UI primitives | None | **NO** — should consume tokens |

---

## D. Duplicate/Conflicting Authorities

### Critical Conflicts

1. **Accent color**: `index.css` defaults to `#f59e0b` (amber); `ui-tokens/themes.ts` defaults to `#d4a853` (gold). The runtime uses amber; the canonical package uses gold.

2. **CSS variable naming**: `index.css` defines `--vestara-surface`; `ui-tokens/css.ts` generates `--vestara-surface-canvas`. These are different names for the same concept.

3. **Zinc palette**: `index.css` defines `--color-zinc-*` for both dark and light; `ui-tokens/themes.ts` uses hardcoded hex values. The zinc palette is the primary mechanism for Tailwind utility color resolution.

4. **Three accent palette sources**: `@vestara/design-system` (gold `#d4a853`), `@vestara/ui-tokens` (gold `#d4a853`), `index.css` (amber `#f59e0b`). Only `index.css` values are deployed.

---

## E. Current CSS Token Inventory

### `index.css` — Active Runtime Tokens

| Category | Token | Dark Value | Light Value |
|----------|-------|-----------|-------------|
| **Zinc palette** | `--color-zinc-{50..950}` | Standard zinc | Warm-shifted equivalents |
| **Brand colors** | `--vestara-gold` | `#c9a84c` | `#b8860b` |
| | `--vestara-green` | `#4ade80` | `#16a34a` |
| | `--vestara-red` | `#f87171` | `#dc2626` |
| | `--vestara-blue` | `#60a5fa` | `#2563eb` |
| | `--vestara-purple` | `#a78bfa` | `#7c3aed` |
| | `--vestara-amber` | `#f59e0b` | `#b45309` |
| **Accent** | `--vestara-accent` | `#f59e0b` | `#b45309` |
| | `--vestara-accent-light` | `#fbbf24` | `#d97706` |
| | `--vestara-accent-dark` | `#d97706` | `#92400e` |
| | `--vestara-accent-bg` | `#f59e0b14` | `#b4530914` |
| | `--vestara-accent-border` | `#f59e0b40` | `#b4530940` |
| | `--vestara-accent-border-hover` | `#f59e0b60` | (not defined) |
| | `--vestara-accent-border-active` | `#f59e0b` | (not defined) |
| | `--vestara-accent-text` | `#fbbf24` | `#d97706` |
| | `--vestara-accent-text-hover` | `#fbbf24` | (not defined) |
| | `--vestara-accent-text-muted` | `#f59e0b` | (not defined) |
| **Text** | `--vestara-text` | `#e4e4e7` | `#3a3a34` |
| | `--vestara-text-2` | `#a1a1aa` | `#6b6b60` |
| | `--vestara-text-muted` | `#71717a` | `#888880` |
| | `--vestara-text-dim` | `#52525b` | `#a8a8a0` |
| **Surface** | `--vestara-surface` | `#0a0a0c` | `#f5f5f0` |
| | `--vestara-surface-elevated` | `color-mix(...)` | `#ffffff` |
| | `--vestara-surface-glow` | `color-mix(...)` | `color-mix(...)` |
| | `--vestara-surface-glow-hover` | `color-mix(...)` | `color-mix(...)` |
| | `--vestara-surface-sheen` | `color-mix(...)` | `color-mix(...)` |
| | `--vestara-surface-sheen-hover` | `color-mix(...)` | `color-mix(...)` |
| **Typography** | `--vestara-font-family` | `ui-sans-serif...` | (same) |
| | `--vestara-font-size-{base,sm,xs,lg}` | Various px values | (same) |
| | `--vestara-font-weight-{normal,medium,semibold}` | 400/500/600 | (same) |
| **Layout** | `--vestara-sidebar-width` | `240px` | (same) |
| | `--vestara-spacing-{page,section,element}` | Various rem | (same) |
| | `--vestara-radius` | `6px` | (same) |
| | `--vestara-radius-lg` | `8px` | (same) |
| | `--vestara-radius-full` | `9999px` | (same) |
| | `--vestara-page-max-width` | `1280px` | (same) |
| **Chart** | `--chart-{grid,text,axis}` | zinc-800/500/700 | warm-shifted |
| | `--chart-tooltip-{bg,border,text}` | zinc-900/800/300 | warm-shifted |

### Missing from `index.css`

| Concept | Status |
|---------|--------|
| Status tokens (`--vestara-status-success`, etc.) | **MISSING** |
| Border tokens (`--vestara-border-subtle`, etc.) | **MISSING** |
| Elevation tokens | **MISSING** |
| Motion tokens | **MISSING** |
| Breakpoint tokens | **MISSING** (Tailwind handles this) |
| Z-index tokens | **MISSING** (Tailwind handles this) |
| Density tokens | **MISSING** |

---

## F. Existing @vestara/ui-tokens Inventory

### TypeScript Token Vocabulary (`tokens.ts`)

| Category | Tokens |
|----------|--------|
| Color | `COLOR.brand.{gold,green,red,blue,purple,amber}`, `COLOR.status.{success,warning,error,info,running,idle}`, `COLOR.zinc.{50..950}` |
| Surface | `SURFACE.{canvas,shell,panel,panelRaised,overlay,interactive}` |
| Text | `TEXT.{primary,secondary,muted,disabled}` |
| Border | `BORDER.{subtle,default,strong,focus}` |
| Accent | `ACCENT.{primary,secondary}` |
| Typography | `TYPOGRAPHY.{display,pageTitle,sectionTitle,panelTitle,body,bodySmall,label,caption,code}` |
| Spacing | `SPACING.{0..24,page,section,element}` |
| Radius | `RADIUS.{none,sm,md,lg,xl,2xl,full}` |
| Elevation | `ELEVATION.{none,sm,md,lg,xl}` |
| Opacity | `OPACITY.{0..100}` |
| Motion | `MOTION.{fast,normal,slow,slower}`, `MOTION.easing.{default,in,out,inOut}` |
| Breakpoints | `BREAKPOINTS.{sm,md,lg,xl,2xl}` |
| Z-index | `Z_INDEX.{base,dropdown,sticky,overlay,modal,popover,toast,tooltip,max}` |
| Sizing | `SIZING.{sidebar.{width,collapsedWidth},header.height,composer.minHeight,icon.{sm,md,lg}}` |
| Density | `DENSITY.{compact,comfortable,spacious}` |

### Theme Maps (`themes.ts`)

- `DARK_THEME`: Maps semantic tokens to dark concrete values
- `LIGHT_THEME`: Maps semantic tokens to light concrete values
- Both use `COLOR.brand.gold` (`#d4a853`) as accent — differs from runtime amber

### CSS Generation (`css.ts`)

Generates 28 CSS variables:
- `--vestara-surface-{canvas,shell,panel,panel-raised,overlay,interactive}`
- `--vestara-text-{primary,secondary,muted,disabled}`
- `--vestara-border-{subtle,default,strong,focus}`
- `--vestara-accent-{primary,secondary,bg,border,border-hover,border-active,text,text-hover,text-muted}`
- `--vestara-status-{success,warning,error,info,running,idle}`

**None of these are consumed by any runtime code.**

---

## G. Current → Canonical Mapping

| Current (`index.css`) | Canonical (`ui-tokens`) | Status | Notes |
|----------------------|------------------------|--------|-------|
| `--vestara-accent` | `--vestara-accent-primary` | **COMPATIBILITY ALIAS** | Keep both; `--vestara-accent` is the primary consumer |
| `--vestara-accent-light` | `--vestara-accent-secondary` | **COMPATIBILITY ALIAS** | |
| `--vestara-accent-dark` | (no equivalent) | **RETIRE** | Use `--vestara-accent-primary` dark variant |
| `--vestara-accent-bg` | `--vestara-accent-bg` | **CANONICAL** | Same name |
| `--vestara-accent-border` | `--vestara-accent-border` | **CANONICAL** | Same name |
| `--vestara-accent-border-hover` | `--vestara-accent-border-hover` | **CANONICAL** | Same name |
| `--vestara-accent-border-active` | `--vestara-accent-border-active` | **CANONICAL** | Same name |
| `--vestara-accent-text` | `--vestara-accent-text` | **CANONICAL** | Same name |
| `--vestara-accent-text-hover` | `--vestara-accent-text-hover` | **CANONICAL** | Same name |
| `--vestara-accent-text-muted` | `--vestara-accent-text-muted` | **CANONICAL** | Same name |
| `--vestara-text` | `--vestara-text-primary` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-text-2` | `--vestara-text-secondary` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-text-muted` | `--vestara-text-muted` | **CANONICAL** | Same name |
| `--vestara-text-dim` | (no equivalent) | **RETIRE** | Use `--vestara-text-disabled` |
| `--vestara-surface` | `--vestara-surface-canvas` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-surface-elevated` | `--vestara-surface-panel-raised` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-green` | `--vestara-status-success` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-red` | `--vestara-status-error` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-blue` | `--vestara-status-info` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-amber` | `--vestara-status-warning` | **COMPATIBILITY ALIAS** | Keep both |
| `--vestara-gold` | (no equivalent) | **RETIRE** | Legacy brand color |
| `--vestara-purple` | (no equivalent) | **RETIRE** | Legacy brand color |
| (none) | `--vestara-surface-shell` | **ADD** | New canonical token |
| (none) | `--vestara-surface-panel` | **ADD** | New canonical token |
| (none) | `--vestara-surface-overlay` | **ADD** | New canonical token |
| (none) | `--vestara-surface-interactive` | **ADD** | New canonical token |
| (none) | `--vestara-border-subtle` | **ADD** | New canonical token |
| (none) | `--vestara-border-default` | **ADD** | New canonical token |
| (none) | `--vestara-border-strong` | **ADD** | New canonical token |
| (none) | `--vestara-border-focus` | **ADD** | New canonical token |
| (none) | `--vestara-status-success-bg` | **ADD** | New canonical token |
| (none) | `--vestara-status-success-border` | **ADD** | New canonical token |
| (none) | `--vestara-status-error-bg` | **ADD** | New canonical token |
| (none) | `--vestara-status-error-border` | **ADD** | New canonical token |
| (none) | `--vestara-status-warning-bg` | **ADD** | New canonical token |
| (none) | `--vestara-status-warning-border` | **ADD** | New canonical token |
| (none) | `--vestara-status-info-bg` | **ADD** | New canonical token |
| (none) | `--vestara-status-info-border` | **ADD** | New canonical token |

---

## H. Canonical Primitive Token Contract

```typescript
// packages/ui-tokens/src/tokens.ts

// Primitives — never consumed directly by components
export const PRIMITIVE = {
  color: {
    blue: { 50: '#...', ..., 500: '#3b82f6', ..., 900: '#...' },
    green: { 500: '#22c55e', ... },
    red: { 500: '#ef4444', ... },
    amber: { 500: '#f59e0b', ... },
    zinc: { 50: '#fafafa', ..., 950: '#09090b' },
  },
  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', ... },
  radius: { none: '0', sm: '0.25rem', ... },
} as const;
```

---

## I. Canonical Semantic Token Contract

```typescript
// Semantic tokens — the primary public styling contract
export const SEMANTIC = {
  surface: {
    canvas: 'surface.canvas',      // App background
    shell: 'surface.shell',        // Sidebar/nav background
    panel: 'surface.panel',        // Card/panel background
    panelRaised: 'surface.panelRaised', // Elevated card
    overlay: 'surface.overlay',    // Modal backdrop
    interactive: 'surface.interactive', // Hover/active background
  },
  text: {
    primary: 'text.primary',       // Main text
    secondary: 'text.secondary',   // Secondary text
    muted: 'text.muted',           // Muted/placeholder text
    disabled: 'text.disabled',     // Disabled text
  },
  border: {
    subtle: 'border.subtle',       // Subtle dividers
    default: 'border.default',     // Standard borders
    strong: 'border.strong',       // Strong emphasis borders
    focus: 'border.focus',         // Focus ring color
  },
  accent: {
    primary: 'accent.primary',     // Brand accent
    secondary: 'accent.secondary', // Lighter accent
    bg: 'accent.bg',               // Accent background
    border: 'accent.border',       // Accent border
    borderHover: 'accent.borderHover',
    borderActive: 'accent.borderActive',
    text: 'accent.text',           // Accent text color
    textHover: 'accent.textHover',
    textMuted: 'accent.textMuted',
  },
  status: {
    success: 'status.success',
    successBg: 'status.success.bg',
    successBorder: 'status.success.border',
    warning: 'status.warning',
    warningBg: 'status.warning.bg',
    warningBorder: 'status.warning.border',
    error: 'status.error',
    errorBg: 'status.error.bg',
    errorBorder: 'status.error.border',
    info: 'status.info',
    infoBg: 'status.info.bg',
    infoBorder: 'status.info.border',
    running: 'status.running',
    pending: 'status.pending',
    disabled: 'status.disabled',
  },
} as const;
```

---

## J. Component-Token Policy

Components must consume **semantic tokens only**. Never consume primitive tokens directly.

```tsx
// CORRECT — semantic token consumption
<div className="bg-(--vestara-surface-canvas) text-(--vestara-text-primary)">

// WRONG — primitive consumption
<div className="bg-zinc-950 text-zinc-100">

// WRONG — hardcoded hex
<div style={{ background: '#09090b' }}>
```

---

## K. Status Token Contract

```css
:root {
  /* Status foreground */
  --vestara-status-success: #4ade80;
  --vestara-status-warning: #f59e0b;
  --vestara-status-error: #f87171;
  --vestara-status-info: #60a5fa;
  --vestara-status-running: #4ade80;
  --vestara-status-pending: #f59e0b;
  --vestara-status-disabled: #52525b;

  /* Status background */
  --vestara-status-success-bg: rgba(74, 222, 128, 0.15);
  --vestara-status-warning-bg: rgba(245, 158, 11, 0.1);
  --vestara-status-error-bg: rgba(248, 113, 113, 0.1);
  --vestara-status-info-bg: rgba(96, 165, 250, 0.1);

  /* Status border */
  --vestara-status-success-border: rgba(74, 222, 128, 0.3);
  --vestara-status-warning-border: rgba(245, 158, 11, 0.3);
  --vestara-status-error-border: rgba(248, 113, 113, 0.3);
  --vestara-status-info-border: rgba(96, 165, 250, 0.3);
}

[data-theme="light"] {
  --vestara-status-success: #16a34a;
  --vestara-status-warning: #b45309;
  --vestara-status-error: #dc2626;
  --vestara-status-info: #2563eb;
  --vestara-status-running: #16a34a;
  --vestara-status-pending: #b45309;
  --vestara-status-disabled: #a8a8a0;

  --vestara-status-success-bg: rgba(22, 163, 74, 0.08);
  --vestara-status-warning-bg: rgba(180, 83, 9, 0.08);
  --vestara-status-error-bg: rgba(220, 38, 38, 0.08);
  --vestara-status-info-bg: rgba(37, 99, 235, 0.08);

  --vestara-status-success-border: rgba(22, 163, 74, 0.2);
  --vestara-status-warning-border: rgba(180, 83, 9, 0.2);
  --vestara-status-error-border: rgba(220, 38, 38, 0.2);
  --vestara-status-info-border: rgba(37, 99, 235, 0.2);
}
```

---

## L. Typography Contract

| Role | CSS Variable | Dark Value | Light Value |
|------|-------------|-----------|-------------|
| Display | `--vestara-font-display` | `ui-sans-serif, system-ui, sans-serif` | (same) |
| Body | `--vestara-font-body` | `ui-sans-serif, system-ui, sans-serif` | (same) |
| Code | `--vestara-font-code` | `ui-monospace, SFMono-Regular, monospace` | (same) |

Font sizes are controlled via `--vestara-font-size-{base,sm,xs,lg}` (already defined in `index.css`).

---

## M. Spacing / Radius / Border / Elevation Contract

### Spacing Scale (already in `index.css`)
- `--vestara-spacing-page: 1rem`
- `--vestara-spacing-section: 0.75rem`
- `--vestara-spacing-element: 0.375rem`

### Radius Scale (already in `index.css`)
- `--vestara-radius: 6px`
- `--vestara-radius-lg: 8px`
- `--vestara-radius-full: 9999px`

### Border Contract (new tokens)
- `--vestara-border-subtle`: subtle dividers
- `--vestara-border-default`: standard borders
- `--vestara-border-strong`: strong emphasis borders
- `--vestara-border-focus`: focus ring color

### Elevation Contract (new tokens)
- `--vestara-elevation-none: none`
- `--vestara-elevation-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3)`
- `--vestara-elevation-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)`
- `--vestara-elevation-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4)`
- `--vestara-elevation-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)`

---

## N. Motion Contract

| Concept | CSS Variable | Value |
|---------|-------------|-------|
| Duration: instant | `--vestara-motion-instant` | `0ms` |
| Duration: fast | `--vestara-motion-fast` | `100ms` |
| Duration: normal | `--vestara-motion-normal` | `200ms` |
| Duration: slow | `--vestara-motion-slow` | `300ms` |
| Easing: standard | `--vestara-easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Easing: enter | `--vestara-easing-enter` | `cubic-bezier(0, 0, 0.2, 1)` |
| Easing: exit | `--vestara-easing-exit` | `cubic-bezier(0.4, 0, 1, 1)` |

Reduced motion: `@media (prefers-reduced-motion: reduce)` must set all durations to `0ms`.

---

## O. Responsive/Breakpoint Contract

| Name | CSS Variable | Value |
|------|-------------|-------|
| compact | `--vestara-breakpoint-compact` | `640px` |
| mobile | `--vestara-breakpoint-mobile` | `768px` |
| tablet | `--vestara-breakpoint-tablet` | `1024px` |
| desktop | `--vestara-breakpoint-desktop` | `1280px` |
| wide | `--vestara-breakpoint-wide` | `1536px` |

---

## P. Surface Hierarchy

```
Canvas (surface.canvas) — app background
  ↓
Shell (surface.shell) — sidebar/nav background
  ↓
Panel (surface.panel) — card/panel background
  ↓
Panel Raised (surface.panelRaised) — elevated card
  ↓
Overlay (surface.overlay) — modal backdrop
  ↓
Interactive (surface.interactive) — hover/active state
```

---

## Q. Light/Dark Appearance Model

```
canonical semantic token → appearance value set
  ├── dark (default)
  └── light
```

Dark and light are NOT separate design systems. Components consume semantics; the appearance mode resolves values.

---

## R. Density Model

Density is NOT another theme. It is a separate axis:

- **comfortable**: default spacing, body font size
- **compact**: reduced spacing, small font size
- **dense**: minimal spacing, small font size

Density tokens are defined in `@vestara/ui-tokens` but not yet exposed as CSS variables.

---

## S. MUI Theme Authority

`@vestara/ui-theme` does not yet exist. When created, it will:
- Depend on `@vestara/ui-tokens`
- Own `createVestaraTheme()`
- Own `VestaraThemeProvider`
- Own MUI augmentation/overrides
- Have no domain dependencies

---

## T. Tailwind/CSS Consumption Contract

```css
/* Approved pattern: semantic utility usage */
<div className="bg-(--vestara-surface-canvas) text-(--vestara-text-primary) border-(--vestara-border-default)">

/* Tailwind v4 supports CSS variable references in utility classes */
<div className="text-(--vestara-accent-text)">
```

Hardcoded classes like `bg-zinc-950`, `text-zinc-100`, `border-zinc-700` will eventually migrate to token-based classes. Migration is NOT part of this milestone.

---

## U. Activity Room --ar-* Migration Classification

| Token | Type | Action |
|-------|------|--------|
| `--ar-gold` | Alias → `--vestara-accent` | **ADAPT** → RETIRE (use `--vestara-accent` directly) |
| `--ar-gold-light` | Alias → `--vestara-accent-light` | **ADAPT** → RETIRE |
| `--ar-gold-deep` | Alias → `--vestara-accent-dark` | **ADAPT** → RETIRE |
| `--ar-gold-veil` | Alias → `--vestara-accent-bg` | **ADAPT** → RETIRE |
| `--ar-hairline` | Alias → `--vestara-accent-border` | **ADAPT** → RETIRE |
| `--ar-hairline-strong` | Alias → `--vestara-accent-border-hover` | **ADAPT** → RETIRE |
| `--ar-sheen` | Derived from accent | **ADAPT** → RETIRE |
| `--ar-chrome` | Component-specific surface | **KEEP** (component token) |
| `--ar-surface` | Component-specific surface | **KEEP** (component token) |
| `--ar-surface-raised` | Component-specific surface | **KEEP** (component token) |
| `--ar-panel-bg` | Component-specific surface | **KEEP** (component token) |
| `--ar-panel-shadow` | Component-specific elevation | **KEEP** (component token) |
| `--ar-header-bg` | Alias → `--vestara-surface` | **ADAPT** → RETIRE |
| `--ar-rail-bg` | Component-specific surface | **KEEP** (component token) |
| `--ar-ink` | Alias → `--vestara-text` | **ADAPT** → RETIRE |
| `--ar-ink-2` | Alias → `--vestara-text-2` | **ADAPT** → RETIRE |
| `--ar-ink-muted` | Alias → `--vestara-text-muted` | **ADAPT** → RETIRE |
| `--ar-ink-dim` | Alias → `--vestara-text-dim` | **ADAPT** → RETIRE |
| `--ar-sapphire` | Alias → `--vestara-blue` | **ADAPT** → RETIRE |
| `--ar-amethyst` | Alias → `--vestara-purple` | **ADAPT** → RETIRE |
| `--ar-jade` | Alias → `--vestara-green` | **ADAPT** → RETIRE |
| `--ar-ruby` | Alias → `--vestara-red` | **ADAPT** → RETIRE |
| `--ar-amber` | Alias → `--vestara-amber` | **ADAPT** → RETIRE |
| `--ar-serif` | Component-specific typography | **KEEP** (component token) |
| `--ar-drop-shadow` | Component-specific elevation | **KEEP** (component token) |

---

## V. Global/Floating Assistant Migration Inventory

### ConversationPanel.tsx (1,144 lines, ~80+ hardcoded instances)

| Hardcoded Class | Token Equivalent | Count |
|----------------|-----------------|-------|
| `text-zinc-100` | `text-(--vestara-text-primary)` | ~15 |
| `text-zinc-200` | `text-(--vestara-text-primary)` | ~10 |
| `text-zinc-300` | `text-(--vestara-text-secondary)` | ~12 |
| `text-zinc-400` | `text-(--vestara-text-muted)` | ~8 |
| `text-zinc-500` | `text-(--vestara-text-muted)` | ~10 |
| `text-zinc-600` | `text-(--vestara-text-disabled)` | ~5 |
| `text-zinc-700` | `text-(--vestara-text-disabled)` | ~3 |
| `bg-zinc-900/80` | `bg-(--vestara-surface-panel)` | ~5 |
| `bg-zinc-950` | `bg-(--vestara-surface-canvas)` | ~3 |
| `border-zinc-700/40` | `border-(--vestara-border-default)` | ~8 |
| `border-zinc-800/70` | `border-(--vestara-border-subtle)` | ~6 |
| `bg-amber-500/15` | `bg-(--vestara-status-warning-bg)` | ~3 |
| `text-amber-300` | `text-(--vestara-status-warning)` | ~4 |
| `bg-emerald-500/15` | `bg-(--vestara-status-success-bg)` | ~2 |
| `text-emerald-400` | `text-(--vestara-status-success)` | ~2 |
| `bg-red-500/10` | `bg-(--vestara-status-error-bg)` | ~2 |
| `text-red-300` | `text-(--vestara-status-error)` | ~2 |

### Other Assistant Files

| File | Hardcoded Instances | Priority |
|------|-------------------|----------|
| `FloatingPanel.tsx` | ~10 | Medium |
| `GlobalAssistant.tsx` | ~5 | Low |
| `FullWindowSurface.tsx` | ~2 (already token-driven) | Low |
| `ConversationHistory.tsx` | ~30 | Medium |
| `AssistantCodeEdit.tsx` | ~30 | Medium |
| `AssistantTerminal.tsx` | ~25 | Medium |

---

## W. Shared UI Primitive Migration Inventory

| Component | Hardcoded Instances | Token Fix |
|-----------|-------------------|-----------|
| `Pill.tsx` | 12 (zinc, amber, red, emerald) | Replace with semantic tokens |
| `StatusIndicator.tsx` | 5 (emerald, amber, red, zinc) | Replace with status tokens |
| `EmptyState.tsx` | 6 (amber, orange, zinc) | Replace with accent tokens |

---

## X. Enforcement Strategy

### Staged Enforcement

1. **REPORT** (current): Document all violations (this milestone)
2. **WARNING** (VES-DESIGN-003): Add Biome rule to warn on new hardcoded palette classes
3. **ERROR** (after migration): Fail CI on new violations in approved locations
4. **FULL ENFORCEMENT** (after full migration): Repo-wide failing CI gate

### Allowlist

- `packages/ui-tokens/` — token definitions
- `packages/design-system/` — accent palettes
- `apps/workspace/src/styles/index.css` — CSS variable definitions
- `apps/workspace/src/styles/activity-room.css` — Activity Room CSS (until migration)
- Test fixtures
- Documented exceptions

---

## Y. Package/Dependency Contract

### @vestara/ui-tokens

```
Layer 0
├── No React dependency
├── No MUI dependency
├── No domain dependencies
├── Usable by TS and CSS-generation tooling
└── Exports: COLOR, SURFACE, TEXT, BORDER, ACCENT, TYPOGRAPHY, SPACING, RADIUS, ELEVATION, OPACITY, MOTION, BREAKPOINTS, Z_INDEX, SIZING, DENSITY, Theme, generateCSSVariables, applyCSSVariables
```

### @vestara/ui-theme (future)

```
Layer 1
├── Depends on @vestara/ui-tokens
├── React/MUI integration
├── Owns createVestaraTheme()
├── Owns VestaraThemeProvider
├── Owns MUI augmentation/overrides
└── No domain dependencies
```

---

## Z. Ordered Migration Plan

### Phase 1: Token Scaffolding (this milestone)
1. Add status tokens to `index.css`
2. Add border tokens to `index.css`
3. Add elevation tokens to `index.css`
4. Add motion tokens to `index.css`
5. Add compatibility aliases for `--vestara-text` → `--vestara-text-primary`, etc.
6. Update `@vestara/ui-tokens` to match runtime values (amber, not gold)
7. Create `@vestara/ui-theme` package scaffold

### Phase 2: Shared UI Migration
1. Migrate `Pill.tsx` to semantic tokens
2. Migrate `StatusIndicator.tsx` to semantic tokens
3. Migrate `EmptyState.tsx` to semantic tokens
4. Verify all consumers work in both dark and light modes

### Phase 3: Layout Migration
1. Migrate `ShellLayout.tsx` root background
2. Migrate `ChatLayout.tsx` root background
3. Migrate `SettingsLayout.tsx` root background

### Phase 4: Assistant Migration
1. Migrate `ConversationPanel.tsx` (highest impact)
2. Migrate `FloatingPanel.tsx`
3. Migrate `GlobalAssistant.tsx`
4. Migrate `ConversationHistory.tsx`
5. Migrate `AssistantCodeEdit.tsx`
6. Migrate `AssistantTerminal.tsx`

### Phase 5: Activity Room Migration
1. Replace `--ar-*` aliases with direct `--vestara-*` references
2. Keep component-specific `--ar-*` tokens (surfaces, shadows)
3. Migrate remaining hardcoded inline classes

### Phase 6: Enforcement
1. Add Biome warnings for new violations
2. Add CI gate for new violations
3. Full enforcement after migration complete

---

## AA. Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Visual regression during migration | Medium | Migrate token-by-token; verify both modes at each step |
| Breaking existing consumers | Medium | Compatibility aliases prevent breakage |
| Performance impact of CSS variables | Low | CSS variables are fast; no runtime overhead |
| Light mode visual issues | High | Test each component in both modes before marking complete |
| Activity Room regression | Medium | Keep `--ar-*` aliases until migration is verified |

---

## AB. VES-DESIGN-003 Readiness Gate

| # | Question | Answer |
|---|----------|--------|
| 1 | What package owns canonical Vestara tokens? | `@vestara/ui-tokens` (Layer 0) |
| 2 | What package owns canonical MUI theme construction? | `@vestara/ui-theme` (Layer 1, to be created) |
| 3 | What are the canonical semantic token names? | `surface.canvas`, `text.primary`, `border.default`, `accent.primary`, `status.success`, etc. |
| 4 | How are CSS variables derived from them? | `generateCSSVariables()` in `@vestara/ui-tokens/css.ts` |
| 5 | How do dark/light values resolve without creating two themes? | `DARK_THEME` and `LIGHT_THEME` maps in `@vestara/ui-tokens/themes.ts` |
| 6 | How do Tailwind/CSS consumers use them? | `bg-(--vestara-surface-canvas)` pattern |
| 7 | What happens to existing `index.css` tokens? | Compatibility aliases; gradual migration |
| 8 | What happens to Activity Room `--ar-*` aliases? | ADAPT → RETIRE; keep component-specific tokens |
| 9 | How will hardcoded colors be migrated without visual redesign? | Token-by-token replacement; verify both modes |
| 10 | How will new violations eventually be prevented? | Staged Biome/CI enforcement |

**Decision: VES-DESIGN-003 READY**

All 10 questions can be answered unambiguously. The canonical token contract is defined, the migration path is clear, and the authority hierarchy is established.
