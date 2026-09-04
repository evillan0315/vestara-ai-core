# EVIDENCE-UX-001 — Visual Evidence Artifacts: Audit + Implementation Plan

**Status:** AUDIT (no implementation — stop boundary applies)
**Date:** 2026-09-04
**Baseline:** GA-UX-PREMIUM M4A accepted at `e7f80d6`
**Scope:** audit + architecture + implementation plan. The Evidence domain was
read and traced only; nothing under `packages/evidence/`,
`packages/engineering-event-store/`, `apps/api/src/routes/evidence.ts`, or
`apps/workspace/src/pages/Evidence.tsx` was mutated for this milestone.

**Motivating use case (not hardcoded target):**
`apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/` — three M4A
Playwright screenshots (`m4a-fixture-matrix.png` 1280×720,
`m4a-narrow-containment.png` 480×900, `m4a-expanded-width.png` 1280×900).
M4A is the first real consumer of a generic visual-evidence capability.

**Governing distinction (preserved throughout):**

```text
assertion
    ↓
evidence artifact
    ↓
verifier interpretation
    ↓
verdict
```

An image existing never implies verification passed. Screenshots are artifacts;
`visual-comparison` records and `VerifierService` verdicts are interpretations.

---

## 1. Existing architecture (traced end to end)

### 1.1 Domain / model authority: `packages/evidence` (PCS-026)

Canonical spec: `docs/PCS-026-engineering-evidence-pipeline.md` (status:
implemented through slice 2 + workspace viewer + baseline governance).

Contract file: `packages/evidence/src/types.ts`.

| Concept | Type | Notes |
|---|---|---|
| Central contract | `VerificationEvidenceBundle` | id, executionId, taskId?, verifierId, profileId, manifestId, evidence[], checks[], replay, confidence, supersedes?, derivedFrom?, createdAt |
| Evidence item | `EvidenceReference` | `ref` (sha256 digest), `kind: EvidenceKind`, `mediaType`, `size`, `summary`, `provenance`, `relatedTo?` |
| Evidence kinds | `EvidenceKind` | `command \| test \| build \| filesystem-change \| source-diff \| browser-navigation \| screenshot \| visual-comparison` — **visual kinds already exist** |
| Provenance | `EvidenceProvenance` | producer, executionId, operation?, createdAt, environment, contentHash, relatedTo? |
| Checks | `VerificationCheckResult` | checkId, name, status (`passed\|failed\|skipped\|blocked`), summary, evidenceRefs (digests), durationMs? |
| Replay | `EvidenceReplayDescriptor` | mode `artifact\|execution`; steps `open-log\|open-artifact\|run-command\|run-scenario`; requires{} |
| Confidence | `VerificationConfidence` | score 0..1, level, factors[6], limitations[] — **derived, never assigned** |
| Collection | `EvidenceCollector` / `EvidenceItem` | kind, mediaType, content (`string\|Uint8Array`), summary, operation?, relatedTo? |
| Baseline governance | `VisualBaseline` / `BaselineRecord` | artifactDigest, status `missing\|approved\|rejected`, approvedBy?, approvedAt?, candidateDigest? |

Key pipeline files:

- `packages/evidence/src/pipeline.ts` — `EvidencePipeline.buildBundle()`:
  collect → `artifacts.put()` per item → immutable manifest write → provenance
  stamping → per-check evidence attribution → artifact-only replay descriptor →
  `ConfidenceEngine.compute()` → optional `BundleStore.write()`. A failing
  collector never aborts the bundle (try/catch in `collect()`).
- `packages/evidence/src/collectors.ts` — slice-1 collectors (command,
  filesystem-change, source-diff, test, build). All emit `text/plain`.
- `packages/evidence/src/visual-collector.ts` — `VisualEvidenceCollector`
  (kind `screenshot`): captures PNG bytes via injected `ScreenshotSource`,
  emits a `screenshot` item (`image/png`) **plus** a `visual-comparison` item
  (`application/json` with scenarioKey, status `pass|fail|needs-review`,
  baselineDigest, candidateDigest, tolerance). No approved baseline →
  `baselines.recordCandidate()` + `needs-review`. **Never promotes.**
- `packages/evidence/src/visual.ts` — `VisualComparisonEngine`: pngjs pixel
  diff (per-channel threshold default 10, tolerance default 0.001),
  `compare()` → ratio/equal/withinTolerance; `diffMask()` → red-mask PNG.
  This is the existing authoritative comparison capability — future
  Baseline/Current/Difference UI reuses its outputs, no new diff math needed.
- `packages/evidence/src/baseline-store.ts` — `BaselineStore`
  (JSON file `baselines.json`): `recordCandidate` / `approve` / `reject` /
  `get` / `list`. Promotion is a governance action only.
- `packages/evidence/src/bundle-store.ts` — `BundleStore`: finalized bundles
  keyed by executionId, write-once (throws on overwrite), `read` / `list`
  (newest first).
