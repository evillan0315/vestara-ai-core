import { TestProjector } from '@vestara/activity-room';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from '../helpers';

const projector = new TestProjector();

describe('TestProjector', () => {
  it('supports decided-test and verification-check sources', () => {
    expect(projector.supports(sourceEvent({ type: 'task.tests.decided' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'harness.verification-result' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'task.started' }))).toBe(false);
  });

  it('projects a passed test decision', () => {
    const [record] = projector.project(
      sourceEvent({ type: 'task.tests.decided', taskId: 'task-3', payload: { status: 'passed' } }),
    );
    if (record.kind !== 'test') throw new Error('expected test activity');
    expect(record.command).toBe('tests');
    expect(record.passed).toBe(1);
    expect(record.failed).toBe(0);
    expect(record.failureFingerprints).toEqual([]);
  });

  it('projects a failed test decision with a fingerprint', () => {
    const [record] = projector.project(
      sourceEvent({ type: 'task.tests.decided', taskId: 'task-3', payload: { status: 'failed' } }),
    );
    if (record.kind !== 'test') throw new Error('expected test activity');
    expect(record.failed).toBe(1);
    expect(record.failureFingerprints).toEqual(['task-tests-failed']);
  });

  it('derives pass/fail/skip counts from verification checks', () => {
    const [record] = projector.project(
      sourceEvent({
        type: 'harness.verification-result',
        taskId: 'task-3',
        payload: {
          status: 'failed',
          checks: [
            { name: 'unit:parser', status: 'passed', summary: 'ok' },
            { name: 'integration:routing', status: 'failed', summary: 'boom' },
            { name: 'e2e:login', status: 'failed', summary: 'nope' },
            { name: 'lint:docs', status: 'skipped', summary: 'n/a' },
          ],
        },
      }),
    );
    if (record.kind !== 'test') throw new Error('expected test activity');
    expect(record.passed).toBe(1);
    expect(record.failed).toBe(2);
    expect(record.skipped).toBe(1);
    expect(record.failureFingerprints).toEqual(['integration:routing', 'e2e:login']);
  });
});
