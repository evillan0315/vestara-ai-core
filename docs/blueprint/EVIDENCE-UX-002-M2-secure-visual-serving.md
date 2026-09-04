# EVIDENCE-UX-002 M2 — Secure Visual Artifact Delivery + Thumbnails

**Status:** IMPLEMENTED (M2 only — no gallery, viewer, comparison UI, diffing,
baseline management, or verification semantics; M3/M4 not started)
**Date:** 2026-09-04
**Basis:** M1 (`1c2829a`, frozen) + EVIDENCE-UX-001 audit. PCS-026 preserved.
**Scope boundary:** no Evidence M3/M4, no GA M5/M6/M7, no GA-CAP-002, no AR-009.

## 1. Endpoint audit (pre-mutation findings)

The existing route `GET /api/evidence/artifacts/:digest?mediaType=`
(`apps/api/src/routes/evidence.ts`) traced as follows:

| Concern | Before M2 |
|---|---|
| Request identity | sha256 digest path param, regex-validated — filesystem isolation already correct, no path accepted |
| Artifact lookup | direct `evidenceArtifacts.read()` — no evidence/bundle check (hash-oracle shape) |
| Evidence/bundle lookup | none |
| Authorization | none wired (`requireRole` existed app-wide but unused here; default identity is local-operator/admin) |
| Store access | full-buffer read + `res.end` |
| MIME handling | **client `?mediaType=` reflected into Content-Type** (spoofable) |
| Range/cache | no Range support; `Cache-Control: public, max-age=31536000, immutable` |
| Errors | 400 malformed digest, 404 missing bytes; no association/integrity/SVG/size semantics |
| Security headers | none (`X-Content-Type-Options`, CSP absent app-wide) |

Authority verdict: the route's identity model (digest → server-side resolution)
was correct, so M2 **extends the existing route** — no second content-serving
API was created. The `?mediaType=` parameter is now tolerated but never honored.

## 2. Authority path

```text
Browser (digest only — never a path)
  │ artifact/evidence identity
  ▼
Evidence API: requireRole(viewer) → association → media policy → bytes
  │ 404 unknown evidence reference (unreferenced digests indistinguishable
  │ from absent ones — the store is not a hash oracle)
  ▼
ContentAddressedEvidenceStore (immutable bytes, digest-verified per serve)
```

`resolveArtifactAssociation()` (`packages/evidence/src/visual-serve.ts`)
proves context before bytes: bundle `EvidenceReference`s first (verifier-facing
authority, carries executionId), manifest artifacts second. Linear scan over
bundle/manifest lists — correct for local-first scale; a digest index is
explicitly deferred (see §12). Because the API's auth model has no
below-viewer role in normal operation (see §4), the association check is the
effective anti-enumeration boundary today: possession of a bare digest serves
nothing unless evidence references it.

## 3. Endpoint contracts

`GET /api/evidence/artifacts/:digest` (hardened, same path):
`viewer` → 400 invalid digest → 404 unknown evidence reference → 500 invalid
stored media → 415 SVG → 404 bytes missing → 413 over 64 MiB → 500 integrity
failure → 200 bytes with stored Content-Type.

`GET /api/evidence/artifacts/:digest/thumbnail` (new, same authority):
same through association → 415 SVG → 415 non-PNG stored type (M2 decodes PNG
only) → 404 bytes missing → `ThumbnailService` → 200 `image/png`
(+ `X-Thumbnail-Cache: HIT|MISS`) with 415/413/422 mapped from
`VisualIngestError` (`unsupported-media`/`too-large`/`malformed-image`) and
500 only for unexpected failures. No query parameters exist — nothing to spoof,
no remote fetch surface. Multi-segment paths match no route (`handled: false`).

## 4. Authorization behavior: PARTIAL (by architecture, wired correctly)

Read endpoints now enforce `requireRole(..., 'viewer', ...)` (403 below).
In the current auth model (`apps/api/src/auth.ts`) the only sub-viewer
identity is a known user with an out-of-hierarchy role; anonymous/local callers
default to admin, so local-first UX is unchanged and existing route tests pass
unmodified. The 403 path is covered with a revoked-role token. Full
per-evidence ACLs do not exist anywhere in the API — the association gate
(§2) is the operative boundary, and immutable caching applies to bytes only,
never to authorization decisions (re-checked per request before any cache read).

## 5. MIME policy + response headers

