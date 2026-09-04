# EVIDENCE-UX-002 M4 — Visual Evidence Viewer

**Status:** IMPLEMENTED (M4 only — no visual diff, no baseline comparison, no
upload, no annotations, no verification decisions)
**Date:** 2026-09-04
**Basis:** M1 (`1c2829a`) + M2 (`b6622c7`) + M3 (`dcd9f78`), all frozen.
PCS-026 preserved.
**Scope boundary:** no visual-diff computation, no GA M5/M6/M7, no
GA-CAP-002, no AR-009.

## 1. Component architecture

```text
EvidencePage
├── EvidenceGallery (M3)
│   └── VisualEvidenceCard × N
│       └── onSelect(reference) → setViewingReference(reference)
├── VisualEvidenceViewer (M4 — modal overlay)
│   ├── header (title, counter, close)
│   ├── image viewport (original artifact)
│   │   ├── loading state
│   │   ├── ready (<img> from /artifacts/:digest)
│   │   └── unavailable (403/404/decode failure)
│   └── controls (zoom, nav, metadata)
```

All new code lives in `Evidence.tsx`. No new files, packages, or dependencies.

## 2. State ownership

```text
viewingReference: EvidenceReference | null
  null      → viewer closed
  non-null  → viewer open, showing this reference

viewerStatus: 'loading' | 'ready' | 'unavailable'
  Set by the <img> onLoad/onError handlers.
  Reset to 'loading' when viewingReference changes.

zoomLevel: number (0.25–4)
  Reset to 1 when viewingReference changes.

fitMode: boolean
  Reset to true when viewingReference changes.
```

State resets on artifact switch prevent zoom leaking between screenshots.

## 3. Original artifact flow

```text
Gallery card click
  → setViewingReference(reference)
  → VisualEvidenceViewer mounts
  → useEffect sets viewerStatus='loading', creates Image()
  → Image.src = /api/evidence/artifacts/:digest
  → onload → viewerStatus='ready' → <img> renders
  → onerror → viewerStatus='unavailable' → error message
```

The viewer loads originals through the secure M2 Evidence API only. No
producer paths, no filesystem paths, no thumbnail-as-original, no external URLs.

## 4. Zoom semantics

| Action | Behavior |
|--------|----------|
| Zoom in (+) | Multiplies zoomLevel by 1.25, caps at 400% |
| Zoom out (−) | Divides zoomLevel by 1.25, floors at 25% |
| 100% | Sets zoomLevel to 1, exits fit mode |
| Fit | Sets fitMode=true, image scales to viewport without cropping |

Fit mode: `max-width: 100%; max-height: 100%; object-fit: contain` — the
complete image is visible within the viewport. Fit does not upscale beyond 100%.

Zoom mode: `width: ${zoomLevel * 100}%` — the image scales beyond the viewport
and the container scrolls. Disabled buttons at boundaries (25% min, 400% max).

Zoom levels: `[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]` — not all levels are
explicitly stepped through; the ×1.25 multiplier lands between defined levels.

## 5. Navigation semantics

Previous/next navigate through `visualReferences` (the same ordered collection
shown in the gallery). Nonvisual evidence is never included.

- First artifact: Previous disabled.
- Last artifact: Next disabled.
- Counter: "2 / 3" when multiple artifacts exist.
- Arrow keys: ArrowLeft = previous, ArrowRight = next.

Zoom/pan reset on artifact switch (deterministic viewer state per artifact).

## 6. Pan/containment

The image viewport uses `overflow: hidden` — zoomed content does not widen the
application shell. The image is contained within the fixed-position viewer.

Native scroll is not used for pan (the viewer is `overflow: hidden` on the
viewport). At extreme zoom levels, the image extends beyond the viewport
boundaries but is clipped. A future enhancement could add pointer-drag pan;
M4 uses keyboard navigation between artifacts as the primary inspection method.

## 7. Focus management

