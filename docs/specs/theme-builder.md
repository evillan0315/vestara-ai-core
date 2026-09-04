---
title: Theme Builder Specification
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Theme Builder Specification

## Overview
The Theme Builder extends the existing Vestara theme system to allow users to create, customize, preview, export, and import custom themes. It builds on the existing CSS custom property system, design-system package, and Settings framework.

## Current State Analysis

### Existing Assets
1. **Design System** (`packages/design-system/src/index.ts`):
   - 9 predefined color themes: gold, amber, emerald, blue, violet, rose, teal, neutral, orange
   - TUI semantic palettes for each theme
   - AccentPalette and TuiSemanticPalette types

2. **Workspace Theme** (`apps/workspace/src/lib/theme.tsx`):
   - ThemeProvider with ThemeContext
   - 4 workspace profiles: default, minimal, presentation, accessibility
   - ThemeSettings interface with 15 configurable properties
   - ACCENT_PALETTES (mirrors design-system)
   - CSS custom property application via `applySettings()`
   - localStorage persistence + server hydration

3. **Settings UI** (`apps/workspace/src/pages/Settings/appearance-controls.tsx`):
   - Profile selector (4 presets)
   - Theme mode (dark/light/system)
   - Accent palette selector (9 colors)
   - Typography controls (font family, size, weight)
   - Layout controls (sidebar, spacing, radius, full-width, fullscreen)
   - Navigation indicator controls

4. **CSS Tokens** (`apps/workspace/src/styles/index.css`):
   - `--vestara-*` custom properties for colors, spacing, typography, radius
   - Dark/light mode via `[data-theme]` attribute
   - Holographic card overlays
   - Component-specific utilities

### Gaps for Theme Builder
1. **No custom theme creation** - only 9 predefined accent palettes
2. **No token-level editing** - can't adjust individual CSS custom properties
3. **No live preview** - changes apply immediately but no isolated preview
4. **No export/import** - themes locked to localStorage
4. **No theme sharing** - no portable format
5. **No semantic token editor** - can't adjust surface, border, text roles independently
6. **No TUI theme sync** - web themes don't map to terminal palettes

## Architecture

### Core Types (Extend `theme.tsx`)

```typescript
// Semantic token categories matching VDS design tokens
export type TokenCategory = 
  | 'color-bg' 
  | 'color-surface' 
  | 'color-border' 
  | 'color-text' 
  | 'color-focus' 
  | 'color-status' 
  | 'color-accent'
  | 'spacing' 
  | 'radius' 
  | 'shadow' 
  | 'motion' 
  | 'typography';

export interface SemanticToken {
  name: string;           // e.g., 'color-surface-panel'
  category: TokenCategory;
  cssVar: string;         // e.g., '--vestara-color-surface-panel'
  label: string;          // Human-readable
  description: string;
  type: 'color' | 'length' | 'number' | 'font-stack';
  defaultValue: string;
  currentValue: string;
  // For color tokens
  lightValue?: string;
  darkValue?: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  description: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  isBuiltIn: boolean;
  // Base theme to extend
  baseThemeId: string;    // One of the 9 ACCENT_PALETTES keys
  // Semantic token overrides
  tokens: Record<string, string>;  // cssVar -> value
  // Light/dark specific overrides
  lightTokens?: Record<string, string>;
  darkTokens?: Record<string, string>;
  // Profile settings (from ThemeSettings)
  profile: Partial<ThemeSettings>;
  // TUI palette (optional, derived if not provided)
  tuiPalette?: Partial<TuiSemanticPalette>;
}

export interface ThemeBuilderState {
  // Current editing theme
  editingTheme: CustomTheme | null;
  // Preview mode
  previewMode: boolean;
  // Available themes
  customThemes: CustomTheme[];
  // Built-in themes (from ACCENT_PALETTES + PROFILES)
  builtInThemes: CustomTheme[];
}
```

### State Management

1. **ThemeBuilderContext** - New React context for Theme Builder state
2. **Persistence** - Extend `appearance-durability.ts` for custom themes
3. **Settings Framework Integration** - Register custom themes as settings module

### Components

