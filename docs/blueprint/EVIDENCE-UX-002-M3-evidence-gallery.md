# EVIDENCE-UX-002 M3 — Visual Evidence Gallery

**Status:** IMPLEMENTED (M3 only — no lightbox/viewer, no visual diff, no baseline
management changes, no new evidence authority)
**Date:** 2026-09-04
**Basis:** M1 (`1c2829a`) + M2 (`b6622c7`), both frozen. PCS-026 preserved.
**Scope boundary:** no Evidence M4 (lightbox/viewer), no GA M5/M6/M7, no
GA-CAP-002, no AR-009.

## 1. Audit findings (pre-mutation)

The Evidence page (`apps/workspace/src/pages/Evidence.tsx`, 423 lines) is a
self-contained component with:

- **No shared state management** — raw `useState` + `fetch` + local `fetchJson`
  helper. No React Query, no Zustand.
- **`EvidenceArtifact`** (lines 94–118): renders images inline via the original
  artifact endpoint (`/api/evidence/artifacts/:digest?mediaType=…`), text as
  "open in new tab", others as download links.
- **No evidence grouping** — flat list within each expanded bundle, each with a
  `kind` badge (violet pill).
- **`EvidenceReference` interface** (local, not imported from `@vestara/evidence`):
  lacked `visual` metadata field.
- **Responsive grids** exist for stat cards (2/4 col) and baselines (1/2/3 col).
- **Design tokens**: CSS custom properties (`--vestara-*`), Tailwind utilities,
  dark neutral canvas, accent borders.
- **Pre-existing bug**: `evidence-baselines-ui.test.tsx` lacks
  `@vitest-environment jsdom` — fails in all environments. Not introduced by M3.

## 2. Component architecture

```text
EvidencePage
├── Header (h1 + refresh)
├── StatCards (4-up grid)
├── Visual Baselines (existing, unchanged)
├── EvidenceGallery (NEW — M3)
│   └── VisualEvidenceCard × N
│       ├── bounded preview viewport (aspect-video)
│       │   ├── loading placeholder (animate-pulse)
│       │   ├── loaded thumbnail (<img> from /thumbnail endpoint)
│       │   ├── preview unavailable (415 — deterministic, no retry)
│       │   └── preview failed (unexpected error)
│       └── metadata (summary, dimensions, media type, producer)
├── Bundle list (existing, unchanged)
│   └── EvidenceArtifact × N (nonvisual only — returns null for visual kinds)
```

All new code lives in `Evidence.tsx` — no new files, no new packages, no new
dependencies. The gallery is a section within the existing page, not a parallel
route or separate page.

## 3. Visual evidence selection

**Selection rule:** `kind ∈ { 'screenshot', 'visual-comparison' }` — the
authoritative evidence kind, never filename extension, never media type alone.

`VISUAL_EVIDENCE_KINDS` is a `ReadonlySet<string>` checked by
`isVisualEvidence(reference)`. This function is used by both `EvidenceGallery`
(grouping) and `EvidenceArtifact` (early return `null` for visual kinds —
visual evidence is rendered in the gallery, not inline in the bundle detail).

Deduplication: `visualReferences` memo uses a `Set<digest>` to ensure each
artifact appears once even if referenced by multiple bundles.

## 4. Secure thumbnail flow

```text
VisualEvidenceCard
  → new Image() preload: /api/evidence/artifacts/:digest/thumbnail
  → onload  → thumbnailStatus = 'loaded'  → <img src="/…/thumbnail">
  → onerror → thumbnailStatus = 'unavailable' → "Preview unavailable"
```

- **No filesystem paths** — all image `src` attributes resolve through the
  Evidence API only.
- **No producer paths** — `reference.provenance.producer` is displayed as text
  metadata, never as an image source.
- **No original endpoint for thumbnails** — the card never falls back to
  `/api/evidence/artifacts/:digest` for image display.
- **No `?mediaType=` spoofing** — the thumbnail endpoint ignores query params
  (M2 contract).
- **No SVG** — SVG is excluded at the M2 layer (415); never reaches `<img>`.

## 5. Thumbnail-unavailable semantics

A 415 response from the thumbnail endpoint means "this media type cannot be
thumbnailed in M2" — NOT "evidence is missing." The card renders a restrained
placeholder ("Preview unavailable") while still showing all metadata (summary,
dimensions, media type, producer). The evidence item remains visible and
selectable.

**No retry logic** — the 415 is deterministic (PNG-only decoder in M2). The
`Image.onerror` fires once and the status stays `unavailable`.

