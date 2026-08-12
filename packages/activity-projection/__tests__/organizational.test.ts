import { describe, expect, it } from 'vitest';
import type { AcceptanceActivity } from '../src/contracts.js';
import { ActivityProjectionService, InMemoryActivityStore } from '../src/index.js';
import { sourceEvent } from './helpers.js';

async function service() {
  const store = new InMemoryActivityStore();
  return new ActivityProjectionService({ store });
}

describe('OrganizationalProjector', () => {
  it('projects the acceptance boundary as observable organizational state', async () => {
    const projection = await service();
    const boundary = {
      workflowId: 'wf-1',
      objective: 'A visual change approved by the Director must survive reload.',
      obligations: ['the approved change is reconstructed after reload'],
      materialUncertainties: ['whether "reload" includes cold restart'],
      derivedBy: 'planner',
      conditional: true,
    };
    const records = await projection.project(
      sourceEvent({
        type: 'acceptance.boundary',
        workflowId: 'wf-1',
        actorId: 'multi-agent-workflow',
        authority: 'system',
        payload: { workflowId: 'wf-1', boundary },
      }),
    );
    const acceptance = records.find((record) => record.kind === 'acceptance') as AcceptanceActivity | undefined;
    expect(acceptance).toBeDefined();
    expect(acceptance?.objective).toContain('visual change');
    expect(acceptance?.obligations).toEqual(['the approved change is reconstructed after reload']);
    expect(acceptance?.materialUncertainties).toHaveLength(1);
    expect(acceptance?.conditional).toBe(true);
    expect(acceptance?.derivedBy).toBe('planner');
    expect(acceptance?.workflowId).toBe('wf-1');
  });

  it('projects workflow.started as a workflow activity', async () => {
    const projection = await service();
    const records = await projection.project(
      sourceEvent({
        type: 'workflow.started',
        workflowId: 'wf-1',
        payload: {
          workflowId: 'wf-1',
          goal: 'The generated configuration must remain active after restart.',
          stages: [{ role: 'planner' }],
        },
      }),
    );
    const workflow = records.find((record) => record.kind === 'workflow');
    expect(workflow).toBeDefined();
    if (workflow?.kind === 'workflow') {
      expect(workflow.currentState).toBe('started');
      expect(workflow.reason).toContain('The generated configuration');
    }
  });

  it('projects workflow.completed with conditional acceptance distinct from execution completion', async () => {
    const projection = await service();
    const conditional = await projection.project(
      sourceEvent({
        type: 'workflow.completed',
        workflowId: 'wf-1',
        payload: { workflowId: 'wf-1', conditional: true, acceptance: { conditional: true } },
      }),
    );
    const conditionalWorkflow = conditional.find((record) => record.kind === 'workflow');
    if (conditionalWorkflow?.kind === 'workflow') {
      // Execution completed; epistemic state is conditional — kept distinct.
      expect(conditionalWorkflow.currentState).toBe('completed');
      expect(conditionalWorkflow.reason).toContain('CONDITIONAL');
    }
  });

  it('does not claim a boundary when none was emitted', async () => {
    const projection = await service();
    const records = await projection.project(
      sourceEvent({ type: 'harness.turn.started', workflowId: 'wf-1', payload: { threadId: 't-1' } }),
    );
    expect(records.find((record) => record.kind === 'acceptance')).toBeUndefined();
  });
});
