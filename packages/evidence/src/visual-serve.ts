/**
 * EVIDENCE-UX-002 M2 — secure visual artifact delivery substrate.
 *
 * Browser
 *   │ artifact/evidence identity (digest — never a filesystem path)
 *   ▼
 * Evidence API (association → auth → resolution → media policy → bytes)
 *   ▼
 * ContentAddressedEvidenceStore (immutable bytes)
 *
 * This module holds the non-HTTP policy pieces:
 * - resolveArtifactAssociation: prove a digest is referenced by a bundle
 *   EvidenceReference or a manifest artifact before it may be served, so the
 *   store is never a public hash oracle.
 * - ThumbnailService: bounded, aspect-preserving, deterministically cached
 *   PNG presentation derivatives. A thumbnail is not evidence authority —
 *   the original digest remains the evidence identity and is never mutated.
 *
 * Decoding in M2 is PNG-only (pngjs, already a dependency). JPEG/WebP
 * originals are servable; their thumbnails deterministically report
 * unsupported until a vetted decoder lands (documented M2 limitation).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { PNG } from 'pngjs';
import type { BundleStore } from './bundle-store';
import { inspectVisualBytes, VisualIngestError } from './visual-ingest';

// ─── Association ──────────────────────────────────────────────────

export interface ArtifactAssociation {
  /** Stored media type authority (bundle ref first, manifest entry second). */
  readonly mediaType: string;
  readonly kind: string;
  readonly size: number;
  readonly executionId?: string;
  readonly source: 'bundle' | 'manifest';
}

/**
 * Prove a digest is referenced in authorized evidence context. Bundles win
 * over manifests (they carry the verifier-facing reference). Returns
 * undefined when nothing references the digest — callers serve 404 without
 * distinguishing "unreferenced" from "missing bytes" to oracle callers.
 */
export function resolveArtifactAssociation(
  bundles: Pick<BundleStore, 'list'>,
  manifests: Pick<ImmutableEvidenceManifestStore, 'list'>,
  digest: string,
): ArtifactAssociation | undefined {
  const normalized = digest.toLowerCase();
  for (const bundle of bundles.list()) {
    const ref = bundle.evidence.find((entry) => entry.ref.toLowerCase() === normalized);
    if (ref) {
      return {
        mediaType: ref.mediaType,
        kind: ref.kind,
        size: ref.size,
        executionId: bundle.executionId,
        source: 'bundle',
      };
    }
  }
  for (const manifest of manifests.list()) {
    const entry = manifest.artifacts.find((artifact) => artifact.digest.toLowerCase() === normalized);
    if (entry) {
      return { mediaType: entry.mediaType, kind: entry.kind, size: entry.size, source: 'manifest' };
    }
  }
  return undefined;
}

// ─── Stored media policy ──────────────────────────────────────────

/** Inline image preview allowlist (M2). SVG is excluded — never inline. */
export const INLINE_IMAGE_MEDIA_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

export function isInlineImageMediaType(mediaType: string): boolean {
  return (INLINE_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType.toLowerCase());
}

export function isSvgMediaType(mediaType: string): boolean {
  const normalized = mediaType.toLowerCase().split(';')[0]?.trim() ?? '';
  return normalized === 'image/svg+xml' || normalized.endsWith('+svg') || normalized === 'image/svg';
}

/** Stored media types must be plausible `type/subtype` tokens — never a query echo. */
export function isPlausibleStoredMediaType(mediaType: string): boolean {
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mediaType) && mediaType.length <= 128;
}

// ─── Thumbnails ───────────────────────────────────────────────────

export interface ThumbnailSpec {
  readonly version: 1;
  /** Long-edge bound in pixels. Aspect ratio is always preserved; never upscale, never crop. */
  readonly maxEdge: number;
  readonly format: 'image/png';
}

/** Single fixed M2 gallery spec — deterministic, no client parameters. */
export const DEFAULT_THUMBNAIL_SPEC: ThumbnailSpec = { version: 1, maxEdge: 480, format: 'image/png' };

export function thumbnailSpecId(spec: ThumbnailSpec): string {
  return `v${spec.version}-${spec.maxEdge}`;
}

/** Decode-side resource bounds (decompression-bomb protection). */
export const MAX_THUMBNAIL_INPUT_BYTES = 32 * 1024 * 1024;
export const MAX_THUMBNAIL_DECODE_PIXELS = 16 * 1024 * 1024;

export interface ThumbnailResult {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mediaType: 'image/png';
  readonly cached: boolean;
}

interface ThumbnailSidecar {
  readonly digest: string;
  readonly spec: string;
  readonly width: number;
  readonly height: number;
  readonly mediaType: 'image/png';
  readonly bytes: number;
}

