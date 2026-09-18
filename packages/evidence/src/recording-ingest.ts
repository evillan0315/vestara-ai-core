/**
 * CAPTURE-001-M2 — screen-recording media inspection + capture-bytes ingestion.
 *
 * Bytes in, digest out. There is no filesystem path anywhere in this module:
 * callers hand over in-memory producer bytes (adapter output or deterministic
 * fixtures) and receive a content-addressed EvidenceReference. Temporary-file
 * handling and cleanup stay on the caller side of the boundary (see
 * @vestara/screen-capture temp-artifact contract); the store copy is
 * authoritative after ingestion.
 *
 * Client MIME claims are hints only. The inspected container wins; a mismatch
 * fails closed. Canonical recording format is video/webm — no generic video.
 */

import type { ContentAddressedArtifactRef, ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import type {
  EvidenceReference,
  RecordingArtifactMetadata,
  SupportedRecordingMediaType,
  VisualArtifactMetadata,
} from './types';
import { inspectVisualBytes } from './visual-ingest';

/** Bounded allowlist for M2. WebM only; Matroska and all other containers excluded. */
export const SUPPORTED_RECORDING_MEDIA_TYPES: readonly SupportedRecordingMediaType[] = ['video/webm'];

/**
 * Refuse single captures larger than this. Aligned with the M2 original-bytes
 * serving bound (64 MiB) so anything ingested remains servable.
 */
export const MAX_CAPTURE_INGEST_BYTES = 64 * 1024 * 1024;

export type CaptureIngestErrorCode =
  | 'unsupported-media'
  | 'malformed-capture'
  | 'media-mismatch'
  | 'too-large'
  | 'empty-bytes';

export class CaptureIngestError extends Error {
  readonly code: CaptureIngestErrorCode;

  constructor(code: CaptureIngestErrorCode, message: string) {
    super(message);
    this.name = 'CaptureIngestError';
    this.code = code;
  }
}

export function isSupportedRecordingMediaType(value: unknown): value is SupportedRecordingMediaType {
  return value === 'video/webm';
}

// ─── WebM inspection (EBML magic + DocType, never client claim) ──

const EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3];
const DOCTYPE_ID = [0x42, 0x82];

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] as number);
  return out;
}

/**
 * Validate WebM container bytes. Checks the EBML header plus a `webm`
 * DocType element near the head. Dimensions/duration/codec are NOT parsed:
 * reporting them would require track decoding M2 does not perform, and
 * metadata must never be guessed. Throws CaptureIngestError on unsupported
 * or malformed input.
 */
export function inspectRecordingBytes(bytes: Uint8Array): RecordingArtifactMetadata {
  if (bytes.length < 16) {
    throw new CaptureIngestError('malformed-capture', 'recording bytes are truncated before the EBML header');
  }
  if (!EBML_HEADER.every((byte, index) => bytes[index] === byte)) {
    throw new CaptureIngestError('unsupported-media', 'bytes are not a supported recording format (video/webm)');
  }
  // Scan the EBML head for the DocType element (ID 0x4282 + ASCII value).
  const window = bytes.slice(0, Math.min(bytes.length, 128));
  let docType: string | undefined;
  for (let i = 4; i + DOCTYPE_ID.length < window.length; i += 1) {
    if (window[i] === DOCTYPE_ID[0] && window[i + 1] === DOCTYPE_ID[1]) {
      const rest = ascii(window, i + 2, Math.min(16, window.length - (i + 2)));
      if (rest.includes('webm')) docType = 'webm';
      else if (rest.includes('matroska')) docType = 'matroska';
      break;
    }
  }
  if (docType === undefined) {
    throw new CaptureIngestError('malformed-capture', 'EBML header has no readable DocType element');
  }
  if (docType !== 'webm') {
    throw new CaptureIngestError(
      'unsupported-media',
      `recording container '${docType}' is not enabled (canonical format is video/webm)`,
    );
  }
  return { mediaType: 'video/webm' };
}

// ─── Unified capture-bytes ingestion ────────────────────────────

export type CaptureIngestKind = 'screenshot' | 'screen-recording';