- `packages/evidence/src/confidence.ts` — `ConfidenceEngine`: product of six
  dimensions (profile-coverage, check-success, evidence-integrity,
  evidence-independence, replayability, freshness) with rationale +
  limitations.
- `packages/evidence/src/verifier/` — `VerifierService.evaluate()` consumes a
  bundle + criteria → `VerifierVerdict`
  (`VERIFIED|UNVERIFIED|FAILED|INDETERMINATE`), contradictions, gaps,
  reasoning; `reverify()` links `previousVerdictId`; `applyOverride()` records
  Director PROCEED/REJECT separately without mutating the verdict;
  `redactForTransport()` strips secret patterns. Empty bundle (no evidence, no
  checks) → `INDETERMINATE`. This is where assertion→evidence→interpretation→
  verdict is enforced in code.

Related but **not** the Evidence-page authority (do not conflate):

- `packages/verification/src/types/evidence.ts` — lightweight `Evidence`
  (`type: EvidenceType` **already includes `'screenshot'`**, contentType, data,
  description, timestamp) + `EvidenceBundle`. Older/detached summary model;
  PCS-026 §1 explicitly supersedes detached summaries with the content-addressed
  protocol. No changes proposed here.
- `packages/trust/src/types/evidence.ts` — `TrustEvidence` /
  `VerificationOutcome` (sourceId/sourceType/capability/outcome). Trust
  projection, not artifact storage.
- `packages/verification-evidence/` — ADR-012 kernel (snapshot hashing,
  comparability, conclusions). Integrity philosophy reused; not the serving path.
- `packages/workflow-orchestrator/src/stores/artifact-store.ts` —
  `ArtifactStore` for versioned **JSON** agent-step artifacts
  (`orchestrated_artifacts`). JSON-only, no binary/media — **not** the visual
  artifact home. Visual artifacts belong in the content-addressed evidence
  store, not here.
- `apps/workspace/src/components/execution/artifacts.tsx` — execution
  ChangeSets/VerificationReports/Reviews panels. Separate surface; not the
  Evidence page.

### 1.2 Persistence authority

| Store | Class | Location | Identity | Mutability |
|---|---|---|---|---|
| Artifact bytes | `ContentAddressedEvidenceStore` | `packages/engineering-event-store/src/index.ts` (~L467) | sha256 digest → `<dir>/sha256/<2-char-prefix>/<digest>` | write-once (exists check + `wx` + rename); `put`, `putJson`, `putFile`, `read`, `has`, `verify` (size + rehash) |
| Manifests | `ImmutableEvidenceManifestStore` | same file (~L384) | `runId` (`^[a-zA-Z0-9._-]+$`) → `<dir>/<runId>.json` | immutable (throws if exists); `write`/`read`/`verify`/`verifyArtifacts`/`list` |
| Bundles | `BundleStore` | `packages/evidence/src/bundle-store.ts` | executionId (`^[a-zA-Z0-9._-]+$`) → `<dir>/<executionId>.json` | write-once (throws on overwrite) |
| Baselines | `BaselineStore` | `packages/evidence/src/baseline-store.ts` | scenarioKey → single `baselines.json` map | mutable only via approve/reject/recordCandidate governance actions |

Composition root: `apps/api/src/workspace-context.ts` (~L448–493):

```text
<workspace>/evidence/                  → ImmutableEvidenceManifestStore
<workspace>/evidence/artifacts/        → ContentAddressedEvidenceStore
<workspace>/evidence/bundles/          → BundleStore
<workspace>/evidence/baselines/        → BaselineStore (baselines.json)
```

Pipeline wiring: `FilesystemChangeCollector + SourceDiffCollector` always;
`VisualEvidenceCollector` per scenario only when `VESTARA_SCREENSHOT_URL` is
set (scenarios from `apps/api/src/evidence/visual-scenarios.ts`
`resolveVisualScenarios()`; capture via
`apps/api/src/evidence/playwright-screenshot-source.ts`
`PlaywrightScreenshotSource` — lazy Chromium, viewport, theme, networkidle +
300ms stability window, PNG out). Producer string `harness-verifier`,
environment `local:<fingerprint>`.

Schema authority: `packages/engineering-event-store/schemas/evidence-manifest.schema.json`
(`ContentAddressedArtifactRef`: algorithm=sha256, digest 64-hex, size ≥ 0,
mediaType, kind, summary, metadata?). Note `docs/schemas/evidence-manifest.schema.json`
is an older, looser draft — the engineering-event-store schema is canonical.

Manifest ↔ bundle linkage: bundle.manifestId = manifest.runId =
executionId; bundle.id = `bundle-<executionId>`; corrections link via
`supersedes`/`derivedFrom`, never mutate (§6).

### 1.3 Artifact representation today

`ContentAddressedArtifactRef`:

```ts
{ algorithm: 'sha256', digest, size, mediaType, kind, summary, metadata? }
```

- `kind` is a free string at the store layer; the pipeline constrains it to
  `EvidenceKind` (which already includes `screenshot`, `visual-comparison`).
