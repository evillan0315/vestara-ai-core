# PCS-023 — Theme System & Dashboard Customization

**Status**: Draft
**Date**: 2026-07-25
**Traceability**: v7.1 milestone

---

## 1. Problem Statement

The dashboard currently has a single dark-only appearance. Users need the ability to switch between light, dark, and system-following themes, customize which sections are visible, and save their preferences across sessions.

---

## 2. Theme System

### 2.1 Modes

| Mode | Behavior |
|------|----------|
| `dark` | Force dark theme (default) |
| `light` | Force light theme |
| `system` | Follow OS preference via `prefers-color-scheme` |

### 2.2 CSS Variable Architecture

Theme values are defined as CSS custom properties on `:root` / `[data-theme]`:

```
:root, [data-theme="dark"]   → dark palette
[data-theme="light"]          → light palette
```

Key variable groups:
- Background/surface: `--vestara-bg`, `--vestara-surface`, `--vestara-surface-2`
- Border: `--vestara-border`, `--vestara-border-2`
- Text: `--vestara-text`, `--vestara-text-2`, `--vestara-text-muted`, `--vestara-text-dim`
- Accent: `--vestara-amber`, `--vestara-green`, `--vestara-red`, `--vestara-blue`, `--vestara-purple`
- Chart: `--chart-grid`, `--chart-text`, `--chart-tooltip-bg`, `--chart-tooltip-border`

### 2.3 Persistence

Theme preference is stored in `localStorage` key `vestara-theme` and applied on page load before render to prevent flash.

### 2.4 System Theme Detection

When mode is `system`, a `matchMedia('prefers-color-scheme: light')` listener updates the `data-theme` attribute in real time when the OS theme changes.

---

## 3. Dashboard Customization

### 3.1 Section Visibility

Each collapsible section saves its collapsed state to `localStorage(vestara-dashboard-collapsed)`. Per-user section visibility preferences determine which sections appear by default.

### 3.2 View Modes

| Mode | Description |
|------|-------------|
| `detailed` | Full section rendering with all data |
| `compact` | Condensed layout, fewer details |

Persisted in `localStorage(vestara-dashboard-view)`.

### 3.3 Dashboard Presets

| Preset | Sections shown | Use case |
|--------|---------------|----------|
| `default` | All sections | General overview |
| `compact` | Activity, Agents, System | Quick status check |
| `analytics` | Conversation Activity, Charts, Milestones | Data analysis |
| `development` | Projects, Sprints, Agents, Active Development | Feature work |

---

## 4. Workspace Profiles

Instead of exposing a dozen individual toggles, the UI presents **workspace profiles** — predefined `ThemeSettings` objects that apply a consistent set of font, layout, spacing, and radius values.

### 4.1 Built-in Profiles

| Profile | Icon | Font | Size | Weight | Sidebar | Spacing | Radius |
|---------|------|------|------|--------|---------|---------|--------|
| **Default** | ◈ | system | medium | normal | normal | comfortable | medium |
| **Minimal** | ⊟ | mono | small | normal | compact | compact | none |
| **Presentation** | ▯ | system | large | normal | wide | comfortable | large |
| **Accessibility** | ♿ | system | large | semibold | wide | spacious | large |

### 4.2 Profile Data Model

```typescript
interface WorkspaceProfile {
  id: string;
  label: string;
  description: string;
  icon: string;
  settings: ThemeSettings;
}
```

### 4.3 Application

`applyProfile(id)` sets the active profile ID, updates `ThemeSettings` to the profile's values, and persists both to localStorage:

| Key | Value |
|-----|-------|
| `vestara-theme-profile` | `"default"` / `"minimal"` / `"presentation"` / `"accessibility"` |
| `vestara-theme-settings` | JSON of the profile's `ThemeSettings` |

### 4.4 Reset

`resetSettings()` calls `applyProfile('default')`, restoring the Default profile.

---

## 5. Theme-Aware Components

### 5.1 ReCharts Integration

Charts use `useChartColors()` hook which returns theme-aware colors:
- Grid lines: `--chart-grid`
- Axis labels: `--chart-text`
- Tooltip background/border/text: `--chart-tooltip-*`
- `ResponsiveContainer` inherits parent background

### 5.2 CSS Utility Classes

```css
/* Font */
.text-base-theme  → font-size: var(--vestara-font-size-base)
.text-sm-theme    → font-size: var(--vestara-font-size-sm)
.text-xs-theme    → font-size: var(--vestara-font-size-xs)
.text-lg-theme    → font-size: var(--vestara-font-size-lg)
.font-normal-theme  → font-weight: var(--vestara-font-weight-normal)
.font-medium-theme  → font-weight: var(--vestara-font-weight-medium)
.font-semibold-theme → font-weight: var(--vestara-font-weight-semibold)

/* Spacing */
.p-page   → padding: var(--vestara-spacing-page)
.p-section → padding: var(--vestara-spacing-section)
.p-element → padding: var(--vestara-spacing-element)
.gap-section → gap: var(--vestara-spacing-section)
.mb-section → margin-bottom: var(--vestara-spacing-section)

/* Radius */
.rounded-theme     → border-radius: var(--vestara-radius)
.rounded-theme-lg  → border-radius: var(--vestara-radius-lg)
.rounded-theme-full → border-radius: var(--vestara-radius-full)

/* Sidebar */
.sidebar-width       → width: var(--vestara-sidebar-width)
.sidebar-width-fixed → width: var(--vestara-sidebar-width)
```

### 5.3 Tailwind Zinc Palette

All Tailwind `bg-zinc-*`, `text-zinc-*`, `border-zinc-*` classes are theme-aware through `--color-zinc-*` CSS variable overrides in `[data-theme="light"]`. The zinc scale inverts:

| Shade | Dark | Light |
|-------|------|-------|
| 950 | near black | near white |
| 900 | #18181b | #f0f0ea |
| 800 | #27272a | #e0e0d8 |
| ... | ... | ... |
| 50 | #fafafa | #1a1a10 |

---

## 6. Implementation

### 6.1 Files

| File | Role |
|------|------|
| `src/lib/theme.tsx` | ThemeProvider context, useTheme hook, useChartColors hook, ThemeSettings types, font/layout/radius presets |
| `src/styles/index.css` | CSS custom properties for dark + light, font/spacing/radius utility classes |
| `src/components/ShellLayout.tsx` | Theme toggle button in header bar, sidebar-width CSS variable |
| `src/pages/Settings.tsx` | Theme mode selector, font family/size/weight, sidebar width, spacing, radius controls |

### 6.2 Data Flow

```
ThemeProvider (wraps App)
  ↓
useTheme() → { mode, resolved, settings, activeProfile, setMode, toggle, applyProfile, resetSettings }
  ↓
┌─ ShellLayout: toggle button (☀/☾), sidebar width from profile
├─ Settings: profile selector (4 cards) + color scheme toggle
└─ applyProfile(id) → updates ThemeSettings + persists to localStorage
  ↓
localStorage('vestara-theme') + localStorage('vestara-theme-profile') + localStorage('vestara-theme-settings')
  ↓
CSS variables → data-theme attribute → all pages/components adapt
```

---

## 7. Non-Goals

- Drag-and-drop section reordering — covered in a future milestone
- Per-user section visibility preferences beyond collapse state — future
- Full light-theme polish for amber/green/red Tailwind palette — only zinc scale is inverted
- Custom color picker for accent colors — future
