import type { DiagnosticSnapshot } from '@vestara/types';
import { describe, expect, it } from 'vitest';
import { projectDiagnosticAttentionEntries, projectRepositoryVerificationAttentionEntries } from '../src/attention';

function snapshot(overrides: Partial<DiagnosticSnapshot>): DiagnosticSnapshot {
  return {
    source: { id: 'api-server', kind: 'runtime', name: 'API Server' },
    health: 'healthy',
    severity: 'info',
    message: 'OK',
    observedAt: '2026-09-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('system attention projection', () => {
  it('projects degraded and unhealthy diagnostic snapshots by source identity', () => {
    const entries = projectDiagnosticAttentionEntries([
      snapshot({ health: 'healthy', message: 'healthy' }),
      snapshot({
        source: { id: 'system-memory', kind: 'process', name: 'System Memory' },
        health: 'degraded',
        severity: 'warning',
        message: 'Memory pressure',
        observedAt: '2026-09-22T00:01:00.000Z',
      }),
      snapshot({
        source: { id: 'git-repository', kind: 'process', name: 'Git Repository' },
        health: 'unhealthy',
        severity: 'error',
        message: 'Repository conflict',
        observedAt: '2026-09-22T00:02:00.000Z',
      }),
    ]);

    const bySource = new Map(entries.map((entry) => [entry.sourceRef?.id, entry]));
    expect([...bySource.keys()].sort()).toEqual(['git-repository', 'system-memory']);
    expect(bySource.get('system-memory')).toMatchObject({
      category: 'system',
      sourceRecordId: 'diagnostic:system-memory',
      status: 'open',
    });
    expect(bySource.get('git-repository')).toMatchObject({
      category: 'repository',
      sourceRecordId: 'diagnostic:git-repository',
      severity: 'high',
    });
  });

  it('uses the latest diagnostic snapshot for a source and resolves by omission when healthy', () => {
    const entries = projectDiagnosticAttentionEntries([
      snapshot({
        source: { id: 'api-server', kind: 'runtime', name: 'API Server' },
        health: 'unhealthy',
        severity: 'error',
        message: 'API failed',
        observedAt: '2026-09-22T00:01:00.000Z',
      }),
      snapshot({
        source: { id: 'api-server', kind: 'runtime', name: 'API Server' },
        health: 'healthy',
        severity: 'info',
        message: 'API recovered',
        observedAt: '2026-09-22T00:02:00.000Z',
      }),
    ]);

    expect(entries).toEqual([]);
  });
});

describe('repository verification attention projection', () => {
  it('keeps unrelated failed checks open when a different check passes later', () => {
    const entries = projectRepositoryVerificationAttentionEntries([
      {
        id: 'VR-1',
        workspaceId: 'workspace',
        planId: 'plan',
        changeSetId: 'change-1',
        status: 'failed',
        createdAt: '2026-09-22T00:00:00.000Z',
        completedAt: '2026-09-22T00:01:00.000Z',
        checks: [
          {
            id: 'typecheck',
            type: 'typecheck',
            status: 'failed',
            command: 'npx tsc --noEmit',
            output: 'TS2322',
            startedAt: '2026-09-22T00:00:00.000Z',
            completedAt: '2026-09-22T00:01:00.000Z',
            durationMs: 100,
          },
        ],
      },
      {
        id: 'VR-2',
        workspaceId: 'workspace',
        planId: 'plan',
        changeSetId: 'change-1',
        status: 'passed',
        createdAt: '2026-09-22T00:02:00.000Z',
        completedAt: '2026-09-22T00:03:00.000Z',
        checks: [
          {
            id: 'tests',
            type: 'test',
            status: 'passed',
            startedAt: '2026-09-22T00:02:00.000Z',
            completedAt: '2026-09-22T00:03:00.000Z',
            durationMs: 100,
          },
        ],
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      category: 'repository',
      sourceRecordId: 'verification:change-1:typecheck',
      scope: 'change-1',
      details: { reportId: 'VR-1', checkId: 'typecheck', checkType: 'typecheck' },
    });
  });

  it('resolves a failed check only when the same change set and check later pass', () => {
    const entries = projectRepositoryVerificationAttentionEntries([
      {
        id: 'VR-1',
        changeSetId: 'change-1',
        status: 'failed',
        createdAt: '2026-09-22T00:00:00.000Z',
        completedAt: '2026-09-22T00:01:00.000Z',
        checks: [{ id: 'build', type: 'build', status: 'failed' }],
      },
      {
        id: 'VR-2',
        changeSetId: 'change-1',
        status: 'passed',
        createdAt: '2026-09-22T00:02:00.000Z',
        completedAt: '2026-09-22T00:03:00.000Z',
        checks: [{ id: 'build', type: 'build', status: 'passed' }],
      },
    ]);

    expect(entries).toEqual([]);
  });
});