- `metadata` today carries `{ operation, relatedTo, producer }`
  (pipeline.ts L99). No structured visual metadata yet — no width/height,
  viewport, theme, scenarioKey, capture source, or repo-relative path
  convention. `VisualEvidenceCollector` puts scenario linkage in
  `relatedTo: ["scenario:<key>"]` and the comparison JSON body, not in
  first-class fields.
- `EvidenceReference` mirrors the ref and adds `provenance` (producer,
  executionId, operation, createdAt, environment, contentHash=digest,
  relatedTo).
- `putFile(filePath, …)` helper already exists — file→store ingestion without
  moving/rewriting the source file.
- Evidence IDs: artifact = digest; manifest = runId; bundle =
  `bundle-<executionId>` / executionId; checks reference artifacts by digest
  (`evidenceRefs`); baselines keyed by `scenarioKey`
  (`<url>@<WxH|auto>@<theme>`, see `VisualEvidenceCollector.scenarioKey()`).
  Run/workflow/test associations: manifest `correlationId`, `threadId?`,
  `turnId?`; bundle `taskId?`; provenance `executionId`; pipeline input
  `workspaceRoot`, `changedFiles?`, `correctionOf?`.

**Conclusion for §1.3:** visual artifacts belong in the existing generic
artifact abstraction. `kind: 'screenshot'` + `mediaType: 'image/png'` +
content-addressed bytes + provenance already represent them correctly. The
target `VisualEvidenceArtifact` from the milestone brief maps 1:1 onto
`EvidenceReference` + `ContentAddressedArtifactRef.metadata` enrichment —
no parallel screenshot-specific evidence system.

### 1.4 API path

`apps/api/src/routes/evidence.ts` (`handleEvidenceRoute`), tested by
`apps/api/__tests__/evidence-routes.test.ts`:

| Method + route | Behavior |
|---|---|
| `GET /api/evidence/bundles?limit=` | list bundle summaries (slice 50) |
| `GET /api/evidence/bundles/:executionId` | bundle + its manifest; 404 if missing |
| `GET /api/evidence/artifacts/:digest?mediaType=` | digest regex `^[0-9a-f]{64}$` → `evidenceArtifacts.read()` → 200 with `Content-Type: <mediaType query>`, `Content-Length`, immutable `Cache-Control`; 400 malformed digest; 404 unknown |
| `GET /api/evidence/baselines` | list baseline records |
| `POST /api/evidence/baselines/:scenario/approve` | body `{ artifactDigest, approvedBy }` → `baselines.approve()` |
| `POST /api/evidence/baselines/:scenario/reject` | body `{ approvedBy }` → `baselines.reject()` |

Verifier routes (`apps/api/src/routes/verifier.ts`): `POST
/api/verifier/evaluate?executionId=`, `GET /api/verifier/verdicts/:executionId`,
`POST …/override`, `POST /api/verifier/reverify` — verdicts strip raw evidence
payloads before transport (`sanitizeVerdict`).

Canonical browser flow already matches the milestone's preferred flow:
**evidence artifact digest → Evidence API → authorized content endpoint →
browser**. No absolute filesystem paths are ever sent (`pathFor` stays
server-side; the browser only sees digests). Repository-relative paths appear
solely inside human-readable `summary`/`operation` strings today.

### 1.5 Evidence page path

`apps/workspace/src/pages/Evidence.tsx` (+
`apps/workspace/__tests__/evidence-baselines-ui.test.tsx`):

- Header (`Engineering Evidence`, PCS-026 subtitle, Refresh) → stat cards
  (Bundles / High / Very high / Evidence items).
- **Visual Baselines** section: governance copy, per-scenario card
  (scenarioKey, status badge, candidate `<img>` from
  `/api/evidence/artifacts/<digest>?mediaType=image/png`, reviewer + timestamp,
  Approve/Reject buttons → governance POSTs). Candidate resolution:
  `candidateDigest ?? (status !== approved ? artifactDigest : undefined)`.
- Bundle list: expandable rows (confidence badge, profile chip, checks count,
  evidence count) → detail (Checks with status badges; Evidence items with
  kind chip, summary, mediaType + size, producer/operation/short-digest;
  Confidence factor bars + limitations; Replay steps).
- Existing preview/download behavior (`EvidenceArtifact` component, L94–118):
  `image/*` → inline `<img max-h-48 loading=lazy>`; `text/*` or json →
  `window.open(url)` button; else → download `<a>`. **No gallery, no viewer,
  no zoom/pan/keyboard, no thumbnails, no intrinsic dimensions, no visual
  grouping** — screenshots render as one more item in the per-bundle evidence
  list. Baseline candidates render as single `max-h-32` images.

No thumbnail, lightbox, zoom, or gallery infrastructure exists anywhere in
`apps/workspace/src` (grep for thumbnail/viewer/lightbox/zoom: only unrelated
theme-preset CSS thumbnails, docs viewer, graph pan/zoom). The chat
`thumbnail?: string` field (`components/chat/types.ts`) is an unrelated
message-attachment hint.