Content-Type comes exclusively from validated stored metadata (bundle ref,
else manifest entry): must match `type/subtype` token shape (else 500), SVG
(`image/svg+xml`, `*+svg`, `image/svg`) is never inline (415 for both
endpoints). The inline image preview set is `image/png, image/jpeg, image/webp`;
non-image evidence (e.g. `text/plain` logs) keeps its existing replay behavior
with the stored type. Every byte response carries
`X-Content-Type-Options: nosniff` plus the existing immutable `Cache-Control`.
No global CSP exists in the API (audited — no `Content-Security-Policy`
headers anywhere); none is required for M2 since SVG/active content can never
be served inline from these endpoints. `Content-Disposition` is left default
(inline) for servable types; SVG never reaches disposition logic (415 first).

## 6. Thumbnail architecture + derivative identity + cache

`ThumbnailService` (`packages/evidence`, constructed in the API composition
root at `<workspace>/evidence/derivatives/` — beside, never inside, the
content-addressed store) implements lazy generation:

```text
first request → cache miss → validate → decode → scale → encode → atomic write → 200 MISS
later request → sidecar validated → bytes served → 200 HIT
```

Identity is `digest + spec` (`v1-480`: PNG, 480px long edge); files
`sha256/<2>/<digest>.thumb.<spec>.png` + validated JSON sidecar (digest, spec,
dims, byte count). Regeneration is deterministic — concurrent misses may both
generate, last-writer-wins with identical bytes. The original is never written
and its digest never mutated (proven: store `verify()` green after thumbnailing).
Single fixed spec, no client sizing (deterministic parameters by construction).

## 7. Dimensions + decoder/resource bounds

Spec: long edge 480, aspect ratio preserved (480×900 → 256×480 portrait;
1280×720 → 480×270; 1280×900 → 480×337), no upscale (≤480px edges served from
cached original pixels), no crop (area-average box filter). Bounds: input
≤32 MiB, header-parsed dimensions before decode, decoded pixels ≤16 MP
(decompression-bomb guard — a 10000×10000 header rejects pre-decode), M2
decodes PNG only (only decoder in the dependency closure; no new packages —
JPEG/WebP originals serve, their thumbnails 415 until a vetted decoder lands),
no SVG processing, no remote fetches, no arbitrary local paths (digest-keyed
cache only). Serving bound for originals is 64 MiB/413 — deliberately distinct
from the M1 25 MiB ingest cap, since the store legitimately holds larger
harness artifacts; rationale is event-loop protection on full-buffer serve.
No Range support (unchanged; full-image responses suit evidence sizes).

## 8. Failure semantics (deterministic, no placeholders)

400 invalid digest · 403 below viewer · 404 unknown evidence reference ·
404 artifact bytes missing · 413 over bound · 415 SVG / non-PNG thumbnail ·
422 malformed image · 500 invalid stored media / integrity failure / unexpected.
Integrity is rechecked per serve (`sha256(bytes) === digest`); mismatch serves
nothing (500). The UI layer decides presentation of unavailable artifacts —
the API never substitutes bytes.

## 9. M4A serving proof (isolated store, 3/3 + 3/3)

Bytes for `m4a-fixture-matrix.png` (1280×720), `m4a-narrow-containment.png`
(480×900), `m4a-expanded-width.png` (1280×900) were `put` into a fresh
temporary store with a hand-built referencing bundle; all subsequent requests
consult only that store (producer files never re-read — the strong test the
milestone requires):

- Originals: 3/3 → 200, `image/png` + `nosniff`, bodies byte-identical to the
  ingested sources (digests `37e0adfd…`, `28bc2b6d…`, `aec1ef0a…` as in M1).
- Thumbnails: 3/3 → 200 `image/png` at 480×270, 256×480, 480×337
  (portrait stays portrait), repeat requests `HIT` with byte-identical bodies.

## 10. Security tests + M3 prerequisites

Coverage (38 new: 13 service + 25 route; 121 green across evidence,
engineering-event-store, and pre-existing evidence routes): PNG/JPEG/WebP
originals, stored-type authority, spoofed-query ignored, nosniff everywhere,
SVG 415 (both endpoints), raw-path unroutable, traversal digest 400, unknown /
unreferenced / missing / corrupt / oversized mapped distinctly, revoked-role
403, byte identity, thumbnail aspect/no-upscale/cache-hit/determinism (fresh
service, same dir), malformed 422, query-ignoring (no fetch surface), M4A 6/6,
nonvisual routes byte- and header-compatible. M3 needs: nothing structural —
`<img src="…/artifacts/:digest/thumbnail">` and original-URL viewer wiring work
against these contracts today. Deferred (not M2 gaps): digest-indexed
association lookup at scale, JPEG/WebP decode for derivatives, Range support,
per-evidence ACLs if the API ever gains them.
