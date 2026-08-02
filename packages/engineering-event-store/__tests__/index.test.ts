import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileThreadStore } from '@vestara/thread-runtime';
import type { AgentEnvironmentId, CorrelationId } from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ContentAddressedEvidenceStore,
  DurableThreadRecoveryService,
  generatedStatus,
  ImmutableEvidenceManifestStore,
  reconcileInterruptedThreads,
  SqliteEngineeringEventStore,
} from '../src/index.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function root() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-truth-'));
  roots.push(directory);
  return directory;
}

describe('SqliteEngineeringEventStore', () => {
  it('persists a hash-linked append-only stream and indexed replay across restart', async () => {
    const directory = root();
    const dbPath = path.join(directory, 'events.db');
    const first = await SqliteEngineeringEventStore.open(dbPath);
    const one = first.append({
      type: 'task.created',
      source: 'test',
      actorId: 'user',
      authority: 'user',
      workspaceId: 'workspace-1',
      taskId: 'TASK-1',
      threadId: 'THREAD-1',
      correlationId: 'COR-1',
      payload: { title: 'Durable truth' },
    });
    const two = first.append({
      type: 'tool.call.completed',
      source: 'tool-runtime',
      actorId: 'tool-runtime',
      authority: 'system',
      workspaceId: 'workspace-1',
      taskId: 'TASK-1',
      threadId: 'THREAD-1',
      turnId: 'TURN-1',
      toolCallId: 'CALL-1',
      correlationId: 'COR-1',
      causationId: one.id,
      payload: { status: 'completed' },
    });
    expect(two.previousHash).toBe(one.hash);
    expect(first.verifyIntegrity()).toEqual({ valid: true, checked: 2 });
    first.close();

    const reopened = await SqliteEngineeringEventStore.open(dbPath);
    expect(reopened.query({ taskId: 'TASK-1' })).toHaveLength(2);
    expect(reopened.query({ toolCallId: 'CALL-1' })[0]?.causationId).toBe(one.id);
    expect(reopened.verifyIntegrity().valid).toBe(true);
    expect(reopened.projectGraph().entities.map((entity) => entity.id)).toContain('tool-call:CALL-1');
    reopened.close();
  });
});

describe('ImmutableEvidenceManifestStore', () => {
  it('requires immutable commits, checksums manifests, and refuses overwrite', () => {
    const directory = root();
    const store = new ImmutableEvidenceManifestStore(path.join(directory, 'evidence'));
    expect(() =>
      store.write({
        runId: 'verify-invalid',
        repository: 'repo',
        implementationCommit: 'local main',
        verifiedBy: 'verifier',
        scope: [],
        limitations: [],
        commands: [],
        artifacts: [],
        outcome: 'passed',
        correlationId: 'correlation',
      }),
    ).toThrow('immutable implementation commit');
    const manifest = store.write({
      runId: 'verify-1',
      repository: 'git@example.test:vestara/core.git',
      implementationCommit: 'a'.repeat(40),
      verifiedBy: 'verifier',
      scope: ['build', 'test'],
      limitations: ['no-browser'],
      commands: [{ command: 'pnpm test', exitCode: 0 }],
      artifacts: [
        {
          algorithm: 'sha256',
          digest: 'b'.repeat(64),
          size: 12,
          mediaType: 'text/plain',
          kind: 'test',
          summary: 'Test output',
        },
      ],
      outcome: 'passed',
      correlationId: 'correlation',
      threadId: 'THREAD-1',
      turnId: 'TURN-1',
    });
    expect(manifest.checksum.digest).toHaveLength(64);
    expect(store.verify('verify-1')).toBe(true);
    expect(() => store.write({ ...manifest, runId: 'verify-1' })).toThrow('immutable');
  });

  it('deduplicates immutable artifact content and detects tampering', () => {
    const directory = root();
    const store = new ContentAddressedEvidenceStore(path.join(directory, 'artifacts'));
    const first = store.put({
      content: 'verified output',
      mediaType: 'text/plain',
      kind: 'log',
      summary: 'Build output',
    });
    const second = store.put({
      content: 'verified output',
      mediaType: 'text/plain',
      kind: 'log',
      summary: 'Repeated output',
    });
    expect(second.digest).toBe(first.digest);
    expect(store.read(first.digest)?.toString('utf8')).toBe('verified output');
    expect(store.verify(first)).toBe(true);
    expect(store.has(first.digest)).toBe(true);
  });

  it('verifies every artifact referenced by an immutable manifest', () => {
    const directory = root();
    const artifacts = new ContentAddressedEvidenceStore(path.join(directory, 'artifacts'));
    const reference = artifacts.put({
      content: 'test report',
      mediaType: 'text/plain',
      kind: 'test',
      summary: 'Test report',
    });
    const manifests = new ImmutableEvidenceManifestStore(path.join(directory, 'manifests'));
    manifests.write({
      runId: 'verify-artifacts',
      repository: 'repo',
      implementationCommit: 'c'.repeat(40),
      verifiedBy: 'verifier',
      scope: ['test'],
      limitations: [],
      commands: [],
      artifacts: [reference],
      outcome: 'passed',
      correlationId: 'correlation',
    });
    expect(manifests.verifyArtifacts('verify-artifacts', artifacts)).toEqual({
      valid: true,
      missing: [],
      corrupted: [],
    });
  });
});

