import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeSetStorage } from '../src/change-set-storage';
import { ImplementationService } from '../src/implementation-service';
import type { PlanStorage } from '../src/plan-storage';
import type { ChangeSet, Plan } from '../src/types';
import { VerificationService } from '../src/verification-service';
import type { VerificationStorage } from '../src/verification-storage';
import type { WorkspaceSession } from '../src/workspace-session';

const temporaryRoots: string[] = [];

function workspaceSession(rootPath: string): WorkspaceSession {
  return {
    rootPath,
    fingerprint: { id: 'workspace-test' },
    profile: { healthScore: { overall: 100 } },
  } as unknown as WorkspaceSession;
}

function approvedPlan(): Plan {
  const now = new Date().toISOString();
  return {
    id: 'plan-1',
    title: 'Deterministic workflow',
    goal: 'Prove implementation and verification composition',
    scope: ['src/result.ts'],
    assumptions: [],
    constraints: [],
    risks: [],
    tasks: [
      {
        id: 'task-1',
        summary: 'Create deterministic result',
        description: 'Create the requested implementation artifact',
        files: ['src/result.ts'],
        dependencies: [],
        status: 'pending',
        effort: 'small',
      },
    ],
    status: 'approved',
    createdAt: now,
    updatedAt: now,
    workspaceId: 'workspace-test',
    parentExplanations: [],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('implementation → verification workflow', () => {
  it('creates a reviewable deterministic change set without writing source files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-implementation-'));
    temporaryRoots.push(root);
    const plan = approvedPlan();
    let saved: ChangeSet | null = null;
    const planStorage = { get: vi.fn().mockResolvedValue(plan) } as unknown as PlanStorage;
    const csStorage = {
      create: vi.fn().mockImplementation(async () => ({
        id: 'change-1',
        planId: plan.id,
        title: plan.title,
        status: 'draft',
        files: [],
        createdAt: new Date().toISOString(),
        appliedAt: null,
        workspaceId: plan.workspaceId,
      })),
      save: vi.fn().mockImplementation(async (changeSet: ChangeSet) => {
        saved = structuredClone(changeSet);
      }),
    } as unknown as ChangeSetStorage;

    const result = await new ImplementationService({ planStorage, csStorage }).implement(
      plan.id,
      workspaceSession(root),
    );

    expect(result.source).toBe('deterministic');
    expect(result.changeSet.files).toHaveLength(1);
    expect(result.changeSet.files[0].path).toBe('src/result.ts');
    expect(saved?.status).toBe('draft');
    expect(fs.existsSync(path.join(root, 'src/result.ts'))).toBe(false);
  });

  it('produces persisted deterministic verification evidence', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-verification-'));
    temporaryRoots.push(root);
    const changeSet: ChangeSet = {
      id: 'change-1',
      planId: 'plan-1',
      title: 'Verify',
      status: 'draft',
      files: [],
      createdAt: new Date().toISOString(),
      appliedAt: null,
      workspaceId: 'workspace-test',
    };
    const csStorage = { get: vi.fn().mockResolvedValue(changeSet) } as unknown as ChangeSetStorage;
    const save = vi.fn();
    const vrStorage = {
      create: vi.fn().mockResolvedValue({
        id: 'verification-1',
        workspaceId: 'workspace-test',
        planId: 'plan-1',
        changeSetId: 'change-1',
        status: 'running',
        checks: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
        createdAt: new Date().toISOString(),
        completedAt: null,
      }),
      save,
    } as unknown as VerificationStorage;

    const result = await new VerificationService({ csStorage, vrStorage }).verify(changeSet.id, workspaceSession(root));

    expect(result.report.checks).toHaveLength(5);
    expect(result.report.summary.total).toBe(5);
    expect(result.report.status).toBe('passed');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'verification-1', status: 'passed' }));
  });
});
