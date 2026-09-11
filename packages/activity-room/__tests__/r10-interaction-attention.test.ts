/**
 * AR-REC R10 — Interaction Attention Integration
 *
 * Tests that:
 *   1. interaction.presented creates an attention entry
 *   2. interaction.responded auto-resolves the attention entry
 *   3. Dedup: at most one unacknowledged attention per interactionId
 *   4. Attention entries carry the interactionId reference
 *   5. rebuild() produces equivalent attention state
 */

import { describe, expect, it } from 'vitest';
import type { ActivityRecord, ActivityRecordId } from '../src/m9-types';
import { ProjectionRuntime } from '../src/m10-projection-runtime';

// ─── Test Helpers ───────────────────────────────────────────

let nextSeq = 1;

function makeInteractionPresentedRecord(interactionId: string, content = 'Approve this?'): ActivityRecord {
  return {
    activityId: `ar-${nextSeq++}` as ActivityRecordId,
    eventId: `interaction:presented:${interactionId}`,
    sequenceNumber: nextSeq++,
    type: 'interaction.presented',
    timestamp: new Date().toISOString(),
    actor: { type: 'agent', id: 'agent-1', displayName: 'Developer' },
    source: 'interaction-app',
    payload: {
      message: content,
      data: {
        interactionId,
        content,
        choices: [
          { choiceId: 'approve', label: 'Approve' },
          { choiceId: 'reject', label: 'Reject' },
        ],
      },
    },
    visibility: 'all',
  };
}

function makeInteractionRespondedRecord(interactionId: string, selectedChoiceId = 'approve'): ActivityRecord {
  return {
    activityId: `ar-${nextSeq++}` as ActivityRecordId,
    eventId: `interaction:responded:${interactionId}`,
    sequenceNumber: nextSeq++,
    type: 'interaction.responded',
    timestamp: new Date().toISOString(),
    actor: { type: 'human', id: 'human-1', displayName: 'Alice' },
    source: 'interaction-app',
    payload: {
      message: `Responded with ${selectedChoiceId}`,
      data: {
        interactionId,
        selectedChoiceId,
        responseId: `resp-${interactionId}`,
      },
    },
    visibility: 'all',
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('R10 — Interaction Attention Integration', () => {
  describe('attention creation', () => {
    it('creates an attention entry when interaction.presented arrives', () => {
      const runtime = new ProjectionRuntime();
      const record = makeInteractionPresentedRecord('int-001');

      runtime.processRecord(record);
      const projection = runtime.getProjection();

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].reason).toBe('interaction-presented');
      expect(projection.attention[0].interactionId).toBe('int-001');
      expect(projection.attention[0].severity).toBe('medium');
      expect(projection.attention[0].acknowledged).toBe(false);
    });

    it('includes the interaction content in the attention message', () => {
      const runtime = new ProjectionRuntime();
      const record = makeInteractionPresentedRecord('int-002', 'Review the deployment');

      runtime.processRecord(record);
      const projection = runtime.getProjection();

      expect(projection.attention[0].message).toBe('Review the deployment');
    });

    it('sets the presenting actor on the attention entry', () => {
      const runtime = new ProjectionRuntime();
      const record = makeInteractionPresentedRecord('int-003');

      runtime.processRecord(record);
      const projection = runtime.getProjection();

      expect(projection.attention[0].actor?.id).toBe('agent-1');
      expect(projection.attention[0].actor?.displayName).toBe('Developer');
    });
  });

  describe('attention auto-resolve', () => {
    it('auto-resolves attention when interaction.responded arrives', () => {
      const runtime = new ProjectionRuntime();

      runtime.processRecord(makeInteractionPresentedRecord('int-010'));
      expect(runtime.getProjection().attention.length).toBe(1);

      runtime.processRecord(makeInteractionRespondedRecord('int-010', 'approve'));
      const projection = runtime.getProjection();

      expect(projection.attention.length).toBe(0);
    });

    it('does not resolve attention for a different interactionId', () => {
      const runtime = new ProjectionRuntime();

      runtime.processRecord(makeInteractionPresentedRecord('int-011'));
      runtime.processRecord(makeInteractionPresentedRecord('int-012'));
      expect(runtime.getProjection().attention.length).toBe(2);

      runtime.processRecord(makeInteractionRespondedRecord('int-011', 'approve'));
      const projection = runtime.getProjection();

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].interactionId).toBe('int-012');
    });
  });

  describe('dedup', () => {
    it('creates at most one unacknowledged attention per interactionId', () => {
      const runtime = new ProjectionRuntime();

      // Send same interaction presented twice (duplicate event)
      runtime.processRecord(makeInteractionPresentedRecord('int-020'));
      runtime.processRecord(makeInteractionPresentedRecord('int-020'));
      const projection = runtime.getProjection();

      expect(projection.attention.length).toBe(1);
      expect(projection.attention[0].interactionId).toBe('int-020');
    });

    it('allows attention for different interactionIds', () => {
      const runtime = new ProjectionRuntime();

      runtime.processRecord(makeInteractionPresentedRecord('int-021'));
      runtime.processRecord(makeInteractionPresentedRecord('int-022'));
      const projection = runtime.getProjection();

      expect(projection.attention.length).toBe(2);
    });
  });

  describe('rebuild equivalence', () => {
    it('rebuilding from the same records produces equivalent attention state', () => {
      const records: ActivityRecord[] = [
        makeInteractionPresentedRecord('int-030', 'Deploy to staging?'),
        makeInteractionPresentedRecord('int-031', 'Run tests?'),
        makeInteractionRespondedRecord('int-030', 'approve'),
      ];

      const runtime1 = new ProjectionRuntime();
      const projection1 = runtime1.rebuild(records);

      const runtime2 = new ProjectionRuntime();
      const projection2 = runtime2.rebuild(records);

      expect(projection1.attention.length).toBe(projection2.attention.length);
      expect(projection1.attention.length).toBe(1);
      expect(projection1.attention[0].interactionId).toBe('int-031');
      expect(projection2.attention[0].interactionId).toBe('int-031');
    });
  });

  describe('coexistence with existing attention', () => {
    it('interaction attention coexists with task-failed attention', () => {
      const runtime = new ProjectionRuntime();

      // Task failure
      runtime.processRecord({
        activityId: 'ar-task-1' as ActivityRecordId,
        eventId: 'task:failed:task-1',
        sequenceNumber: nextSeq++,
        type: 'task.failed',
        timestamp: new Date().toISOString(),
        actor: { type: 'agent', id: 'agent-1', displayName: 'Developer' },
        source: 'agent-harness',
        payload: { error: { message: 'Build failed' } },
        visibility: 'all',
        taskId: 'wt-task-1' as any,
      });

      // Interaction presented
      runtime.processRecord(makeInteractionPresentedRecord('int-040'));

      const projection = runtime.getProjection();
      expect(projection.attention.length).toBe(2);

      const reasons = projection.attention.map((a) => a.reason).sort();
      expect(reasons).toEqual(['interaction-presented', 'task-failed']);
    });
  });
});