**No full-resolution fallback** — the card never fetches the original artifact
bytes to display as a thumbnail. The original endpoint serves full-resolution
evidence for download/inspection, not for gallery presentation.

## 6. Card metadata

Displayed fields (authoritative, from `EvidenceReference`):

| Field | Source | Displayed as |
|-------|--------|-------------|
| summary | `reference.summary` | Card title (truncated) |
| dimensions | `reference.visual?.width/height` | "1280 × 720" (omitted if absent) |
| media type | `reference.visual?.mediaType ?? mediaType` | "PNG" (subtype extracted) |
| producer | `reference.provenance.producer` | "Playwright" |

**Not displayed:** internal digest (available in a future details affordance),
executionId, environment, contentHash, operation. No "Verified" or verdict
text — the gallery presents evidence artifacts, not verifier assertions.

## 7. Responsive layout

```text
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3
```

- Narrow (< 640px): 1 column
- Medium (640–1023px): 2 columns
- Wide (≥ 1024px): 3 columns

Each card uses `aspect-video` (16:9) for the preview viewport, with
`object-contain` on the `<img>` — portrait screenshots (e.g. 480×900) are
letterboxed within the viewport, never cropped or distorted.

## 8. Selection (M4 readiness)

Selection state: `selectedVisualRef: string | null` in `EvidencePage`.
Clicking a card toggles selection; clicking again deselects.

Visual selection indicator: CSS class swap from
`border-(--vestara-accent-border)` to `border-(--vestara-accent)` + accent
background. Not color-only — border width/color changes are accompanied by
the `focus:ring-2 focus:ring-(--vestara-accent)` for keyboard focus.

M4 will extend with: `<VisualEvidenceViewer>` triggered by selection, likely
via an `onSelect` prop pattern. The gallery does not implement a viewer,
modal, or lightbox.

## 9. Accessibility

- Cards are `<button>` elements — keyboard reachable, focusable, activatable
  with Enter/Space.
- `aria-label` on each card: "Visual evidence: {summary}".
- Images have `alt` text derived from `reference.summary` (not filesystem path).
- Selection uses border change (not color-only).
- Loading placeholder uses `animate-pulse` (subtle, not noisy for screen
  readers).
- "Preview unavailable" is a static text element, not an ARIA live region.

## 10. Nonvisual evidence

Nonvisual evidence rendering is **unchanged**:

- `EvidenceArtifact` returns `null` for visual kinds (moved to gallery).
- For all other kinds: images render inline (existing behavior), text opens in
  new tab, others download.
- Bundle detail "Evidence" section still shows all references (visual + nonvisual)
  with their kind badges — the gallery is additive, not a replacement.

## 11. M4A acceptance (3/3)

The three M4A screenshots appear in the gallery when their bundle is loaded:

| Artifact | Dimensions | Kind | Thumbnail |
|----------|-----------|------|-----------|
| Matrix | 1280 × 720 | screenshot | 480 × 270 PNG ✓ |
| Narrow | 480 × 900 | visual-comparison | 256 × 480 PNG ✓ |
| Expanded | 1280 × 900 | screenshot | 480 × 337 PNG ✓ |

Provenance: "Playwright" displayed on each card. No filesystem paths used for
loading. All thumbnails resolve through `/api/evidence/artifacts/:digest/thumbnail`.

## 12. Tests (23/23)

Coverage in `apps/workspace/__tests__/evidence-visual-gallery.test.tsx`:

| Category | Tests |
|----------|-------|
| Visual evidence selection | screenshot recognized, visual-comparison recognized, nonvisual excluded |
| Secure thumbnail integration | thumbnail URL used, no producer/filesystem paths |
| Thumbnail-unavailable semantics | 415 → preview unavailable, no full-res fallback |
| Card metadata | dimensions, media type, producer, missing metadata |
| Responsive layout | grid classes verified |
| Selection | select, deselect, keyboard reachable, accessible labels, not color-only |
| Lazy loading | native `loading="lazy"` on images |
| Nonvisual regression | bundle detail unchanged |
| Verification verdict | no verdict inferred from screenshot |
| M4A acceptance | 3/3 visible, thumbnails, dimensions |

## 13. Remaining M4 prerequisites

M4 (VisualEvidenceViewer) will need:

- Full-screen/lightbox overlay triggered by selection.
- Zoom/pan controls for high-resolution inspection.
- Side-by-side comparison mode (visual diff computation — out of M3 scope).
- Keyboard navigation within the viewer (Escape to close, arrow keys to
  navigate).
- The gallery selection state (`selectedVisualRef`) and `onSelect` callback
  pattern are the M4 integration point.
