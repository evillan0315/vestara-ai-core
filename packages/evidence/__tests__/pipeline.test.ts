import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandEvidenceCollector, FilesystemChangeCollector, SourceDiffCollector } from '../src/collectors';
import { ConfidenceEngine, levelFor } from '../src/confidence';
import { EvidencePipeline } from '../src/pipeline';
import type { EvidenceCollectionResult, EvidenceCollector } from '../src/types';

const COMMIT = 'a'.repeat(40);
const directories: string[] = [];

function tmpdir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('ConfidenceEngine (PCS-026 §8)', () => {
  it('derives confidence from the six dimensions', () => {
    const engine = new ConfidenceEngine({ freshnessWindowHours: 24 });
    const now = new Date().toISOString();
    const confidence = engine.compute({
      checks: [
        { checkId: 'build', name: 'Build', status: 'passed', summary: 'ok', evidenceRefs: ['a'] },
        { checkId: 'test', name: 'Test', status: 'passed', summary: 'ok', evidenceRefs: ['b'] },
      ],
      evidenceCount: 2,
      distinctEvidenceRefs: 2,
      replayableCount: 2,
      createdAt: now,
    });
    expect(confidence.factors.map((factor) => factor.dimension).sort()).toEqual(
      [
        'profile-coverage',
        'check-success',
        'evidence-integrity',
        'evidence-independence',
        'replayability',
        'freshness',
      ].sort(),
    );
    expect(confidence.score).toBeGreaterThan(0.9);
    expect(confidence.level).toBe('very-high');
    expect(confidence.limitations).toHaveLength(0);
  });

  it('penalizes missing evidence and failed checks', () => {
    const engine = new ConfidenceEngine();
    const confidence = engine.compute({
      checks: [
        { checkId: 'build', name: 'Build', status: 'passed', summary: 'ok', evidenceRefs: [] },
        { checkId: 'test', name: 'Test', status: 'failed', summary: 'fail', evidenceRefs: [] },
      ],
      evidenceCount: 0,
      distinctEvidenceRefs: 0,
      replayableCount: 0,
      createdAt: new Date().toISOString(),
    });
    expect(confidence.score).toBeLessThan(0.5);
    expect(confidence.limitations.some((l) => l.includes('no content-addressed'))).toBe(true);
  });

  it('maps scores to levels', () => {
    expect(levelFor(0.95)).toBe('very-high');
    expect(levelFor(0.8)).toBe('high');
    expect(levelFor(0.6)).toBe('moderate');
    expect(levelFor(0.2)).toBe('low');
  });
});

