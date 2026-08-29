import { WorkflowProjector } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { sourceEvent } from '../helpers';

const projector = new WorkflowProjector();

describe('WorkflowProjector', () => {
  it('supports project phase transitions and observer recommendations', () => {
    expect(projector.supports(sourceEvent({ type: 'project.phase.changed' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'project.completed' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'workflow.transition.recommended' }))).toBe(true);
    expect(projector.supports(sourceEvent({ type: 'task.started' }))).toBe(false);
  });

  it('projects an authoritative phase change', () => {
    const [record] = projector.project(
      sourceEvent({
        type: 'project.phase.changed',
        workflowId: 'wfo-001',
        payload: { from: 'planning', to: 'architecture' },
      }),
    );
    expect(record.kind).toBe('workflow');
    if (record.kind !== 'workflow') throw new Error('expected workflow activity');
    expect(record.workflowId).toBe('wfo-001');
    expect(record.previousState).toBe('planning');
    expect(record.currentState).toBe('architecture');
    expect(record.authoritative).toBe(true);
    expect(record.observed).toBe(false);
    expect(record.sequence).toBe(0);
  });

  it('projects observer recommendations as shadow (non-authoritative)', () => {
    const [record] = projector.project(
      sourceEvent({
        type: 'workflow.transition.recommended',
        workflowId: 'wfo-001',
        payload: { from: 'executing', to: 'verifying', action: 'proceed', evidenceRefs: ['ev-1'] },
      }),
    );
    if (record.kind !== 'workflow') throw new Error('expected workflow activity');
    expect(record.observed).toBe(true);
    expect(record.authoritative).toBe(false);
    expect(record.currentState).toBe('verifying');
    expect(record.evidenceRefs).toEqual(['ev-1']);
  });

  it('projects project completion with a deterministic id', () => {
    const [record] = projector.project(sourceEvent({ id: 'evt-77', type: 'project.completed' }));
    if (record.kind !== 'workflow') throw new Error('expected workflow activity');
    expect(record.id).toBe('activity:evt-77:workflow');
    expect(record.currentState).toBe('completed');
  });
});