function downscaleBoxAverage(
  src: Buffer,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Buffer {
  const dst = Buffer.alloc(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;
  for (let y = 0; y < dstHeight; y += 1) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(srcHeight, Math.floor((y + 1) * yRatio)));
    for (let x = 0; x < dstWidth; x += 1) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(srcWidth, Math.floor((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const at = (sy * srcWidth + sx) * 4;
          r += src[at] as number;
          g += src[at + 1] as number;
          b += src[at + 2] as number;
          a += src[at + 3] as number;
          count += 1;
        }
      }
      const out = (y * dstWidth + x) * 4;
      dst[out] = Math.round(r / count);
      dst[out + 1] = Math.round(g / count);
      dst[out + 2] = Math.round(b / count);
      dst[out + 3] = Math.round(a / count);
    }
  }
  return dst;
}

/**
 * Bounded PNG presentation derivatives with deterministic disk caching.
 * Cache identity is `digest + spec`; the authoritative original is never
 * written, and the digest is never mutated by derivative generation.
 */
export class ThumbnailService {
  constructor(private readonly directory: string) {}

  thumbnailFor(digest: string, original: Uint8Array, spec: ThumbnailSpec = DEFAULT_THUMBNAIL_SPEC): ThumbnailResult {
    const normalized = digest.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) throw new VisualIngestError('malformed-image', 'invalid artifact digest');
    if (original.byteLength > MAX_THUMBNAIL_INPUT_BYTES) {
      throw new VisualIngestError('too-large', 'image exceeds thumbnail input bound');
    }
    const specId = thumbnailSpecId(spec);
    const hit = this.readCache(normalized, specId);
    if (hit) return { ...hit, cached: true };

    // M2 decodes PNG only; dimensions are header-parsed BEFORE full decode so
    // oversized pixel counts reject without allocating the bitmap.
    const inspection = inspectVisualBytes(original);
    if (inspection.mediaType !== 'image/png') {
      throw new VisualIngestError(
        'unsupported-media',
        `thumbnails support image/png in M2 (requested ${inspection.mediaType})`,
      );
    }
    if (inspection.width * inspection.height > MAX_THUMBNAIL_DECODE_PIXELS) {
      throw new VisualIngestError('too-large', 'image exceeds thumbnail pixel bound');
    }
    let decoded: PNG;
    try {
      decoded = PNG.sync.read(Buffer.from(original));
    } catch {
      throw new VisualIngestError('malformed-image', 'image bytes do not decode');
    }

    const scale = Math.min(1, spec.maxEdge / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.floor(decoded.width * scale));
    const height = Math.max(1, Math.floor(decoded.height * scale));
    const pixels =
      scale === 1
        ? Buffer.from(decoded.data)
        : downscaleBoxAverage(decoded.data, decoded.width, decoded.height, width, height);
    const png = new PNG({ width, height });
    pixels.copy(png.data);
    const bytes = new Uint8Array(PNG.sync.write(png));
    const result: ThumbnailResult = { bytes, width, height, mediaType: 'image/png', cached: false };
    this.writeCache(normalized, specId, result);
    return result;
  }

  private cachePaths(digest: string, specId: string): { image: string; sidecar: string } {
    const base = path.join(this.directory, 'sha256', digest.slice(0, 2), `${digest}.thumb.${specId}`);
    return { image: `${base}.png`, sidecar: `${base}.json` };
  }

  private readCache(digest: string, specId: string): Omit<ThumbnailResult, 'cached'> | undefined {
    const { image, sidecar } = this.cachePaths(digest, specId);
    try {
      const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8')) as ThumbnailSidecar;
      if (meta.digest !== digest || meta.spec !== specId || meta.mediaType !== 'image/png') return undefined;
      if (!Number.isInteger(meta.width) || !Number.isInteger(meta.height) || meta.width <= 0 || meta.height <= 0) {
        return undefined;
      }
      const bytes = new Uint8Array(fs.readFileSync(image));
      if (bytes.byteLength !== meta.bytes || bytes.byteLength === 0) return undefined;
      return { bytes, width: meta.width, height: meta.height, mediaType: 'image/png' };
    } catch {
      return undefined;
    }
  }

  private writeCache(digest: string, specId: string, result: ThumbnailResult): void {
    const { image, sidecar } = this.cachePaths(digest, specId);
    fs.mkdirSync(path.dirname(image), { recursive: true });
    const sidecarBody = JSON.stringify({
      digest,
      spec: specId,
      width: result.width,
      height: result.height,
      mediaType: result.mediaType,
      bytes: result.bytes.byteLength,
    });
    const imageTmp = `${image}.${process.pid}.tmp`;
    const sidecarTmp = `${sidecar}.${process.pid}.tmp`;
    fs.writeFileSync(imageTmp, Buffer.from(result.bytes));
    fs.writeFileSync(sidecarTmp, sidecarBody);
    fs.renameSync(imageTmp, image);
    fs.renameSync(sidecarTmp, sidecar);
  }
}
