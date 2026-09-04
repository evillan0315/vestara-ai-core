/**
 * EVIDENCE-UX-002 M1 — generic visual artifact ingestion.
 *
 * Producer file
 *     ↓
 * validate (workspace-root containment, explicit file only)
 *     ↓
 * inspect media (magic bytes + intrinsic dimensions — never extension)
 *     ↓
 * content-addressed ingest (ContentAddressedEvidenceStore — bytes are COPIED,
 * so the store is authoritative after ingestion and survives deletion of the
 * producer file)
 *     ↓
 * EvidenceReference + EvidenceProvenance + metadata.visual
 *
 * metadata.visual is descriptive presentation metadata. It never becomes
 * artifact identity (the digest is), verification authority (a verifier
 * verdict is), or filesystem authority (digests resolve server-side).
 *
 * This module knows nothing about GA-UX-PREMIUM, M4A, AssistantCodeEdit, or
 * /m4a-demo. Those are caller-supplied provenance/summary context.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContentAddressedArtifactRef, ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import type {
  EvidenceCollectionRequest,
  EvidenceCollector,
  EvidenceItem,
  EvidenceReference,
  SupportedVisualMediaType,
  VisualArtifactMetadata,
} from './types';

/** Bounded allowlist for M1. SVG is excluded until an explicit security review. */
export const SUPPORTED_VISUAL_MEDIA_TYPES: readonly SupportedVisualMediaType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

/** Refuse single files larger than this (presentation + memory bound). */
export const MAX_VISUAL_INGEST_BYTES = 25 * 1024 * 1024;

export type VisualIngestErrorCode =
  | 'unsupported-media'
  | 'malformed-image'
  | 'traversal'
  | 'outside-workspace'
  | 'external-path'
  | 'missing-file'
  | 'not-a-file'
  | 'too-large';

export class VisualIngestError extends Error {
  readonly code: VisualIngestErrorCode;

  constructor(code: VisualIngestErrorCode, message: string) {
    super(message);
    this.name = 'VisualIngestError';
    this.code = code;
  }
}

export function isSupportedVisualMediaType(value: unknown): value is SupportedVisualMediaType {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

/**
 * Validate an unknown value as VisualArtifactMetadata. Used at the pipeline
 * boundary so only well-formed visual metadata reaches EvidenceReference.
 */
export function readVisualMetadata(value: unknown): VisualArtifactMetadata | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as { visual?: unknown }).visual;
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  const { width, height, mediaType } = candidate as Record<string, unknown>;
  if (typeof width !== 'number' || !Number.isInteger(width) || width <= 0 || width > 100000) return undefined;
  if (typeof height !== 'number' || !Number.isInteger(height) || height <= 0 || height > 100000) return undefined;
  if (!isSupportedVisualMediaType(mediaType)) return undefined;
  return { width, height, mediaType };
}

// ─── Media inspection (magic bytes + dimensions, never extension) ───

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] as number) * 0x1000000 +
    ((bytes[offset + 1] as number) << 16) +
    ((bytes[offset + 2] as number) << 8) +
    (bytes[offset + 3] as number)
  );
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] as number) << 8) + (bytes[offset + 1] as number);
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] as number) + ((bytes[offset + 1] as number) << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] as number) + ((bytes[offset + 1] as number) << 8) + ((bytes[offset + 2] as number) << 16);
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] as number) +
    ((bytes[offset + 1] as number) << 8) +
    ((bytes[offset + 2] as number) << 16) +
    (bytes[offset + 3] as number) * 0x1000000
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] as number);
  return out;
}

