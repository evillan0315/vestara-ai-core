import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContentAddressedArtifactRef, ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import type {
  HistoricalAnchor,
  HistoricalEvidenceRecord,
  HistoricalFragmentLocator,
  HistoricalProvenance,
  HistoricalWorktreeState,
} from './historical-evidence';

const HISTORICAL_SCHEMA_VERSION = 1 as const;

interface HistoricalEvidenceEnvelope {
  readonly schemaVersion: typeof HISTORICAL_SCHEMA_VERSION;
  readonly record: HistoricalEvidenceRecord;
  readonly checksum: { readonly algorithm: 'sha256'; readonly digest: string };
}

export interface HistoricalIngestInput {
  readonly content: string | Uint8Array;
  readonly artifactKind: HistoricalEvidenceRecord['artifactKind'];
  readonly mediaType: string;
  readonly summary: string;
  readonly anchors: readonly HistoricalAnchor[];
  readonly worktreeState?: HistoricalWorktreeState;
  readonly provenance?: HistoricalProvenance;
  readonly derivedFrom?: string;
  readonly supersedesScope?: string;
}

export interface HistoricalEvidenceResolution {
  readonly record: HistoricalEvidenceRecord;
  readonly bytes: Buffer;
}

export interface HistoricalLineageResolution {
  readonly record: HistoricalEvidenceRecord;
  readonly parentDigest?: string;
  readonly parent?: HistoricalEvidenceRecord;
  readonly unresolvedParentDigest?: string;
}

/**
 * Evidence-domain persistence for immutable historical records.
 *
 * The CAS is deliberately injected: this store persists meaning and lineage,
 * while ContentAddressedEvidenceStore remains authoritative for bytes and
 * byte identity.
 */
export class HistoricalEvidenceStore {
  constructor(
    private readonly directory: string,
    private readonly artifacts: ContentAddressedEvidenceStore,
  ) {}