describe('restart recovery and generated status', () => {
  it('preserves approvals and blocks interrupted possible side effects without replay', async () => {
    const directory = root();
    const threads = await FileThreadStore.open(path.join(directory, 'threads.db'));
    const events = await SqliteEngineeringEventStore.open(path.join(directory, 'events.db'));
    const approvalThread = threads.createThread({
      taskId: 'TASK-APPROVAL',
      title: 'Approval',
      environmentId: 'environment' as AgentEnvironmentId,
    });
    const approvalTurn = threads.createTurn({ threadId: approvalThread.id, input: 'approve' });
    threads.transitionTurn(approvalTurn.id, 'awaiting-approval');
    const interruptedThread = threads.createThread({
      taskId: 'TASK-INTERRUPTED',
      title: 'Interrupted',
      environmentId: 'environment' as AgentEnvironmentId,
    });
    const interruptedTurn = threads.createTurn({ threadId: interruptedThread.id, input: 'write' });
    threads.transitionTurn(interruptedTurn.id, 'executing-tool');
    threads.appendItem({
      threadId: interruptedThread.id,
      turnId: interruptedTurn.id,
      kind: 'tool-call',
      actorId: 'agent',
      payload: { callId: 'CALL-1', toolName: 'filesystem.write' },
      correlationId: 'COR-1' as CorrelationId,
    });

    const decisions = reconcileInterruptedThreads({
      threads,
      events,
      workspaceId: 'workspace',
      environmentId: 'environment',
    });
    expect(decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: 'preserved-awaiting-approval' }),
        expect.objectContaining({ decision: 'blocked-interrupted', sideEffectsPossible: true }),
      ]),
    );
    expect(threads.getTurn(approvalTurn.id)?.state).toBe('awaiting-approval');
    expect(threads.getTurn(interruptedTurn.id)?.outcome?.reasonCode).toBe('restart-side-effects-inconclusive');
    expect(events.query({ type: 'recovery.turn-reconciled' })).toHaveLength(2);

    const status = generatedStatus(events.query(), []);
    expect(status.interruptedTurns).toHaveLength(2);
    threads.close();
    events.close();
  });

  it('requires reconciliation before explicitly resuming possible side effects', async () => {
    const directory = root();
    const threads = await FileThreadStore.open(path.join(directory, 'threads.db'));
    const events = await SqliteEngineeringEventStore.open(path.join(directory, 'events.db'));
    const thread = threads.createThread({
      taskId: 'TASK-RECOVER',
      title: 'Recover mutation',
      environmentId: 'environment' as AgentEnvironmentId,
    });
    const turn = threads.createTurn({ threadId: thread.id, input: 'modify files' });
    threads.transitionTurn(turn.id, 'blocked', {
      state: 'blocked',
      summary: 'Interrupted mutation',
      reasonCode: 'restart-side-effects-inconclusive',
      completedAt: new Date().toISOString(),
    });
    threads.updateThreadStatus(thread.id, 'blocked');
    const recovery = new DurableThreadRecoveryService(threads, events, 'workspace', 'environment');

    expect(() =>
      recovery.recover({ threadId: thread.id, action: 'resume', actorId: 'operator', reason: 'continue' }),
    ).toThrow('explicitly reconciled');
    const result = recovery.recover({
      threadId: thread.id,
      action: 'resume',
      actorId: 'operator',
      reason: 'inspected workspace state',
      sideEffectsReconciled: true,
    });
    expect(result.action).toBe('resumed');
    expect(result.resumedTurn?.state).toBe('queued');
    expect(threads.getThread(thread.id)?.status).toBe('active');
    expect(threads.latestCheckpoint(thread.id)?.snapshot.sideEffectsReconciled).toBe(true);
    expect(events.query({ type: 'recovery.thread-resumed' })).toHaveLength(1);
    threads.close();
    events.close();
  });
});
