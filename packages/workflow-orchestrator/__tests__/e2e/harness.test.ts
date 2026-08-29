import { afterEach, describe, expect, it } from 'vitest';
import { beforeEvent, expectEventSequence } from '../e2e-support/event-sequence';
import { createScenario, type WorkflowScenarioBuilder } from '../e2e-support/harness';

const scenarios: WorkflowScenarioBuilder[] = [];

afterEach(() => {
  for (const scenario of scenarios.splice(0)) scenario.dispose();
});

describe('WFO-E2E-001B scenario harness', () => {
  it('runs a successful governed workflow entirely in memory with no external calls', async () => {
    const scenario = await createScenario({
      objective: 'Add a health endpoint and tests',
      script: {
        tasks: [
          { taskSummary: 'Implement the health endpoint', artifacts: [{ changed: ['src/health.ts'] }] },
          { taskSummary: 'Add health endpoint tests', artifacts: [{ changed: ['src/health.test.ts'] }] },
        ],
      },
    });
    scenarios.push(scenario);

    // Guard against any provider or network access.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('scenario must not perform network calls');
    }) as typeof fetch;
    try {
      const project = await scenario.intake('Add a health endpoint and tests');
      await scenario.contextAssembly(project.id);
      await scenario.plan(project.id, [
        scenario.taskInput({ summary: 'Implement the health endpoint', files: ['src/health.ts'] }),
        scenario.taskInput({ summary: 'Add health endpoint tests', files: ['src/health.test.ts'] }),
      ]);
      await scenario.reviewPlan(project.id, 'approved');
      await scenario.approve(project.id);
      await scenario.execute(project.id);
      await scenario.verify(project.id, true);

      const snapshot = await scenario.snapshot(project.id);
      expect(snapshot.status).toBe('completed');
      expect(snapshot.phase).toBe('completed');
      expect(snapshot.tasks.every((task) => task.status === 'completed')).toBe(true);
      expect(scenario.provider.calls).toBe(2);
      expect(scenario.provider.unexpectedCalls).toEqual([]);
      expect(scenario.stages.current()).toBe('completed');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('records side effects, telemetry, and a replayable event stream', async () => {
    const scenario = await createScenario({
      objective: 'Add a health endpoint and tests',
      script: { tasks: [{ taskSummary: 'Implement the health endpoint' }] },
    });
    scenarios.push(scenario);

    const project = await scenario.intake('Add a health endpoint and tests');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement the health endpoint' })]);
    await scenario.reviewPlan(project.id, 'approved');
    await scenario.approve(project.id);
    await scenario.execute(project.id);
    await scenario.verify(project.id, true);

    const snapshot = await scenario.snapshot(project.id);
    const artifactKinds = snapshot.artifacts.map((artifact) => artifact.kind);
    expect(artifactKinds).toEqual(
      expect.arrayContaining(['analysis', 'plan', 'architecture', 'changeset', 'verification']),
    );
    expect(scenario.telemetry.count('task')).toBeGreaterThan(0);
    expect(scenario.events.typesFor(project.id)).toEqual(
      expect.arrayContaining([
        'project.created',
        'analysis.completed',
        'plan.generated',
        'task.created',
        'architecture.reviewed',
        'plan.approved',
        'task.completed',
        'verification.passed',
        'project.completed',
      ]),
    );
    // The event stream is deterministic and ordered.
    expectEventSequence(scenario.events.typesFor(project.id).map((type) => ({ type }))).toSatisfy([
      beforeEvent('plan.approved', 'task.completed'),
      beforeEvent('verification.passed', 'project.completed'),
    ]);
  });

  it('produces a shadow-mode observation after completion without mutating workflow state', async () => {
    const scenario = await createScenario({
      objective: 'Add a health endpoint and tests',
      script: { tasks: [{ taskSummary: 'Implement the health endpoint' }] },
    });
    scenarios.push(scenario);

    const project = await scenario.intake('Add a health endpoint and tests');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement the health endpoint' })]);
    await scenario.reviewPlan(project.id, 'approved');
    await scenario.approve(project.id);
    await scenario.execute(project.id);
    await scenario.verify(project.id, true);

    const beforeSnapshot = JSON.stringify(await scenario.snapshot(project.id));
    const observation = await scenario.observe(project.id);
    const afterSnapshot = JSON.stringify(await scenario.snapshot(project.id));

    expect(observation.observation.currentState).toBe('completed');
    expect(observation.observation.recommendedAction).toBe('complete');
    expect(observation.applied).toBe(false);
    expect(afterSnapshot).toBe(beforeSnapshot);
  });
});