```
apps/workspace/src/pages/Settings/components/ThemeBuilder/
├── ThemeBuilder.tsx           # Main container
├── ThemeBuilderTabs.tsx       # Tab navigation (Editor, Preview, Presets, Import/Export)
├── TokenEditor/
│   ├── TokenEditor.tsx        # Main token grid
│   ├── TokenCategorySection.tsx
│   ├── TokenRow.tsx           # Individual token editor
│   ├── ColorTokenEditor.tsx   # Color picker with light/dark
│   ├── LengthTokenEditor.tsx  # Slider/input for spacing/radius
│   └── FontTokenEditor.tsx    # Font stack selector
├── ThemePreview/
│   ├── ThemePreview.tsx       # Live preview iframe/panel
│   ├── PreviewComponents.tsx  # Sample components showing all tokens
│   └── PreviewToolbar.tsx     # Dark/light toggle, resize
├── PresetGallery/
│   ├── PresetGallery.tsx      # Grid of built-in + custom themes
│   ├── PresetCard.tsx         # Theme thumbnail + actions
│   └── CreateFromPreset.tsx   # Dialog to customize a preset
├── ImportExport/
│   ├── ImportExport.tsx       # Main panel
│   ├── ImportDialog.tsx       # Paste JSON / upload file
│   ├── ExportDialog.tsx       # Download JSON / copy to clipboard
│   └── ShareDialog.tsx        # Generate shareable URL
└── ThemeBuilderHeader.tsx     # Title, save/discard, apply buttons
```

### Data Flow

```
User Action
    │
    ▼
ThemeBuilderContext (update editingTheme.tokens)
    │
    ├─▶ Preview: applySettings(editingTheme) → CSS vars update in preview iframe
    │
    ├─▶ Save: persist to localStorage + settings framework
    │
    ├─▶ Export: serialize CustomTheme → JSON
    │
    └─▶ Import: parse JSON → validate → load into editingTheme
```

### Persistence Strategy

1. **Ephemeral**: localStorage key `vestara-custom-themes` (array of CustomTheme)
2. **Durable**: Settings Framework module `theme-builder` with entries per theme
3. **Server Sync**: On save, POST to `/api/settings/theme-builder` (new route)

### API Endpoints (New)

```
GET    /api/settings/theme-builder           # List all custom themes
GET    /api/settings/theme-builder/:id       # Get single theme
POST   /api/settings/theme-builder           # Create theme
PUT    /api/settings/theme-builder/:id       # Update theme
DELETE /api/settings/theme-builder/:id       # Delete theme
POST   /api/settings/theme-builder/import    # Import theme(s) from JSON
```

## UI/UX Specification

### Theme Builder Tab (New tab in Settings > Appearance)

**Layout**: 3-column responsive
- Left: Preset Gallery (collapsible sidebar on mobile)
- Center: Token Editor (main workspace)
- Right: Live Preview (collapsible, default open)

### Token Editor

**Categories** (collapsible sections):
1. **Accent Colors** - Primary, hover, active, bg, border variants
2. **Background** - App, panel, raised, interactive hover
3. **Surface** - Panel, raised, interactive states
4. **Borders** - Subtle, default, strong
5. **Text** - Primary, secondary, muted, dim
6. **Focus** - Ring color
7. **Status** - Healthy, degraded, unavailable, disabled, auth, approval, conflict, saving, saved, failed, blocked, pending
8. **Spacing** - Page, section, element
9. **Radius** - Default, lg, full
10. **Typography** - Font family, base/sm/xs/lg sizes, weights
11. **Layout** - Sidebar width, page max-width

**Token Row**:
- Label + description tooltip
- Current value display
- Editor control (color picker / slider / select / input)
- Reset to default button
- Light/Dark toggle for color tokens (shows both values)

### Preview Panel

**Content**: Iframe or isolated div with sample components:
- Header with navigation
- Sidebar with navigation items (active/hover states)
- Card grid (default, hover, active)
- Form inputs (text, select, textarea, focus states)
- Buttons (primary, secondary, ghost, disabled)
- Status badges (all status types)
- Data table
- Code block
- Toast notifications
- Modal/dialog

**Controls**:
- Dark/Light/System mode toggle
- Viewport width selector (mobile, tablet, desktop, full)
- Refresh button (re-render with current tokens)

### Preset Gallery

**Built-in Themes** (9 accent palettes × 4 profiles = 36 combinations):
- Show as cards with thumbnail preview
- Click to "Customize" → loads into editor
- "Apply" button to use immediately

**Custom Themes** (user-created):
- User's saved themes
- Edit / Duplicate / Delete / Export actions
- Drag to reorder

### Import/Export

**Export**:
- Single theme: Download `.vestara-theme.json`
- All themes: Download `.vestara-themes.json` (array)
- Copy to clipboard (JSON or base64)
- Share URL: `?theme=<base64>` (optional)

