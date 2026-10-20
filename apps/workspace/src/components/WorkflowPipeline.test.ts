import { describe, expect, it } from 'vitest';
import {
  matchStageStatus,
  STAGES,
  type WorkflowPipelineSession,
  type WorkflowPipelineTimelineEntry,
} from './WorkflowPipeline';

function session(timeline: WorkflowPipelineTimelineEntry[]): WorkflowPipelineSession {
  return { timeline };
}

describe('matchStageStatus', () => {
  it('never treats an empty step as a match for every stage', () => {
    const emptyStep = session([{ step: '', agentId: '', status: 'completed' }]);

    for (const stage of STAGES) {
      expect(matchStageStatus(stage.id, emptyStep)).toBe('pending');
    }
  });

  it('matches whole role tokens rather than substrings', () => {
    const planet = session([{ step: 'planet', status: 'completed' }]);

    expect(matchStageStatus('plan', planet)).toBe('pending');
  });

  it('matches a role carried by the agent id', () => {
    const developer = session([{ step: 'tool:write', agentId: 'developer', status: 'running' }]);

    expect(matchStageStatus('changeset', developer)).toBe('running');
  });

  it('uses the latest timeline entry when a stage retries', () => {
    const retried = session([
      { step: 'tool:developer', status: 'failed' },
      { step: 'tool:developer', status: 'completed' },
    ]);

    expect(matchStageStatus('changeset', retried)).toBe('completed');
  });

  it('normalizes authoritative status aliases', () => {
    expect(matchStageStatus('verification', session([{ step: 'verification', status: 'passed' }]))).toBe('completed');
    expect(matchStageStatus('verification', session([{ step: 'verification', status: 'blocked' }]))).toBe('blocked');
    expect(matchStageStatus('verification', session([{ step: 'verification', status: 'in_progress' }]))).toBe('running');
    expect(matchStageStatus('verification', session([{ step: 'verification', status: 'failed' }]))).toBe('failed');
  });

  it('infers earlier unmatched stages as complete without guessing later ones', () => {
    const verification = session([{ step: 'verification', status: 'completed' }]);

    expect(matchStageStatus('workspace', verification)).toBe('completed');
    expect(matchStageStatus('plan', verification)).toBe('completed');
    expect(matchStageStatus('verification', verification)).toBe('completed');
    expect(matchStageStatus('evidence', verification)).toBe('pending');
  });

  it('keeps an explicit pending observation instead of inferring completion', () => {
    const pendingPlan = session([
      { step: 'plan', status: 'pending' },
      { step: 'verification', status: 'completed' },
    ]);

    expect(matchStageStatus('plan', pendingPlan)).toBe('pending');
  });

  it('returns pending for unknown stages, missing sessions, and unknown statuses', () => {
    expect(matchStageStatus('not-a-stage', session([{ step: 'plan', status: 'completed' }]))).toBe('pending');
    expect(matchStageStatus('plan', null)).toBe('pending');
    expect(matchStageStatus('plan', session([{ step: 'plan', status: 'unknown' }]))).toBe('pending');
  });
});