---

## 2. Architecture diagram (required)

```text
Producer
  │
  ├── Playwright (VisualEvidenceCollector + PlaywrightScreenshotSource)
  ├── Contract-fixture Playwright spec (M4A: ga-ux-premium-m4a.spec.ts)
  ├── Workflow (any EvidenceCollector: command/test/build/fs/diff/browser)
  ├── Agent (ToolRuntime browser tools → evidence collection)
  └── User (future upload → registration endpoint)
  │
  ▼
Evidence Artifact Registration  (EvidencePipeline.buildBundle / artifacts.put/putFile)
  │  collect → normalize → content-address (sha256) → provenance stamp
  ▼
Authoritative Artifact Store  (ContentAddressedEvidenceStore + ImmutableEvidenceManifestStore + BundleStore + BaselineStore)
  │
  ├─────────────► metadata / provenance  (EvidenceReference, manifest entries, baseline records)
  │
  └─────────────► original bytes  (sha256/<xx>/<digest> — never mutated, never path-addressed)
  │
  ▼
Evidence API  (apps/api/src/routes/evidence.ts)
  │
  ├── metadata   (GET bundles, GET bundles/:id, GET baselines)
  ├── thumbnail  (PROPOSED — derived variant, §6)
  └── original   (GET artifacts/:digest — digest authority only)
  │
  ▼
Evidence Page  (apps/workspace/src/pages/Evidence.tsx)
  │
  ├── EvidenceGallery   (PROPOSED — visual artifact grid section)
  └── VisualEvidenceViewer  (PROPOSED — inspection overlay)
```

---

## 3. Proposed visual artifact contract (follows existing domain — not the illustrative sketch verbatim)

Do **not** introduce a new top-level `VisualEvidenceArtifact` interface. Extend
the existing `ContentAddressedArtifactRef.metadata` + `EvidenceReference`
provenance with an additive, optional, convention-versioned visual block.
Stores stay schemaless-friendly (`metadata?: Record<string, unknown>`);
the manifest JSON schema gains optional visual properties.

```ts
// Additive convention inside ContentAddressedArtifactRef.metadata —
// key 'visual', versioned so future comparison (baseline/current/difference)
// can extend without breaking existing refs.
interface VisualArtifactMetadata {
  readonly v: 1;
  /** Capture source class — never M4A-hardcoded; M4A uses 'playwright-contract-fixture'. */
  readonly source:
    | 'playwright'            // VisualEvidenceCollector via PlaywrightScreenshotSource
    | 'playwright-contract-fixture' // deterministic fixture spec (e.g. M4A)
    | 'browser-tool'          // ToolRuntime browser.screenshot
    | 'workflow'              // workflow/workflow-run artifact
    | 'agent'                 // agent-produced image
    | 'user-upload';          // future user upload
  readonly scenarioKey?: string;        // e.g. '/m4a-demo@1280x900@dark' or M4A viewport labels
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly theme?: string;
  /** PNG intrinsic dimensions (authoritative bytes, recorded at ingest). */
  readonly width?: number;
  readonly height?: number;
  /** Repository-relative path of the source file when ingested from disk (metadata only). */
  readonly repositoryRelativePath?: string;
  /** Free-form capture context, e.g. 'contract-fixture visual acceptance'. */
  readonly captureContext?: string;
  /** Future comparison support (§8): role + group linkage. Reserved, not populated in EVIDENCE-UX-001. */
  readonly visualRole?: 'baseline' | 'current' | 'difference';
  readonly comparisonGroup?: string;    // shared id linking baseline/current/difference refs
  readonly relatedBaselineDigest?: string;
}
```

Allowlisted media types for the visual path (server-enforced, §5):

```text
image/png, image/jpeg, image/webp
```

SVG is **excluded** until an explicit security review (active content — must
never be inline-rendered as `image/svg+xml`; if ever admitted, serve as
`Content-Disposition: attachment` or sanitized raster only).

Mapping of the brief's illustrative `VisualEvidenceArtifact` onto the real
domain (nothing new invented):

| Illustrative field | Canonical home (existing) |
|---|---|
| id | `EvidenceReference.ref` (digest) — content identity |
| kind | `kind: 'screenshot'` (existing `EvidenceKind`) |
| mediaType | `mediaType` (allowlisted) |
| fileName | `summary` (human label) + `metadata.visual.repositoryRelativePath` basename |
| repositoryRelativePath | `metadata.visual.repositoryRelativePath` (metadata only, never authority) |
| width / height | `metadata.visual.width/height` (new, recorded at ingest via PNG decode) |
| byteSize | `size` (existing, from `put`) |
| hash | digest + `provenance.contentHash` (existing sha256) |
| createdAt | `provenance.createdAt` (existing) |
| provenance | `EvidenceProvenance` (existing) |
| source | `metadata.visual.source` (new enum above) |

---

