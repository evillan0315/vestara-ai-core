import { TaskProjector } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from '../helpers';

const projector = new TaskProjector();

describe('TaskProjector', () => {
  it('supports task lifecycle transitions', () => {
    expect(projector.supports(sourceEvent({ type: 'task.created' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'task.completed' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'project.phase.changed' }))).toBe(false);
  });

  it('projects a started task', () => {
    const [record] = projector.project(
      sourceEvent({ type: 'task.started', workflowId: 'wfo-001', taskId: 'task-3', payload: { planId: 'plan-1' } }),
    );
    if (record.kind !== 'task') throw new Error('expected task activity');
    expect(record.taskId).toBe('task-3');
    expect(record.planId).toBe('plan-1');
    expect(record.previousStatus).toBe('assigned');
    expect(record.status).toBe('in-progress');
  });

  it('maps a completed task', () => {
    const [record] = projector.project(sourceEvent({ type: 'task.completed', taskId: 'task-3' }));
    if (record.kind !== 'task') throw new Error('expected task activity');
    expect(record.status).toBe('completed');
  });

  it('maps review decisions to task states', () => {
    const approved = projector.project(
      sourceEvent({ type: 'task.review.decided', taskId: 'task-3', payload: { decision: 'approved' } }),
    )[0];
    if (approved.kind !== 'task') throw new Error('expected task activity');
    expect(approved.status).toBe('approved');

    const rejected = projector.project(
      sourceEvent({ type: 'task.review.decided', taskId: 'task-3', payload: { decision: 'rejected' } }),
    )[0];
    if (rejected.kind !== 'task') throw new Error('expected task activity');
    expect(rejected.status).toBe('blocked');
  });

  it('falls back to the payload taskId when the envelope lacks it', () => {
    const [record] = projector.project(sourceEvent({ type: 'task.created', payload: { taskId: 'task-9' } }));
    if (record.kind !== 'task') throw new Error('expected task activity');
    expect(record.taskId).toBe('task-9');
  });
});
