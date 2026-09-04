#!/usr/bin/env tsx
/**
 * EVIDENCE-UX-002 M4.1 — Seed visual evidence into the production Evidence store.
 *
 * Ingests M4A Playwright screenshots through the M1 ingestion pipeline,
 * creates a VerificationEvidenceBundle, and persists both artifacts and
 * bundle to the production store so the Evidence page can display them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { BundleStore, ingestVisualFile } from '@vestara/evidence';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const M4A_FILES = [
  {
    file: 'apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/m4a-fixture-matrix.png',
    summary: 'Matrix — GA-UX-PREMIUM M4A contract-fixture visual acceptance',
  },
  {
    file: 'apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/m4a-narrow-containment.png',
    summary: 'Narrow — GA-UX-PREMIUM M4A contract-fixture visual acceptance',
  },
  {
    file: 'apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/m4a-expanded-width.png',
    summary: 'Expanded — GA-UX-PREMIUM M4A contract-fixture visual acceptance',
  },
] as const;

const VESTARA_ROOT = path.join(REPO_ROOT, '.vestara');
const EVIDENCE_ROOT = path.join(VESTARA_ROOT, 'evidence');
const BUNDLES_DIR = path.join(EVIDENCE_ROOT, 'bundles');
const ARTIFACTS_DIR = path.join(EVIDENCE_ROOT, 'artifacts');
const MANIFESTS_DIR = EVIDENCE_ROOT;

function main() {
  console.log('EVIDENCE-UX-002 M4.1 — Seeding visual evidence into production store\n');

  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const artifacts = new ContentAddressedEvidenceStore(ARTIFACTS_DIR);
  const manifests = new ImmutableEvidenceManifestStore(MANIFESTS_DIR);
  const bundles = new BundleStore(BUNDLES_DIR);

  const executionId = `visual-evidence-m4a-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const producer = 'playwright';
  const environment = 'contract-fixture';

  console.log(`Execution ID: ${executionId}`);
  console.log(`Artifacts: ${ARTIFACTS_DIR}`);
  console.log(`Bundles: ${BUNDLES_DIR}\n`);

  const evidenceRefs: Array<{
    ref: string;
    kind: string;
    mediaType: string;
    size: number;
    summary: string;
    provenance: {
      producer: string;
      executionId: string;
      operation: string;
      createdAt: string;
      environment: string;
      contentHash: string;
    };
    visual?: { width: number; height: number; mediaType: string };
  }> = [];

  for (const { file, summary } of M4A_FILES) {
    const sourceFile = path.join(REPO_ROOT, file);
    if (!fs.existsSync(sourceFile)) {
      console.error(`  SKIP: ${file} (not found)`);
      continue;
    }
    console.log(`  Ingesting: ${path.basename(file)}`);
    const result = ingestVisualFile({
      artifacts,
      sourceFile,
      workspaceRoot: REPO_ROOT,
      summary,
      producer,
      executionId,
      operation: 'contract-fixture visual acceptance',
      environment,
    });
    console.log(
      `    digest: ${result.ref.digest.slice(0, 16)}…  ${result.inspection.width}×${result.inspection.height} ${result.inspection.mediaType}`,
    );
    evidenceRefs.push(result.reference);
  }

  if (evidenceRefs.length === 0) {
    console.error('\nNo files ingested.');
    process.exit(1);
  }

  // Build manifest
  const manifest = manifests.write({
    runId: executionId,
    repository: REPO_ROOT,
    implementationCommit: '0'.repeat(40),
    verifiedAt: createdAt,
    verifiedBy: 'evidence-seed-script',
    scope: [],
    limitations: ['M4A visual evidence seeding — not a harness verification run'],
    commands: [],
    artifacts: evidenceRefs.map((r) => ({
      digest: r.ref,
      mediaType: r.mediaType,
      kind: r.kind as 'screenshot',
      size: r.size,
      summary: r.summary,
      metadata: r.visual ? { visual: r.visual } : undefined,
    })),
    outcome: 'passed',
    correlationId: executionId,
  });

  // Build and persist the bundle
  const bundle = {
    id: `bundle-${executionId}`,
    executionId,
    verifierId: 'evidence-seed-script',
    profileId: 'visual-evidence',
    manifestId: manifest.runId,
    evidence: evidenceRefs,
    checks: [],
    replay: {
      mode: 'artifact' as const,
      steps: evidenceRefs.map((r) => ({ type: 'open-artifact' as const, target: r.ref })),
      requires: {},
    },
    confidence: {
      score: 0,
      level: 'low' as const,
      factors: [],
      limitations: ['Seeded visual evidence — no harness verification'],
    },
    createdAt,
  };

  bundles.write(bundle);

  console.log(`\n✓ Persisted bundle: ${bundle.id}`);
  console.log(`  Evidence: ${evidenceRefs.length} screenshot references`);
  console.log(`  Artifacts: ${evidenceRefs.length} content-addressed bytes`);
  console.log(`  Manifest: ${manifest.runId}`);
  console.log(`\nThe Evidence page will now display these visual references.`);
}

main();