export interface IngestCaptureBytesInput {
  readonly artifacts: ContentAddressedEvidenceStore;
  /** In-memory producer bytes (adapter output or fixture). Never a path. */
  readonly bytes: Uint8Array;
  readonly kind: CaptureIngestKind;
  /** Client hint only — verified bytes win; mismatch fails closed. */
  readonly claimedMediaType?: string;
  readonly summary: string;
  readonly producer: string;
  readonly executionId: string;
  readonly operation?: string;
  readonly environment?: string;
  readonly relatedTo?: readonly string[];
  /** Descriptive scope label (e.g. 'display'); metadata only, never authority. */
  readonly captureTarget?: string;
  readonly capturedAt?: string;
}

export interface CaptureIngestResult {
  /** Content-addressed ref — the ONLY durable handle. */
  readonly ref: ContentAddressedArtifactRef;
  readonly reference: EvidenceReference;
  /** Server-verified media type (never the client claim). */
  readonly mediaType: string;
  readonly inspection: VisualArtifactMetadata | RecordingArtifactMetadata;
}

function verifiedMediaType(
  kind: CaptureIngestKind,
  bytes: Uint8Array,
): {
  mediaType: string;
  inspection: VisualArtifactMetadata | RecordingArtifactMetadata;
} {
  if (kind === 'screenshot') {
    try {
      const inspection = inspectVisualBytes(bytes);
      return { mediaType: inspection.mediaType, inspection };
    } catch (error) {
      throw new CaptureIngestError(
        'unsupported-media',
        error instanceof Error ? error.message : 'screenshot bytes are not a supported image format',
      );
    }
  }
  const inspection = inspectRecordingBytes(bytes);
  return { mediaType: inspection.mediaType, inspection };
}

/**
 * Validate + hash + ingest capture bytes into the content-addressed store.
 * Returns the digest-backed EvidenceReference. The caller owns temp cleanup:
 * FINALIZING calls this, COMPLETED keeps the digest, FAILED/CANCELLED must
 * dispose the temp artifact without ever treating its pathname as identity.
 */
export function ingestCaptureBytes(input: IngestCaptureBytesInput): CaptureIngestResult {
  if (input.bytes.length === 0) {
    throw new CaptureIngestError('empty-bytes', 'capture bytes are empty');
  }
  if (input.bytes.length > MAX_CAPTURE_INGEST_BYTES) {
    throw new CaptureIngestError('too-large', `capture exceeds ${MAX_CAPTURE_INGEST_BYTES} bytes`);
  }
  const { mediaType, inspection } = verifiedMediaType(input.kind, input.bytes);
  if (input.claimedMediaType !== undefined && input.claimedMediaType !== mediaType) {
    throw new CaptureIngestError(
      'media-mismatch',
      `claimed media '${input.claimedMediaType}' does not match inspected '${mediaType}'`,
    );
  }
  const createdAt = new Date().toISOString();
  const environment = input.environment ?? 'local';
  const metadata: Record<string, unknown> = {
    operation: input.operation,
    relatedTo: input.relatedTo,
    producer: input.producer,
  };
  if (input.captureTarget !== undefined || input.capturedAt !== undefined) {
    metadata.capture = { captureTarget: input.captureTarget, capturedAt: input.capturedAt ?? createdAt };
  }
  if (input.kind === 'screenshot') {
    metadata.visual = { ...(inspection as VisualArtifactMetadata) };
  } else {
    metadata.recording = { ...inspection };
  }

  // Bytes are copied into the store; metadata rides alongside, outside the hash.
  const ref = input.artifacts.put({
    content: input.bytes,
    mediaType,
    kind: input.kind,
    summary: input.summary,
    metadata,
  });

  const reference: EvidenceReference = {
    ref: ref.digest,
    kind: input.kind,
    mediaType,
    size: ref.size,
    summary: input.summary,
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
    ...(input.kind === 'screenshot' ? { visual: { ...(inspection as VisualArtifactMetadata) } } : {}),
  };
  return { ref, reference, mediaType, inspection };
}