## 4. M4A screenshot integration path (generic — no M4A hardcoding)

Source facts: spec `apps/workspace/tests/visual/ga-ux-premium-m4a.spec.ts`
writes three PNGs to `apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/`
(1280×720 matrix, 480×900 narrow, 1280×1280→900 expanded). The fixtures render
`/m4a-demo` (`apps/workspace/src/pages/M4aDemo.tsx`), an `enabled: false`
route labeled CONTRACT-FIXTURE VISUAL ACCEPTANCE — deterministic fixture
evidence, explicitly **not** live runtime evidence and never a CI baseline gate
(per `GA-UX-PREMIUM-M4A-code-edit-presentation.md` §8).

Generic registration flow (works for any Playwright `.artifacts/<suite>/…`
output, M4A is just the first caller):

```text
Playwright spec PNGs on disk
   ↓  (no move, no rewrite — read-only ingest)
ingest script / CLI (PROPOSED: pnpm evidence:ingest-screenshots --dir <artifacts-dir>
   --source playwright-contract-fixture --scenario-prefix <suite> --execution-id <id>)
   ↓  artifacts.putFile(png, { mediaType: 'image/png', kind: 'screenshot',
        summary, metadata: { visual: {...} } }) per file
   ↓  optional: recordCandidate(scenarioKey, digest) for baseline-tracked scenarios,
   ↓  optional: EvidencePipeline.buildBundle(...) to bind the images to checks
evidence / artifact store (content-addressed, immutable)
   ↓
Evidence API (existing artifact endpoint + proposed thumbnail variant)
   ↓
Evidence page gallery (filter kind === 'screenshot', image/* mediaType)
   ↓
visual inspector (viewer overlay)
```

Rules:

- **Do not move or rewrite** M4A artifacts during audit or ingest — `putFile`
  reads bytes; the source files stay where the spec wrote them.
- Provenance must say what the images are:
  `source: 'playwright-contract-fixture'`,
  `captureContext: 'contract-fixture visual acceptance — not live runtime evidence'`,
  `repositoryRelativePath:
  'apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/<file>'`
  (metadata label only), executionId = the ingest run id (never a fabricated
  verification execution id), environment = local fingerprint.
- Never imply verification: ingested M4A images MUST NOT be attached to
  `passed` checks or a high-confidence bundle unless a real verifier ran. The
  default ingest creates artifacts (+ optional `needs-review` comparison
  records), not verdicts. If bound into a bundle, checks referencing them use
  status `skipped`/`blocked` or a dedicated informational check — never
  `passed` on the strength of an image existing.
- No M4A-specific branches in the Evidence page: the gallery filters on
  `kind === 'screenshot'` / `mediaType.startsWith('image/')` and renders
  `summary` + `metadata.visual.*` generically.

---

## 5. Security audit

| Vector | Current state | Required |
|---|---|---|
| Path traversal / arbitrary filesystem reads | **Contained.** Browser sends digests only; `pathFor()` validates `^[0-9a-f]{64}$` and builds `<dir>/sha256/<2>/<digest>` server-side. `BundleStore`/`ImmutableEvidenceManifestStore` validate executionId/runId (`^[a-zA-Z0-9._-]+$`). No filesystem path ever accepted from the client. | Keep. Thumbnail endpoint resolves the same way (digest → derived file), never a path parameter. |
| MIME spoofing | **Gap.** `GET /artifacts/:digest` reflects the client `?mediaType=` query into `Content-Type` unchecked. A stored `text/plain` artifact can be served as `image/png` and vice versa; stored bytes are never sniffed. | Server allowlist: resolve Content-Type from the **stored** ref mediaType; allowlist `image/png, image/jpeg, image/webp, application/json, text/plain, application/octet-stream`; ignore/validate the query param (keep it only as a legacy fallback validated against the stored type). Serve images with `X-Content-Type-Options: nosniff`. |
| Oversized images | **Gap.** No size cap on serve or render; full-resolution bytes go to every `<img>`. | Enforce a serve cap (e.g. 25 MB → 413 with JSON error) + document max ingest size; gallery uses thumbnail variant; viewer loads original lazily on demand. |
| Malformed images | **Partial.** `VisualComparisonEngine` (pngjs `PNG.sync.read`) throws on malformed input — `VisualEvidenceCollector.collect` has no decode guard (a corrupt capture fails collection of that scenario; pipeline try/catch degrades to missing evidence, which lowers confidence — acceptable but noisy). No ingest-time validation. | Validate at ingest (decode dimensions via pngjs; reject non-image bytes for image kinds); wrap compare/diffMask call sites; surface `needs-review` with reason instead of throwing. |
| SVG / script execution | **Not yet exposed, must stay that way.** Only `image/png` is ever emitted by producers today; the store accepts any mediaType string. | Allowlist excludes SVG for inline rendering. If SVG is ever ingested: never serve inline — `Content-Disposition: attachment` + `Content-Security-Policy: sandbox`, or rasterize server-side after review. Explicit security review required first. |
| Unauthorized evidence access | **Local-first posture (consistent with the rest of the API).** Evidence routes have no auth — same as bundles/baselines/verifier routes; the threat model is local workspace access. | No new auth in EVIDENCE-UX-001; note as assumption. If the API is ever exposed remotely, evidence endpoints join whatever auth the gateway adopts. |
| External URL loading | **Contained.** Evidence page only fetches same-origin `/api/evidence/artifacts/*`. Screenshot capture targets are server-side (`VESTARA_SCREENSHOT_URL` + matrix). | Gallery/viewer must never render `metadata` URLs as image sources; only digest-backed endpoints. Add a lint/test guard if upload (user-supplied URLs) is added later. |
| Artifact ID enumeration | **Low risk, note.** Digests are 128-bit unguessable; but `GET /bundles` lists executionIds and `GET /baselines` lists digests to anyone with API access. Approve endpoint accepts any 64-hex `artifactDigest` without checking the artifact exists. | `approve` should verify `artifacts.has(digest)` before promoting (small additive hardening, prevents dangling baseline pointers). Bundle listing pagination already bounds exposure (limit 50). |
| Metadata-as-filesystem-browser | **Contained by design, keep it.** `repositoryRelativePath` is a label; resolution (if ever needed, e.g. re-ingest) happens server-side against `workspaceRoot` with `path.resolve` containment checks. | Never add an endpoint that reads a client-supplied relative path. Document this invariant in the ingest script. |