function validDimensions(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 100000 &&
    height <= 100000
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function inspectPng(bytes: Uint8Array): VisualArtifactMetadata {
  if (bytes.length < 33) throw new VisualIngestError('malformed-image', 'PNG is truncated before IHDR');
  // First chunk must be IHDR with a 13-byte body holding width/height.
  if (u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') {
    throw new VisualIngestError('malformed-image', 'PNG is missing its IHDR chunk');
  }
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  if (!validDimensions(width, height)) throw new VisualIngestError('malformed-image', 'PNG has invalid dimensions');
  return { width, height, mediaType: 'image/png' };
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function inspectJpeg(bytes: Uint8Array): VisualArtifactMetadata {
  let offset = 2; // skip SOI
  for (let markers = 0; markers < 512; markers += 1) {
    if (offset + 4 > bytes.length) break;
    if (bytes[offset] !== 0xff) throw new VisualIngestError('malformed-image', 'JPEG marker sync lost');
    const marker = bytes[offset + 1] as number;
    if (marker === 0xd9) break; // EOI before any SOF
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    const length = u16be(bytes, offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) {
      throw new VisualIngestError('malformed-image', 'JPEG segment overruns the buffer');
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 7) throw new VisualIngestError('malformed-image', 'JPEG SOF segment is truncated');
      const height = u16be(bytes, offset + 5);
      const width = u16be(bytes, offset + 7);
      if (!validDimensions(width, height))
        throw new VisualIngestError('malformed-image', 'JPEG has invalid dimensions');
      return { width, height, mediaType: 'image/jpeg' };
    }
    offset += 2 + length;
  }
  throw new VisualIngestError('malformed-image', 'JPEG has no start-of-frame segment');
}

function inspectWebp(bytes: Uint8Array): VisualArtifactMetadata {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new VisualIngestError('malformed-image', 'WebP RIFF container is truncated');
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const fourcc = ascii(bytes, offset, 4);
    const chunkSize = u32le(bytes, offset + 4);
    const body = offset + 8;
    if (fourcc === 'VP8X') {
      if (chunkSize < 10 || body + 10 > bytes.length) {
        throw new VisualIngestError('malformed-image', 'WebP VP8X chunk is truncated');
      }
      const width = u24le(bytes, body + 4) + 1;
      const height = u24le(bytes, body + 7) + 1;
      if (!validDimensions(width, height))
        throw new VisualIngestError('malformed-image', 'WebP has invalid dimensions');
      return { width, height, mediaType: 'image/webp' };
    }
    if (fourcc === 'VP8 ') {
      // Lossy bitstream: 3-byte frame tag + 0x9d012a start code, then 14-bit dims.
      if (body + 10 > bytes.length || ascii(bytes, body + 3, 3) !== '\x9d\x01\x2a') {
        throw new VisualIngestError('malformed-image', 'WebP VP8 frame header is invalid');
      }
      const width = u16le(bytes, body + 6) & 0x3fff;
      const height = u16le(bytes, body + 8) & 0x3fff;
      if (!validDimensions(width, height))
        throw new VisualIngestError('malformed-image', 'WebP has invalid dimensions');
      return { width, height, mediaType: 'image/webp' };
    }
    if (fourcc === 'VP8L') {
      // Lossless: 0x2f signature + packed 14-bit (width-1, height-1).
      if (body + 5 > bytes.length || bytes[body] !== 0x2f) {
        throw new VisualIngestError('malformed-image', 'WebP VP8L header is invalid');
      }
      const packed = u32le(bytes, body + 1);
      const width = (packed & 0x3fff) + 1;
      const height = ((packed >> 14) & 0x3fff) + 1;
      if (!validDimensions(width, height))
        throw new VisualIngestError('malformed-image', 'WebP has invalid dimensions');
      return { width, height, mediaType: 'image/webp' };
    }
    offset = body + chunkSize + (chunkSize % 2);
  }
  throw new VisualIngestError('malformed-image', 'WebP has no decodable image chunk');
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.slice(0, 256)).toString('utf8').trimStart().toLowerCase();
  return (
    head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype') || head.startsWith('<html')
  );
}

/**
 * Determine media type + intrinsic dimensions from content bytes.
 * Extension is never consulted. Throws VisualIngestError on
 * unsupported or malformed input.
 */
export function inspectVisualBytes(bytes: Uint8Array): VisualArtifactMetadata {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return inspectPng(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return inspectJpeg(bytes);
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'RIFF') {
    return inspectWebp(bytes);
  }
  if (looksLikeSvg(bytes)) {
    throw new VisualIngestError(
      'unsupported-media',
      'SVG is not enabled for visual evidence (requires security review)',
    );
  }
  throw new VisualIngestError(
    'unsupported-media',
    'bytes are not a supported visual format (image/png, image/jpeg, image/webp)',
  );
}

// ─── Source-file boundary ─────────────────────────────────────────

/**
 * Resolve an explicitly supplied source file against the workspace-root
 * authority boundary. Returns the absolute path. Rejects URLs, traversal
 * outside the root, non-files, and oversized files. Never recursive, never
 * a crawler — one explicit file per call.
 */
export function resolveVisualSource(sourceFile: string, workspaceRoot: string): string {
  if (typeof sourceFile !== 'string' || sourceFile.length === 0 || sourceFile.includes('\0')) {
    throw new VisualIngestError('missing-file', 'source file must be a non-empty path');
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(sourceFile)) {
    throw new VisualIngestError('external-path', `source is not a workspace file: ${sourceFile}`);
  }
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, sourceFile);
  const contained = resolved === root || resolved.startsWith(root + path.sep);
  if (!contained) {
    throw new VisualIngestError(
      path.isAbsolute(sourceFile) ? 'outside-workspace' : 'traversal',
      `source escapes the workspace root: ${sourceFile}`,
    );
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new VisualIngestError('missing-file', `source file does not exist: ${sourceFile}`);
  }
  if (!stat.isFile()) throw new VisualIngestError('not-a-file', `source is not a file: ${sourceFile}`);
  if (stat.size > MAX_VISUAL_INGEST_BYTES) {
    throw new VisualIngestError('too-large', `source exceeds ${MAX_VISUAL_INGEST_BYTES} bytes: ${sourceFile}`);
  }
  return resolved;
}

// ─── Generic ingestion ────────────────────────────────────────────

