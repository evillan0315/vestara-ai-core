import {
  ActivityProjectionService,
  type ActivityRedactor,
  DuplicateActivityError,
  InMemoryActivityStore,
  MonotonicSequence,
} from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from './helpers';

async function serviceWith(opts?: {
  readonly redactor?: ActivityRedactor;
  readonly sequence?: MonotonicSequence;
  readonly skipDuplicates?: boolean;
}): Promise<{ store: InMemoryActivityStore; service: ActivityProjectionService }> {
  const store = new InMemoryActivityStore();
  const service = new ActivityProjectionService({ store, ...opts });
  return { store, service };
}

describe('ActivityProjectionService', () => {
  it('projects, redacts, and appends records with monotonic sequences', async () => {
    const { store, service } = await serviceWith();
    await service.project(
      sourceEvent({
        type: 'project.phase.changed',
        workflowId: 'wfo-001',
        payload: { from: 'draft', to: 'analyzing' },
      }),
    );
    await service.project(sourceEvent({ type: 'task.started', workflowId: 'wfo-001', taskId: 'task-1' }));

    const { records } = await store.list();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.kind)).toEqual(['workflow', 'task']);
    expect(records.map((record) => record.sequence)).toEqual([1, 2]);
  });

  it('redacts sensitive content before it reaches the store', async () => {
    const { store, service } = await serviceWith();
    await service.project(
      sourceEvent({
        type: 'harness.model-response',
        payload: { agentId: 'engineer', content: 'sk-0123456789abcdef0123456789abcdef012345' },
      }),
    );
    const { records } = await store.list();
    expect(records).toHaveLength(1);
    const record = records[0];
    if (record.kind !== 'agent-message') throw new Error('expected agent-message activity');
    expect(record.content).not.toMatch(/sk-[A-Za-z0-9]+/);
    expect(record.content).toContain('[REDACTED]');
  });

  it('is idempotent for duplicate source events by default', async () => {
    const { store, service } = await serviceWith();
    const event = sourceEvent({ type: 'task.completed', taskId: 'task-1' });
    const first = await service.project(event);
    const second = await service.project(event);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(store.size()).toBe(1);
  });

  it('throws on duplicates when skipDuplicates is disabled', async () => {
    const { service } = await serviceWith({ skipDuplicates: false });
    const event = sourceEvent({ type: 'task.completed', taskId: 'task-1' });
    await service.project(event);
    await expect(service.project(event)).rejects.toBeInstanceOf(DuplicateActivityError);
  });

  it('projects one source event into multiple correlated records', async () => {
    const { store, service } = await serviceWith();
    await service.project(
      sourceEvent({
        type: 'harness.verification-result',
        taskId: 'task-3',
        payload: {
          status: 'failed',
          checks: [
            { name: 'repo-scope', status: 'failed', summary: 'mismatch' },
            { name: 'tests', status: 'passed', summary: 'ok' },
          ],
        },
      }),
    );
    const { records } = await store.list();
    expect(records.map((record) => record.kind).sort()).toEqual(['test', 'verification']);
    expect(records[0].sequence).toBe(1);
    expect(records[1].sequence).toBe(2);
  });

  it('seeds the allocator from the store when no sequence is supplied', async () => {
    const store = new InMemoryActivityStore();
    const service = new ActivityProjectionService({ store });
    const event = sourceEvent({ type: 'task.started', taskId: 'task-1' });
    await service.project(event);
    expect(await store.lastSequence()).toBe(1);
    const resumed = new ActivityProjectionService({ store });
    await resumed.project(sourceEvent({ type: 'task.completed', taskId: 'task-1' }));
    expect(await store.lastSequence()).toBe(2);
  });

  it('uses an external sequence provider when supplied', async () => {
    const { store, service } = await serviceWith({ sequence: new MonotonicSequence(100) });
    await service.project(sourceEvent({ type: 'task.started', taskId: 'task-1' }));
    const { records } = await store.list();
    expect(records[0].sequence).toBe(100);
  });

  it('does not project events no projector supports', async () => {
    const { store, service } = await serviceWith();
    await service.project(sourceEvent({ type: 'telemetry.heartbeat', payload: { detail: 'tick' } }));
    expect(store.size()).toBe(0);
  });

  it('notifies onAppended only after a record is persisted', async () => {
    const appended: string[] = [];
    const store = new InMemoryActivityStore();
    const service = new ActivityProjectionService({ store, onAppended: (record) => appended.push(record.id) });
    const event = sourceEvent({ type: 'task.started', taskId: 'task-1' });
    await service.project(event);
    expect(appended).toEqual([`activity:${event.id}:task`]);
    expect(store.size()).toBe(1);
  });

  it('passes the persisted (redacted, sequenced) record to onAppended', async () => {
    let seen: import('@vestara/activity-projection').ActivityRecord | undefined;
    const store = new InMemoryActivityStore();
    const service = new ActivityProjectionService({ store, onAppended: (record) => (seen = record) });
    await service.project(
      sourceEvent({
        type: 'harness.model-response',
        payload: { agentId: 'engineer', content: 'key sk-0123456789abcdef0123456789abcdef012345' },
      }),
    );
    expect(seen).toBeDefined();
    if (seen?.kind === 'agent-message') {
      expect(seen.sequence).toBe(1);
      expect(seen.content).not.toMatch(/sk-[A-Za-z0-9]+/);
    }
  });

  it('does not fire onAppended when persistence fails', async () => {
    let broadcasts = 0;
    const store = new InMemoryActivityStore();
    const service = new ActivityProjectionService({
      store,
      skipDuplicates: false,
      onAppended: () => {
        broadcasts += 1;
      },
    });
    const event = sourceEvent({ type: 'task.completed', taskId: 'task-1' });
    await service.project(event);
    expect(broadcasts).toBe(1);
    await expect(service.project(event)).rejects.toBeInstanceOf(DuplicateActivityError);
    expect(broadcasts).toBe(1);
  });
});