  /** Persist once; an identical existing record is an idempotent duplicate. */
  write(record: HistoricalEvidenceRecord): HistoricalEvidenceRecord {
    this.assertDigest(record.artifactDigest);
    const target = this.pathFor(record.artifactDigest);
    fs.mkdirSync(this.directory, { recursive: true });

    if (fs.existsSync(target)) {
      const existing = this.readEnvelope(record.artifactDigest);
      if (!this.verifyEnvelope(existing))
        throw new Error(`Historical evidence record is corrupt: ${record.artifactDigest}`);
      if (canonicalJson(existing.record) !== canonicalJson(record)) {
        throw new Error(`Historical evidence record is immutable: ${record.artifactDigest}`);
      }
      return existing.record;
    }

    const envelope = this.createEnvelope(record);
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { flag: 'wx' });
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      if (!fs.existsSync(target)) throw error;
    }
    return record;
  }

  read(artifactDigest: string): HistoricalEvidenceRecord | undefined {
    const target = this.pathFor(artifactDigest);
    if (!fs.existsSync(target)) return undefined;
    return this.readEnvelope(artifactDigest).record;
  }

  has(artifactDigest: string): boolean {
    return fs.existsSync(this.pathFor(artifactDigest));
  }

  /** Verify both the persisted record checksum and its referenced CAS bytes. */
  verify(artifactDigest: string): boolean {
    const target = this.pathFor(artifactDigest);
    if (!fs.existsSync(target)) return false;
    try {
      const envelope = this.readEnvelope(artifactDigest);
      if (!this.verifyEnvelope(envelope)) return false;
      if (envelope.record.artifactDigest !== artifactDigest) return false;
      return this.artifacts.verify(this.artifactReference(envelope.record));
    } catch {
      return false;
    }
  }

  list(): readonly HistoricalEvidenceRecord[] {
    if (!fs.existsSync(this.directory)) return [];
    return fs
      .readdirSync(this.directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => this.readEnvelope(file.slice(0, -'.json'.length)).record);
  }

  /** Reconstruct a record and its exact verified bytes without source paths. */
  resolve(artifactDigest: string): HistoricalEvidenceResolution | undefined {
    const record = this.read(artifactDigest);
    if (!record || !this.verify(artifactDigest)) return undefined;
    const bytes = this.artifacts.read(artifactDigest);
    if (!bytes) return undefined;
    return { record, bytes };
  }

  /** Resolve only an explicitly present semantic anchor on a verified artifact. */
  resolveAnchor(
    locator: HistoricalFragmentLocator,
  ): { readonly record: HistoricalEvidenceRecord; readonly anchor: HistoricalAnchor } | undefined {
    const resolved = this.resolve(locator.artifactDigest);
    if (!resolved) return undefined;
    const anchor = resolved.record.anchors.find(
      (candidate) =>
        candidate.kind === locator.anchor.kind &&
        candidate.value === locator.anchor.value &&
        candidate.label === locator.anchor.label,
    );
    return anchor ? { record: resolved.record, anchor } : undefined;
  }

  /** Preserve a missing parent as an unresolved lineage reference. */
  resolveLineage(record: HistoricalEvidenceRecord): HistoricalLineageResolution {
    const parentDigest = record.derivedFrom;
    if (!parentDigest) return { record };
    const parent = this.read(parentDigest);
    return parent ? { record, parentDigest, parent } : { record, parentDigest, unresolvedParentDigest: parentDigest };
  }

  /** Ingest exact bytes through the existing CAS, then persist their meaning. */
  ingest(input: HistoricalIngestInput): HistoricalEvidenceRecord {
    const artifact = this.artifacts.put({
      content: input.content,
      mediaType: input.mediaType,
      kind: 'historical-document',
      summary: input.summary,
    });
    return this.write({
      artifactDigest: artifact.digest,
      artifactKind: input.artifactKind,
      mediaType: input.mediaType,
      size: artifact.size,
      summary: input.summary,
      anchors: input.anchors,
      ...(input.worktreeState ? { worktreeState: input.worktreeState } : {}),
      ...(input.provenance ? { provenance: input.provenance } : {}),
      ...(input.derivedFrom ? { derivedFrom: input.derivedFrom } : {}),
      ...(input.supersedesScope ? { supersedesScope: input.supersedesScope } : {}),
    });
  }

  private createEnvelope(record: HistoricalEvidenceRecord): HistoricalEvidenceEnvelope {
    const unsigned = { schemaVersion: HISTORICAL_SCHEMA_VERSION, record };
    return {
      ...unsigned,
      checksum: { algorithm: 'sha256', digest: sha256(canonicalJson(unsigned)) },
    };
  }

  private readEnvelope(artifactDigest: string): HistoricalEvidenceEnvelope {
    return JSON.parse(fs.readFileSync(this.pathFor(artifactDigest), 'utf8')) as HistoricalEvidenceEnvelope;
  }

  private verifyEnvelope(envelope: HistoricalEvidenceEnvelope): boolean {
    const { checksum, ...unsigned } = envelope;
    return (
      envelope.schemaVersion === HISTORICAL_SCHEMA_VERSION &&
      checksum?.algorithm === 'sha256' &&
      typeof checksum.digest === 'string' &&
      sha256(canonicalJson(unsigned)) === checksum.digest
    );
  }

  private artifactReference(record: HistoricalEvidenceRecord): ContentAddressedArtifactRef {
    return {
      algorithm: 'sha256',
      digest: record.artifactDigest,
      size: record.size,
      mediaType: record.mediaType,
      kind: 'historical-document',
      summary: record.summary,
    };
  }

  private pathFor(artifactDigest: string): string {
    this.assertDigest(artifactDigest);
    return path.join(this.directory, `${artifactDigest.toLowerCase()}.json`);
  }

  private assertDigest(artifactDigest: string): void {
    if (!/^[0-9a-f]{64}$/i.test(artifactDigest))
      throw new Error(`Invalid historical evidence digest: ${artifactDigest}`);
  }
}

function sha256(value: string): string {
  // The CAS remains the byte identity authority. This checksum protects the
  // separate JSON record envelope and does not identify evidence bytes.
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