---

## 6. Performance plan

Current cost: every image on the Evidence page is a full-resolution download
(`<img src="…/artifacts/<digest>">`, `max-h-48` CSS scaling, `loading="lazy"`
only). Three M4A images (~700 KB total) are fine; dozens of full-resolution
captures are not.

- **Thumbnails (new, server-side):** `GET /api/evidence/artifacts/:digest/thumb?width=480`
  (or `?variant=thumb`) — digest-resolved, allowlisted image mediaTypes only,
  bounded width (e.g. 320/480/640 steps, default 480), preserves aspect ratio,
  PNG-or-JPEG out, long immutable cache. Implementation: decode with pngjs
  (already a dependency of `@vestara/evidence`) or a zero-native-dep scaler;
  cache derived bytes alongside the store (`<dir>/sha256/<2>/<digest>.thumb-<w>`)
  — presentation derivative, never the authoritative artifact. Gallery uses
  thumbnails; viewer loads the original on open only.
- **Lazy loading + intrinsic dimensions:** gallery `<img loading="lazy"
  decoding="async" width={visual.width} height={visual.height}>` (dimensions
  recorded at ingest) so layout is stable before bytes arrive; aspect-ratio-aware
  CSS (`aspect-ratio: attr()` / style from metadata, `object-fit: cover` on
  fixed-height thumbs — never stretched).
- **Bounded preview:** CSS `max-h` containment stays; viewer constrains to
  viewport (`max-width: 100vw`, `max-height: 70vh` stage) with transform-based
  zoom (no re-download per zoom level).
- **Pagination/virtualization:** reuse existing bounds — bundles list already
  `slice(0, limit)` server-side; gallery renders per expanded bundle / per
  baseline section (bounded sets), so no new virtualization infra in
  EVIDENCE-UX-001. If a bundle ever carries > 50 images, cap initial render
  with "show more" (client-side, no API change).
- **Originals preserved:** thumbnail cache is keyed off the digest and
  regenerable; `verify()` always runs against original bytes.

---

## 7. Evidence integrity (reuse — no competing scheme)

Reuse in full: sha256 content addressing on every artifact
(`ContentAddressedEvidenceStore.verify` = size + rehash), immutable manifest
checksum (`ImmutableEvidenceManifestStore.verify`), `verifyArtifacts(runId)`
(missing/corrupted/invalid-reference), ADR-012 append-only + comparability
gates, `supersedes`/`derivedFrom` correction linkage, six-dimension derived
confidence (evidence-integrity + evidence-independence factors already reward
distinct content-addressed backing). The `metadata.visual` block adds
`width/height` as **descriptive** fields only — integrity stays digest-based.
No new hashing, no sidecar checksums, no competing snapshot scheme.

---

## 8. Gaps (what is missing today)

1. No structured visual metadata (width/height/viewport/theme/source/scenario)
   — only `summary`/`operation` strings + `relatedTo: ["scenario:<key>"]`.
2. `Content-Type` served from client query param, not stored mediaType (MIME
   spoofing gap, §5).
3. No thumbnail/derived-variant endpoint; gallery would download full bytes.
4. No gallery or viewer UI (inline `max-h-48` images in a flat evidence list).
5. No ingest path for out-of-band captures (M4A `.artifacts/` PNGs) — `putFile`
   exists but no CLI/script, no metadata convention, no scenario-key derivation.
6. `BaselineStore.approve` does not verify the digest exists in the store
   (dangling baseline pointers possible).