**Import**:
- File upload (`.json`)
- Paste JSON
- Validate schema (Zod)
- Merge strategy: Replace / Add new / Update existing
- Preview before applying

## Implementation Plan

### Phase 1: Core Types & State (Week 1)
- [ ] Extend `theme.tsx` with `CustomTheme`, `SemanticToken` types
- [ ] Create `ThemeBuilderContext` provider
- [ ] Add `customThemes` to localStorage persistence
- [ ] Add Zod schemas for validation

### Phase 2: Token Editor UI (Week 1-2)
- [ ] Build TokenEditor component with all categories
- [ ] Implement ColorTokenEditor (with light/dark)
- [ ] Implement LengthTokenEditor (sliders)
- [ ] Implement FontTokenEditor
- [ ] Connect to ThemeBuilderContext

### Phase 3: Live Preview (Week 2)
- [ ] Build PreviewComponents showcase
- [ ] Create ThemePreview with iframe isolation
- [ ] Add dark/light/viewport controls
- [ ] Connect preview to editing theme tokens

### Phase 4: Preset Gallery (Week 2)
- [ ] Generate thumbnails for built-in combinations
- [ ] Build PresetGallery with card grid
- [ ] Implement "Customize" and "Apply" actions
- [ ] Add custom theme management (edit/delete/duplicate)

### Phase 5: Import/Export (Week 2-3)
- [ ] Build ExportDialog (JSON, clipboard, file)
- [ ] Build ImportDialog (file, paste, validation)
- [ ] Add share URL generation
- [ ] Schema validation with Zod

### Phase 6: Settings Integration (Week 3)
- [ ] Add ThemeBuilder tab to Settings page
- [ ] Register theme-builder module in settings-framework
- [ ] Create API routes for durable persistence
- [ ] Hydrate custom themes on app load

### Phase 7: Testing & Polish (Week 3)
- [ ] Unit tests for types, validation, context
- [ ] Component tests for TokenEditor, Preview, Gallery
- [ ] Integration test: create → edit → preview → export → import
- [ ] Visual regression tests for preview components
- [ ] Accessibility audit (keyboard, screen reader, contrast)

## Technical Considerations

### CSS Variable Injection
- Preview uses isolated iframe with `document.documentElement.style.setProperty()`
- Main app continues using `applySettings()` from ThemeProvider
- ThemeBuilder applies to preview only until "Apply" clicked

### Performance
- Debounce token updates (150ms) for preview
- Memoize token categories and computed values
- Virtualize token list if >100 tokens

### Accessibility
- All color pickers have accessible labels
- Keyboard navigation for all controls
- Live region for preview updates
- High contrast mode respected

### TUI Sync
- On theme save, generate TUI palette from web tokens
- Store in customTheme.tuiPalette
- CLI/TUI reads from settings framework

## File Structure Changes

```
apps/workspace/src/
├── lib/
│   ├── theme.tsx              # Extended with CustomTheme, SemanticToken
│   ├── theme-builder-context.tsx  # New: ThemeBuilderProvider, useThemeBuilder
│   ├── appearance-durability.ts   # Extended for custom themes
│   └── theme-tokens.ts        # New: SEMANTIC_TOKENS catalog
├── pages/Settings/
│   ├── components/ThemeBuilder/  # New: all ThemeBuilder components
│   ├── appearance-controls.tsx   # Modified: add ThemeBuilder tab
│   └── SettingsPage.tsx          # Modified: register ThemeBuilder route
└── styles/
    └── theme-builder.css      # New: ThemeBuilder-specific styles

packages/settings-framework/src/
├── types.ts                   # Extended: theme-builder module types
└── modules/
    └── theme-builder.ts       # New: module registration

apps/api/src/routes/
└── settings-theme-builder.ts  # New: API routes
```

## Acceptance Criteria

1. **Create Custom Theme**: User can create a new theme from scratch or from preset
2. **Edit Tokens**: User can modify any semantic token with appropriate editor
3. **Live Preview**: Changes reflect in preview panel within 200ms
4. **Apply Theme**: "Apply" button makes theme active across Workspace
5. **Persist**: Custom themes survive reload, sync to server
6. **Export**: Single/all themes export as valid JSON
7. **Import**: Valid JSON imports as editable themes
8. **Delete**: User can delete custom themes (not built-in)
9. **Reset**: "Reset to Default" restores default profile
10. **Accessibility**: All controls keyboard accessible, WCAG AA contrast