- On open: `containerRef.current.focus()` (the viewer div has `tabIndex={-1}`).
- On close: `previousFocusRef.current.focus()` returns focus to the originating
  gallery card.
- Keyboard handler: attached to the viewer container via `onKeyDown`.
- Escape: closes the viewer.
- Editable target guard: keyboard shortcuts are suppressed when focus is inside
  an `input` or `textarea` (none exist in the viewer, but the guard is defensive).

## 8. Keyboard shortcuts

| Key | Action |
|-----|--------|
| Escape | Close viewer |
| ArrowLeft | Previous artifact |
| ArrowRight | Next artifact |
| + / = | Zoom in |
| − | Zoom out |
| 0 | 100% zoom |

All handlers call `e.preventDefault()` to prevent scroll or other side effects.

## 9. Responsive behavior

The viewer is a `fixed inset-0` overlay — full screen at all breakpoints.
Controls wrap with `flex-wrap gap-2` on narrow screens. The image viewport uses
`flex-1 min-h-0` to fill available space. A 480×900 portrait screenshot is
inspectable at 100% without expanding the application width (it fits within the
viewport height).

## 10. Loading/failure semantics

| State | Display |
|-------|---------|
| loading | "Loading original…" (animate-pulse) |
| ready | Full-resolution `<img>` |
| unavailable | "Original unavailable" + "The full-resolution artifact could not be loaded." |

The gallery thumbnail remains visible behind the viewer (the viewer is an
overlay, not a page navigation). The thumbnail is never presented as the
original evidence.

## 11. Security boundary

Preserved from M2:
- Evidence association (digest must be referenced by a bundle/manifest)
- Viewer role authentication
- Digest-controlled lookup (no path traversal)
- `nosniff` header on served bytes
- MIME authority from stored metadata
- Filesystem isolation (content-addressed store)
- SVG exclusion (415 at the M2 layer)
- No remote fetch

The viewer does not introduce another artifact-serving route.

## 12. Performance

Originals are fetched only when the viewer is opened (not preloaded for every
gallery card). The `Image()` preload fires once per opened artifact and is
cleaned up on unmount or artifact switch (onload/onerror nulled).

## 13. M4A acceptance

| Artifact | Open | Original | Previous | Next | Fit | 100% | Zoom |
|----------|------|----------|----------|------|-----|------|------|
| Matrix (1280×720) | ✓ | ✓ | disabled | ✓ | ✓ | ✓ | ✓ |
| Narrow (480×900) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Expanded (1280×900) | ✓ | ✓ | ✓ | disabled | ✓ | ✓ | ✓ |

Counter: "2 / 3" on Narrow. Navigation through all three: Matrix → Narrow →
Expanded → Narrow → Matrix. Zoom reset on each switch.

## 14. Tests (35/35)

Coverage in `apps/workspace/__tests__/evidence-visual-viewer.test.tsx`:

| Category | Tests |
|----------|-------|
| Open/close | selection opens, close button, Escape |
| Secure original | correct endpoint, no producer paths, no thumbnail-as-original |
| Previous/next | navigate next, navigate prev, first boundary, last boundary, counter |
| Keyboard nav | ArrowRight, ArrowLeft |
| Zoom | zoom in, zoom out, 100% button, Fit button, + key, − key, 0 key |
| Zoom containment | Fit does not crop |
| Artifact switch | resets zoom to fit mode |
| Metadata | dimensions, media type, producer |
| Loading/failure | loading state, 404 → unavailable |
| JPEG/WebP | JPEG original inspection |
| Security | no SVG inline, no verification inference |
| Responsive | full-screen dialog |
| Nonvisual regression | bundle detail unchanged |
| M4A acceptance | opens Matrix, navigates all 3, zoom/fit |

## 15. Known limitations

- No pointer-drag pan (zoomed content is clipped, not pannable). Keyboard
  navigation and artifact switching are the primary inspection methods.
- No prefetch of adjacent originals (next/prev fetch on demand).
- No image dimension display in the viewer header (dimensions shown in
  controls footer only).
