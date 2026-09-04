import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { EvidencePipeline } from '../src/pipeline';
import { ingestVisualFile, VisualFileCollector } from '../src/visual-ingest';

/**
 * EVIDENCE-UX-002 M1 — M4A proof at the caller/integration layer.
 *
 * The three Playwright screenshots under
 * tests/visual/.artifacts/ga-ux-premium-m4a/ are the FIRST CALLER of the
 * generic ingestion mechanism. No M4A path is hardcoded in domain or
 * application code — the paths live only in this integration test (the
 * caller) and are passed as ordinary caller-supplied context. The source
 * files are never moved or rewritten.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
// Canonical M4A Playwright output (EVIDENCE-UX-001 §4). Caller-supplied context
// only — the domain never sees this path.
const M4A_DIR = path.join('apps', 'workspace', 'tests', 'visual', '.artifacts', 'ga-ux-premium-m4a');
const M4A_FILES = ['m4a-fixture-matrix.png', 'm4a-narrow-containment.png', 'm4a-expanded-width.png'];

describe('M4A screenshot ingestion proof (EVIDENCE-UX-002 M1 caller layer)', () => {
  it('ingests all three M4A screenshots as ordinary screenshot references', () => {
    const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-ingest-m4a-'));
    try {
      const artifacts = new ContentAddressedEvidenceStore(storeDir);
      const results = M4A_FILES.map((file) =>
        ingestVisualFile({
          artifacts,
          sourceFile: path.join(M4A_DIR, file),
          workspaceRoot: REPO_ROOT,
          producer: 'playwright',
          executionId: 'm4a-proof-ingest-1',
          operation: 'contract-fixture visual acceptance',
        }),
      );

      expect(results).toHaveLength(3);
      const digests = new Set<string>();
      for (const [index, result] of results.entries()) {
        const file = M4A_FILES[index] as string;
        const originalBytes = fs.readFileSync(path.join(REPO_ROOT, M4A_DIR, file));
        const decoded = PNG.sync.read(Buffer.from(originalBytes));

        // Content identity + MIME + dimensions from inspected content.
        expect(result.ref.kind).toBe('screenshot');
        expect(result.ref.mediaType).toBe('image/png');
        expect(result.ref.digest).toMatch(/^[0-9a-f]{64}$/);
        expect(result.ref.size).toBe(originalBytes.byteLength);
        expect(result.inspection).toEqual({
          width: decoded.width,
          height: decoded.height,
          mediaType: 'image/png',
        });
        expect(decoded.width).toBeGreaterThan(0);
        expect(decoded.height).toBeGreaterThan(0);
        expect(result.reference.visual).toEqual(result.inspection);
        expect(result.ref.metadata).toEqual({ visual: { ...result.inspection } });

        // Truthful provenance: capture source + purpose, never "verified".
        expect(result.reference.provenance.producer).toBe('playwright');
        expect(result.reference.provenance.operation).toBe('contract-fixture visual acceptance');
        expect(result.reference.provenance.contentHash).toBe(result.ref.digest);
        expect(result.repositoryRelativePath).toBe(path.join(M4A_DIR, file));

        // Immutable bytes stored exactly; originals untouched in place.
        expect(artifacts.verify(result.ref)).toBe(true);
        expect(Buffer.from(artifacts.read(result.ref.digest) ?? [])).toEqual(originalBytes);
        expect(fs.existsSync(path.join(REPO_ROOT, M4A_DIR, file))).toBe(true);
        digests.add(result.ref.digest);
      }
      // Three distinct captures → three distinct content identities.
      expect(digests.size).toBe(3);
    } finally {
      fs.rmSync(storeDir, { recursive: true, force: true });
    }
  });

  it('binds the M4A set into a bundle through the generic collector', async () => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-ingest-m4a-bundle-'));
    try {
      const artifacts = new ContentAddressedEvidenceStore(path.join(storeRoot, 'artifacts'));
      const manifests = new ImmutableEvidenceManifestStore(path.join(storeRoot, 'manifests'));
      const pipeline = new EvidencePipeline({
        artifacts,
        manifests,
        collectors: [
          new VisualFileCollector({
            files: M4A_FILES.map((file) => path.join(M4A_DIR, file)),
            operation: 'contract-fixture visual acceptance',
          }),
        ],
        producer: 'evidence-ingest',
        environment: 'local:test',
      });
      const bundle = await pipeline.buildBundle({
        executionId: 'm4a-proof-bundle-1',
        verifierId: 'verifier',
        profileId: 'standard',
        repository: '/repo',
        implementationCommit: 'c'.repeat(40),
        outcome: 'inconclusive',
        checks: [{ id: 'viewing', name: 'Viewing only', status: 'skipped', summary: 'no assertion' }],
        workspaceRoot: REPO_ROOT,
      });

      expect(bundle.evidence).toHaveLength(3);
      expect(bundle.evidence.every((ref) => ref.kind === 'screenshot')).toBe(true);
      for (const ref of bundle.evidence) {
        expect(ref.visual?.mediaType).toBe('image/png');
        expect(ref.visual?.width).toBeGreaterThan(0);
        expect(ref.visual?.height).toBeGreaterThan(0);
        expect(ref.provenance.producer).toBe('evidence-ingest');
      }
      expect(manifests.verify('m4a-proof-bundle-1')).toBe(true);
      expect(manifests.verifyArtifacts('m4a-proof-bundle-1', artifacts).valid).toBe(true);
    } finally {
      fs.rmSync(storeRoot, { recursive: true, force: true });
    }
  });
});