7. `VisualComparisonEngine` has no malformed-input guard at the collector
   boundary; only PNG is supported (JPEG/WebP captures would crash compare —
   decoders needed if those media types are admitted beyond display).
8. `diffMask` output is computed but has no serving path (needed later for
   Baseline/Current/Difference §9; not built now).
9. Manifest JSON schema needs optional `visual` metadata properties (additive).
10. No `visualRole`/`comparisonGroup` linkage for future triple-view (reserved
    in contract, not populated).

---

## 9. Proposed contract changes (additive only)

1. `ContentAddressedArtifactRef.metadata.visual: VisualArtifactMetadata`
   convention (v1, §3) — no store code change (metadata is already free-form).
2. `VisualEvidenceCollector`: stamp `metadata.visual` (source `playwright`,
   scenarioKey, viewport, theme, width/height via PNG decode at collect time).
3. Manifest schema (`packages/engineering-event-store/schemas/evidence-manifest.schema.json`):
   additive `metadata.properties.visual` object (all-optional).
4. API: `GET /api/evidence/artifacts/:digest/thumb?width=` (digest-resolved,
   allowlisted, cached derivative); harden `GET …/artifacts/:digest`
   (stored-type Content-Type, nosniff, size cap); `approve` verifies
   `artifacts.has(digest)`.
5. No changes to `EvidenceKind` (already covers `screenshot` /
   `visual-comparison`), `EvidenceProvenance`, bundle shape, confidence
   dimensions, verifier statuses, `ArtifactStore` (JSON-only, out of scope),
   `verification`/`trust` evidence types, or generated OpenCode contracts.

---

## 10. Proposed UI component tree (Evidence page, premium design language)

New code lives in `apps/workspace/src/pages/evidence/` (extracted from
`Evidence.tsx`) + `apps/workspace/src/components/evidence/`; existing
`Evidence.tsx` sections (stats, baselines governance, bundles, checks,
confidence, replay) are unchanged except to host the gallery.

```text
EvidencePage (apps/workspace/src/pages/Evidence.tsx)
├── Header + StatCards (existing)
├── Visual Baselines (existing governance section — unchanged)
├── EvidenceGallery (NEW — per expanded bundle AND/OR page-level "Visual Evidence" section)
│   ├── GalleryCard × N   (aspect-ratio-aware thumb, title=summary, badges: kind/mediaType/dimensions/source)
│   │   └── <img thumbnail loading=lazy decoding=async width height>  (thumb endpoint)
│   └── provenance line (producer · operation · short digest · capture context)
├── VisualEvidenceViewer (NEW — modal overlay, focus-trapped, portal)
│   ├── header (← → title "M4A · Narrow viewport" + counter "1 / 3")
│   ├── stage (original bytes, transform zoom/pan, fit + 100% modes)
│   ├── footer (mediaType · W × H · source · repo-relative path · capture context)
│   └── keyboard: Esc close · ←/→ prev/next · +/−/0 zoom/fit/100%
└── BundleDetail (existing checks/evidence/confidence/replay)
    └── EvidenceArtifact (existing — image items link "open in viewer" → viewer at index)
```

Viewer behavior contract: opens from any gallery card or inline image;
prev/next cycles the filtered visual list; zoom in/out (buttons + `+`/`-`),
fit-to-viewport (`0`/double-click), 100% toggle, drag-pan when zoomed
(transform `translate+scale`, no re-fetch); `Escape` closes and **returns focus
to the invoking element**; background scroll locked while open, restored on
close; the underlying page stays interactive after close (no leaked listeners —
cleanup on unmount, regression-tested). Styling: existing `--vestara-*` tokens,
`rounded-xl border bg-(--vestara-accent-bg)/40` cards, badge grammar from
`CHECK_BADGE`/`BASELINE_BADGE` — consistent with the current premium language.

Provenance UX (never imply proof): every card + viewer footer shows source
(`Playwright`, `Playwright contract-fixture`, …), capture context, and —
where a `visual-comparison` record exists — the comparison status
(`pass/fail/needs-review`) and any linked verdict state. Standalone images
with no comparison/verdict show neutral copy ("captured during …", never
"verified").

---

## 11. Implementation milestones (bounded, in order)

- **M1 — Contract + ingest (no UI):** `metadata.visual` convention doc +
  collector stamping (width/height via PNG decode) + schema additive update +
  `pnpm evidence:ingest-screenshots` script (generic dir→store, M4A as first
  caller, read-only source) + tests (ingest round-trip, metadata preserved,
  verify() green).
- **M2 — API hardening + thumbnails:** stored-type Content-Type + nosniff +
  size cap + `approve` existence check + `thumb` endpoint with disk cache +
  route tests (spoof rejection, traversal rejection, thumb dimensions,
  cache-hit).
- **M3 — Gallery:** `EvidenceGallery` section (filter + thumbs + provenance
  lines, aspect-ratio cards) + page wiring (no M4A branches) + UI tests
  (thumb URL used, lazy attrs, intrinsic dims, generic rendering of M4A set).
