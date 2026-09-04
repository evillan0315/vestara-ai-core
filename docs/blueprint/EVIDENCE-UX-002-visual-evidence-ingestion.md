# EVIDENCE-UX-002 M1 — Visual Evidence Ingestion + Metadata

**Status:** IMPLEMENTED (M1 only — gallery, viewer, thumbnails, visual comparison
computation, and image-diff work are explicitly out of scope; M2–M4 not started)
**Date:** 2026-09-04
**Basis:** EVIDENCE-UX-001 audit (accepted). PCS-026 architecture preserved.
**Scope boundary:** no GA M5/M6/M7, no GA-CAP-002, no AR-009. No parallel
screenshot store. M4A source screenshots never moved or rewritten.

## 1. Authority

The implementation keeps the existing PCS-026 authority chain intact:

```text
Producer artifact
      ↓
generic evidence ingestion (new: packages/evidence/src/visual-ingest.ts)
      ↓
ContentAddressedEvidenceStore (reused, unchanged)
      ├── immutable content bytes (COPIED at ingest — see §5)
      └── digest identity (sha256 of bytes only)
      ↓
EvidenceReference (extended: optional descriptive `visual`)
      +
EvidenceProvenance (reused unchanged: producer / executionId / operation /
createdAt / environment / contentHash / relatedTo)
      +
metadata.visual (new descriptive block on the manifest artifact ref)
```

No `VisualEvidenceArtifact` domain entity was introduced. `kind: 'screenshot'`
and `kind: 'visual-comparison'` are reused exactly as specified by PCS-026;
content addressing, digest/hash semantics, bundle association, provenance, and
verification semantics are unchanged. `metadata.visual` is descriptive
presentation metadata — it is never artifact identity, never verification
authority, and never filesystem authority.

Audit of the concrete extension point (pre-mutation): `EvidenceReference`
(`packages/evidence/src/types.ts`) had no metadata channel;
`ContentAddressedArtifactRef.metadata?: Record<string, unknown>`
(`packages/engineering-event-store/src/index.ts`) was the existing free-form
extension point; `EvidenceItem` had no metadata passthrough; the pipeline
hard-coded manifest metadata to `{ operation, relatedTo, producer }`. The
smallest sufficient change was therefore: an optional `metadata` passthrough
on `EvidenceItem`, a pipeline merge that keeps pipeline fields authoritative,
an optional validated `visual` hint on `EvidenceReference`, and a shared
validator (`readVisualMetadata`) at the boundary.

## 2. Data flow

```text
source file (explicit path, caller-supplied)
    ↓  resolveVisualSource — workspace-root containment, one file, no recursion
inspect media (magic bytes + intrinsic dimensions — never extension)
    ↓  inspectVisualBytes — PNG IHDR / JPEG SOF / WebP VP8X-VP8-VP8L
content-addressed ingest (ContentAddressedEvidenceStore.put — bytes copied)
    ↓
EvidenceReference { kind: 'screenshot', ref: digest, visual, provenance }
    ↓  VisualFileCollector → EvidencePipeline.buildBundle (optional path)
bundle association (manifest refs carry metadata.visual; bundle refs carry visual)
```

Two ingestion entry points share one inspector:

- `ingestVisualFile()` — direct single-file ingest returning
  `{ ref, reference, inspection, sourcePath, repositoryRelativePath }`.
- `VisualFileCollector` (`kind: 'screenshot'`) — an `EvidenceCollector` over
  an explicit file allowlist, so screenshots join bundles through the ordinary
  pipeline with per-check attribution, replay steps, and derived confidence.
- `scripts/evidence-ingest-visual.ts` (`pnpm evidence:ingest-visual`) — thin
  generic CLI over `ingestVisualFile`. Explicit file list only (no `--recursive`,
  no directory scan, no crawler). It knows nothing about GA-UX-PREMIUM, M4A,
  AssistantCodeEdit, or /m4a-demo; those arrive as `--producer`, `--execution-id`,
  `--operation`, `--summary-prefix` caller context.

## 3. Metadata schema

```ts
// packages/evidence/src/types.ts (additive)
type SupportedVisualMediaType = 'image/png' | 'image/jpeg' | 'image/webp';
interface VisualArtifactMetadata {
  readonly width: number;    // intrinsic pixels, inspected from content
  readonly height: number;   // intrinsic pixels, inspected from content
  readonly mediaType: SupportedVisualMediaType; // magic bytes; mirrors artifact mediaType
}
```

Stored in two places, both descriptive:

- Manifest artifact ref: `metadata: { visual: { width, height, mediaType }, …pipeline fields }`.
- Bundle evidence reference: `reference.visual` (validated via
  `readVisualMetadata`; malformed visual blocks are dropped, never trusted).

No other fields were added: size/hash/createdAt/provenance already exist
authoritatively (`size`, digest, `provenance.contentHash`, `provenance.createdAt`);
`mediaType` inside `visual` is the one deliberate mirror the milestone
preferred, documented as a presentation hint while `ref.mediaType` stays
authoritative. Width/height come from inspected image content (or the trusted
pngjs decode in tests) — never from filename conventions (proven by the
`320.png`-with-7×9-content test).

## 4. Supported formats

Narrowly `image/png`, `image/jpeg`, `image/webp`. The repository has no
authoritative MIME detector (the only MIME map, in knowledge-parser, is
extension-based and was therefore NOT reused); detection is byte-level:

- PNG: 8-byte signature → first chunk must be 13-byte IHDR → u32BE dims.
- JPEG: SOI → marker scan (≤512 segments) → SOF0–SOF3/SOF5–SOF7/SOF9–SOF11/
  SOF13–SOF15 → u16BE dims. No SOF (or overrun) → `malformed-image`.
- WebP: RIFF…WEBP → VP8X (u24LE canvas−1), VP8 lossy (`9D 01 2A` + 14-bit dims),
  VP8L (`0x2F` + packed 14-bit dims). No decodable chunk → `malformed-image`.
- SVG (`<svg`, `<?xml`, `<!doctype`, `<html` heads) → `unsupported-media`
  with an explicit security-review message. Inline SVG stays disabled.
- Anything else → `unsupported-media`. Extensions are never consulted
  (PNG bytes named `.bin` ingest as `image/png`; SVG bytes named `.png` reject).

## 5. Integrity semantics

Reused `ContentAddressedEvidenceStore` unchanged — and explicitly proved the
persistence question: **`put`/`putFile` COPY byte content into
`<store>/sha256/<xx>/<digest>`**, so the store is authoritative after ingestion.
Proofs in `visual-ingest.test.ts`: stored bytes equal producer bytes exactly;
deleting the producer file leaves `has`/`read`/`verify` intact; identical bytes
ingested twice (different producers, operations, summaries) yield one digest;
`put` with unrelated metadata hashes identically — visual metadata cannot alter
identity. Manifest integrity holds through the new path
(`manifests.verify` + `verifyArtifacts` green on visual bundles).

## 6. Provenance

M1 uses existing provenance fields only: `producer: 'playwright'`,
`operation: 'contract-fixture visual acceptance'` (purpose as capture context),
plus `executionId`, `createdAt`, `environment`, `contentHash`. The chain
`screenshot captured ≠ visual assertion passed ≠ verification verdict` is
preserved structurally (references carry no status/verdict keys) and
semantically (a bundle holding screenshots but a failed check evaluates to
`FAILED`, never `VERIFIED`, under a required criterion — covered by test).

## 7. Security boundary

- One explicit file per call; containment `resolved === root ||
  resolved.startsWith(root + sep)` against the caller-supplied workspace root
  (the existing collector `workspaceRoot` authority).
- Reject: `traversal` (relative escape), `outside-workspace` (absolute escape),
  `external-path` (any `scheme:` URI — http/https/data/file), `missing-file`,
  `not-a-file`, `too-large` (>25 MiB, checked pre-read).
- No recursive scan, no crawler, no browser, no network. The CLI writes only to
  the operator-chosen `--store-dir` and never modifies sources.
- Collector failures are fail-closed: boundary/malformed violations throw
  `VisualIngestError`; the pipeline isolates the collector without aborting the
  bundle (existing semantics), and missing evidence surfaces via derived
  confidence limitations rather than invented verdicts.
- No artifact-endpoint changes in M1 (secure serving is M2 work); no external
  URLs are ever rendered or fetched.

## 8. M4A ingestion evidence (first generic caller — 3/3)

Source (unmoved, unrewritten):
`apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/` (the milestone's
`tests/visual/…` shorthand resolves to this canonical path).

CLI proof (`pnpm evidence:ingest-visual --workspace-root . --store-dir …`):

| File | Digest (sha256) | MIME | Dimensions | Bytes |
|---|---|---|---|---|
| m4a-fixture-matrix.png | `37e0adfd…35872b` | image/png | 1280 × 720 | 221506 |
| m4a-narrow-containment.png | `28bc2b6d…8810` | image/png | 480 × 900 | 195995 |
| m4a-expanded-width.png | `aec1ef0a…7097` | image/png | 1280 × 900 | 277995 |

(Digests abbreviated; full values in test output and store paths
`<store>/sha256/<xx>/<digest>`.) Each became an ordinary `screenshot`
`EvidenceReference` with content identity, MIME, inspected dimensions,
`producer: 'playwright'` + `operation: 'contract-fixture visual acceptance'`
provenance, and `metadata.visual`. All three also bind into a bundle through
the unmodified-generic `VisualFileCollector` path with manifest
`verify`/`verifyArtifacts` green. Negative CLI paths verified:
`../outside.png` → `traversal`; non-image file → `unsupported-media`.

## 9. Limitations

- JPEG/WebP **display** works; `VisualComparisonEngine` still decodes PNG only —
  diffing non-PNG captures needs decoder work (explicitly M-later, not M1).
- `VisualEvidenceCollector` (browser-capture path) does not yet stamp
  `metadata.visual`; its items flow through the same merge when it does.
- No bundle-listing gallery affordance, no thumbnails, no serving changes —
  image bytes are not yet exposed to React (by design; M2).
- 25 MiB single-file cap is a presentation/memory bound, documented in code.

## 10. M2 prerequisites (secure serving)

M1 hands M2: digest-identified immutable PNG/JPEG/WebP bytes with validated
`visual` hints on refs and manifests, plus the allowlist
(`SUPPORTED_VISUAL_MEDIA_TYPES`) and size cap to reuse server-side. M2 must:
serve by digest only (stored-type Content-Type, `nosniff`, no path authority),
add the thumbnail derivative endpoint, and keep SVG out of inline rendering.
Nothing in M1 makes the later Baseline/Current/Difference grouping impossible
(digests stable, metadata extensible).