describe('EvidencePipeline (PCS-026 slice 1)', () => {
  it('produces a verification bundle through the stores', async () => {
    const root = tmpdir('evidence-');
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot);
    fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'a.ts'), 'export const a = 1;\n');

    const pipeline = new EvidencePipeline({
      artifacts: new ContentAddressedEvidenceStore(path.join(root, 'artifacts')),
      manifests: new ImmutableEvidenceManifestStore(path.join(root, 'manifests')),
      collectors: [
        new FilesystemChangeCollector(),
        new SourceDiffCollector(),
        new CommandEvidenceCollector({ command: 'echo', args: ['hello'] }),
      ],
      producer: 'harness-verifier',
      environment: 'test-env',
    });

    const bundle = await pipeline.buildBundle({
      executionId: 'verification-123',
      taskId: 'task-1',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      scope: ['build', 'test'],
      checks: [
        { id: 'build', name: 'Build', status: 'passed', summary: 'ok' },
        { id: 'test', name: 'Test', status: 'passed', summary: 'ok' },
      ],
      workspaceRoot,
      changedFiles: ['src/a.ts'],
    });

    expect(bundle.id).toBe('bundle-verification-123');
    expect(bundle.manifestId).toBe('verification-123');
    expect(bundle.evidence.length).toBeGreaterThanOrEqual(3); // filesystem + diff + command
    expect(bundle.evidence.every((ref) => ref.ref.length === 64)).toBe(true);
    expect(bundle.evidence.every((ref) => ref.provenance.producer === 'harness-verifier')).toBe(true);
    expect(bundle.checks).toHaveLength(2);
    expect(bundle.checks.every((check) => check.evidenceRefs.length > 0)).toBe(true);
    expect(bundle.replay.mode).toBe('artifact');
    expect(bundle.replay.steps[0].type).toBe('open-artifact');
    expect(bundle.confidence.level).toBe('very-high');
  });

  it('persists content-addressed artifacts and a verifiable immutable manifest', async () => {
    const root = tmpdir('evidence-manifest-');
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const pipeline = new EvidencePipeline({
      artifacts,
      manifests,
      collectors: [new CommandEvidenceCollector({ command: 'printf', args: ['evidence-bytes'] })],
    });

    const bundle = await pipeline.buildBundle({
      executionId: 'verification-456',
      verifierId: 'verifier',
      profileId: 'focused',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      checks: [{ id: 'cmd', name: 'Command', status: 'passed', summary: 'ok' }],
      workspaceRoot: root,
    });

    expect(manifests.verify('verification-456')).toBe(true);
    const check = manifests.verifyArtifacts('verification-456', artifacts);
    expect(check.valid).toBe(true);
    expect(check.missing).toHaveLength(0);
    expect(artifacts.has(bundle.evidence[0].ref)).toBe(true);
  });

  it('isolates a failing collector without aborting the bundle', async () => {
    const root = tmpdir('evidence-collector-');
    const throwing: EvidenceCollector = {
      kind: 'command',
      async collect(): Promise<EvidenceCollectionResult> {
        throw new Error('collector exploded');
      },
    };
    const pipeline = new EvidencePipeline({
      artifacts: new ContentAddressedEvidenceStore(path.join(root, 'artifacts')),
      manifests: new ImmutableEvidenceManifestStore(path.join(root, 'manifests')),
      collectors: [throwing, new CommandEvidenceCollector({ command: 'printf', args: ['ok'] })],
    });

    const bundle = await pipeline.buildBundle({
      executionId: 'verification-789',
      verifierId: 'verifier',
      profileId: 'focused',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      checks: [{ id: 'cmd', name: 'Command', status: 'passed', summary: 'ok' }],
      workspaceRoot: root,
    });
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0].summary).toContain('printf');
  });

  it('attributes evidence to checks by declared kind', async () => {
    const root = tmpdir('evidence-attribution-');
    const pipeline = new EvidencePipeline({
      artifacts: new ContentAddressedEvidenceStore(path.join(root, 'artifacts')),
      manifests: new ImmutableEvidenceManifestStore(path.join(root, 'manifests')),
      collectors: [new CommandEvidenceCollector({ command: 'printf', args: ['out'] }), new FilesystemChangeCollector()],
    });

    const bundle = await pipeline.buildBundle({
      executionId: 'verification-attribution',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      checks: [
        { id: 'build', name: 'Build', status: 'passed', summary: 'ok', evidenceKinds: ['command'] },
        { id: 'fs', name: 'FS', status: 'passed', summary: 'ok', evidenceKinds: ['filesystem-change'] },
      ],
      workspaceRoot: root,
      changedFiles: ['src/a.ts'],
    });

    const byId = new Map(bundle.checks.map((check) => [check.checkId, check]));
    const commandKind = bundle.evidence.find((ref) => ref.kind === 'command');
    const fsKind = bundle.evidence.find((ref) => ref.kind === 'filesystem-change');
    expect(byId.get('build')?.evidenceRefs).toEqual([commandKind?.ref]);
    expect(byId.get('fs')?.evidenceRefs).toEqual([fsKind?.ref]);
    // A check with no declared kinds is backed by all run evidence.
    expect(
      (
        await pipeline.buildBundle({
          executionId: 'verification-attribution-2',
          verifierId: 'verifier',
          profileId: 'standard',
          repository: '/repo',
          implementationCommit: COMMIT,
          outcome: 'passed',
          checks: [{ id: 'all', name: 'All', status: 'passed', summary: 'ok' }],
          workspaceRoot: root,
          changedFiles: ['src/a.ts'],
        })
      ).checks[0].evidenceRefs.length,
    ).toBe(2);
  });

  it('links a correction bundle via supersedes (PCS-026 §6)', async () => {
    const root = tmpdir('evidence-correct-');
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot);
    const pipeline = new EvidencePipeline({
      artifacts: new ContentAddressedEvidenceStore(path.join(root, 'artifacts')),
      manifests: new ImmutableEvidenceManifestStore(path.join(root, 'manifests')),
      environment: 'test-env',
    });
    const original = await pipeline.buildBundle({
      executionId: 'verification-1',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'failed',
      checks: [{ id: 'build', name: 'Build', status: 'failed', summary: 'bad' }],
      workspaceRoot,
    });
    expect(original.supersedes).toBeUndefined();

    const correction = await pipeline.buildBundle({
      executionId: 'verification-2',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      correctionOf: 'verification-1',
      checks: [{ id: 'build', name: 'Build', status: 'passed', summary: 'good' }],
      workspaceRoot,
    });
    expect(correction.supersedes).toBe('bundle-verification-1');
    expect(correction.id).not.toBe(original.id);
  });
});