export interface IngestVisualFileInput {
  readonly artifacts: ContentAddressedEvidenceStore;
  /** Explicit source file (relative or absolute); must resolve inside workspaceRoot. */
  readonly sourceFile: string;
  /** Authority boundary for source resolution (e.g. the repository root). */
  readonly workspaceRoot: string;
  /** Human label. Defaults to `screenshot: <workspace-relative path>`. */
  readonly summary?: string;
  /** Existing provenance field: which component produced the image (e.g. 'playwright'). */
  readonly producer: string;
  /** Existing provenance field: which execution/ingest run this belongs to. */
  readonly executionId: string;
  /** Existing provenance field: capture context (e.g. 'contract-fixture visual acceptance'). */
  readonly operation?: string;
  readonly environment?: string;
  readonly relatedTo?: readonly string[];
}

export interface VisualIngestResult {
  /** Content-addressed ref. `metadata.visual` carries the inspected dimensions. */
  readonly ref: ContentAddressedArtifactRef;
  /** Ordinary `screenshot` evidence reference with provenance + visual metadata. */
  readonly reference: EvidenceReference;
  /** Inspected media type + dimensions (content-derived). */
  readonly inspection: VisualArtifactMetadata;
  /** Resolved absolute source path (transient — not authority after ingest). */
  readonly sourcePath: string;
  /** Workspace-relative source label (metadata only — never file-serving authority). */
  readonly repositoryRelativePath: string;
}

/**
 * Read one explicit file, inspect its image content, and COPY its bytes into
 * the content-addressed store. The store is authoritative after ingestion:
 * deleting the producer file does not affect the stored artifact.
 * Visual metadata cannot alter the digest (digests hash bytes only).
 */
export function ingestVisualFile(input: IngestVisualFileInput): VisualIngestResult {
  const sourcePath = resolveVisualSource(input.sourceFile, input.workspaceRoot);
  const bytes = new Uint8Array(fs.readFileSync(sourcePath));
  const inspection = inspectVisualBytes(bytes);
  const root = path.resolve(input.workspaceRoot);
  const repositoryRelativePath = path.relative(root, sourcePath) || path.basename(sourcePath);
  const summary = input.summary ?? `screenshot: ${repositoryRelativePath}`;
  const createdAt = new Date().toISOString();
  const environment = input.environment ?? 'local';

  // Bytes are copied into the store; metadata rides alongside, outside the hash.
  const ref = input.artifacts.put({
    content: bytes,
    mediaType: inspection.mediaType,
    kind: 'screenshot',
    summary,
    metadata: { visual: { ...inspection } },
  });

  const reference: EvidenceReference = {
    ref: ref.digest,
    kind: 'screenshot',
    mediaType: inspection.mediaType,
    size: ref.size,
    summary,
    provenance: {
      producer: input.producer,
      executionId: input.executionId,
      operation: input.operation,
      createdAt,
      environment,
      contentHash: ref.digest,
      relatedTo: input.relatedTo,
    },
    relatedTo: input.relatedTo,
    visual: { ...inspection },
  };
  return { ref, reference, inspection, sourcePath, repositoryRelativePath };
}

// ─── Pipeline collector (explicit file list — never a scan) ───────

export interface VisualFileCollectorOptions {
  /** Explicit allowlist of source files, resolved against the request workspaceRoot. */
  readonly files: readonly string[];
  /** Provenance: capture context shared by every file (e.g. 'contract-fixture visual acceptance'). */
  readonly operation?: string;
  readonly summaryPrefix?: string;
  readonly relatedTo?: readonly string[];
}

function collectorItemLabel(relative: string, prefix?: string): string {
  return prefix ? `${prefix}${relative}` : `screenshot: ${relative}`;
}

/**
 * Generic file-backed screenshot collector. Emits one `screenshot`
 * EvidenceItem per explicit file with `metadata.visual` attached; the
 * pipeline merges that metadata into the manifest ref and the
 * EvidenceReference. Boundary violations and malformed images fail the
 * collector (fail-closed); the pipeline isolates the failure without
 * aborting the bundle. Carries no verdict — screenshots never imply PASS.
 */
export class VisualFileCollector implements EvidenceCollector {
  readonly kind = 'screenshot' as const;

  constructor(private readonly options: VisualFileCollectorOptions) {}

  async collect(request: EvidenceCollectionRequest): Promise<{ items: EvidenceItem[] }> {
    const items: EvidenceItem[] = [];
    for (const file of this.options.files) {
      const sourcePath = resolveVisualSource(file, request.workspaceRoot);
      const bytes = new Uint8Array(fs.readFileSync(sourcePath));
      const inspection = inspectVisualBytes(bytes);
      const relative = path.relative(path.resolve(request.workspaceRoot), sourcePath) || path.basename(sourcePath);
      items.push({
        kind: 'screenshot',
        mediaType: inspection.mediaType,
        content: bytes,
        summary: collectorItemLabel(relative, this.options.summaryPrefix),
        operation: this.options.operation ?? `screenshot:${relative}`,
        relatedTo: this.options.relatedTo,
        metadata: { visual: { ...inspection } },
      });
    }
    return { items };
  }
}