- **M4 — Viewer:** `VisualEvidenceViewer` (nav/zoom/pan/keyboard/focus-restore/
  scroll-lock) + a11y (dialog role, aria-labels, focus trap) + UI tests
  (open/close/prev/next/zoom/Esc/focus-restore/no leaked listeners).
- **M5 — M4A registration + docs:** run ingest for the three M4A PNGs into a
  dev evidence workspace, screenshot the gallery + viewer, record alongside the
  existing M4A evidence; update PCS-026 delivery record + this audit's follow-up
  note. No M4A source changes.

Each milestone is independently shippable; M1+M2 are API/store-only and carry
no UI risk. Image-diff **computation** is explicitly out of scope (the engine
already exists); M-population of `visualRole`/`comparisonGroup` is reserved.

---

## 12. Test strategy

- **Store/collector (vitest, `packages/evidence/__tests__/`):** visual metadata
  stamping; ingest round-trip (`putFile` → `read` → `verify`); malformed-PNG
  → `needs-review` (not throw); `approve` rejects unknown digests; manifest
  schema accepts/rejects `visual` block; comparison engine unchanged
  (existing `visual.test.ts` + `verifier.test.ts` stay green).
- **API (`apps/api/__tests__/evidence-routes.test.ts` + new thumb tests):**
  bundles/manifest/artifact/baseline paths (existing 7 cases stay green);
  spoofed `?mediaType=` ignored; malformed digest → 400; traversal-shaped
  digest → 400; oversized artifact → 413; thumb dimensions + aspect ratio +
  cache headers; `approve` with missing digest → 4xx.
- **UI (`apps/workspace/__tests__/evidence-*-ui.test.tsx`):** gallery renders
  generic screenshot refs (thumb URLs, lazy, intrinsic dims, provenance text,
  no M4A-specific strings); baseline section unchanged (existing 4 cases stay
  green); viewer open/navigate/zoom/Esc/focus-restore/scroll-restore; no fetch
  to non-evidence URLs (mirror the M4A "no repository reread" guard style).
- **Visual acceptance (Playwright, evidence-only like M4A):** ingest the M4A
  set, capture gallery + viewer states as `.artifacts/evidence-ux-001/` —
  never a CI gate.
- **Gates:** `pnpm lint:check && pnpm build && pnpm test` green;
  `pnpm check:source-artifacts` clean; no new deep imports / undeclared deps
  (`pnpm dependencies:check`).

---

## 13. Future visual comparison (design only — not implemented)

The `metadata.visual` block reserves `visualRole` (`baseline|current|difference`)
+ `comparisonGroup` (shared id) + `relatedBaselineDigest`. A later milestone can
serve triple-view by resolving one group into three digest-backed URLs —
reusing `VisualComparisonEngine.compare()` + `diffMask()` outputs persisted as
ordinary `visual-comparison` / `screenshot` artifacts. Nothing in M1–M5 makes
this impossible: digests are stable, metadata is extensible, the thumb endpoint
generalizes to diff masks. No diff computation, no triple UI, no mask endpoint
in EVIDENCE-UX-001.

---

## 14. Stop-boundary verdict

```text
EVIDENCE-UX-001 AUDIT

Existing artifact authority: ContentAddressedEvidenceStore (packages/engineering-event-store/src/index.ts) + EvidencePipeline/BundleStore/BaselineStore (packages/evidence)
Existing evidence authority: packages/evidence — VerificationEvidenceBundle / EvidenceReference (kind 'screenshot' + 'visual-comparison') / EvidenceProvenance / VerifierService verdicts (PCS-026, ADR-012)
Visual artifact model reusable: YES
Artifact content serving exists: PARTIAL
Thumbnail infrastructure exists: NO
Evidence integrity reusable: YES
M4A screenshots ingestible: YES
Security boundary adequate: PARTIAL

Recommended implementation:
Additive-only extension of the existing PCS-026 model — (M1) stamp
metadata.visual {v, source, scenarioKey, viewport, theme, width, height,
repositoryRelativePath, captureContext} at collect/ingest time with a generic
read-only ingest script (M4A as first caller, never hardcoded); (M2) harden the
artifact endpoint (stored-type Content-Type, nosniff, size cap, approve
existence check) and add a cached digest-resolved thumbnail variant; (M3)
EvidenceGallery (aspect-ratio thumbs + provenance lines, kind/mediaType
filtered); (M4) VisualEvidenceViewer (prev/next, zoom/fit/100%/pan, Esc/arrows,
focus-restore, scroll-lock). No new evidence system, no parallel screenshot
store, no JSON-artifact-store reuse, no SVG inline rendering, no image-diff
computation, no M4A source moves. Reserve visualRole/comparisonGroup for the
later Baseline/Current/Difference milestone.

IMPLEMENTATION READY: YES
```

Audit complete. No Evidence domain, store, API, or page code was modified —
this document is the sole deliverable. Awaiting authorization before M1.
