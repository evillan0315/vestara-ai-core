import { afterEach, describe, expect, it } from 'vitest';
import { createScenario, type WorkflowScenarioBuilder } from '../e2e-support/harness';
import { validateStageTransition } from '../e2e-support/lifecycle';

const scenarios: WorkflowScenarioBuilder[] = [];

afterEach(() => {
  for (const scenario of scenarios.splice(0)) scenario.dispose();
});

describe('WFO-E2E-001C plan and review flow', () => {
  it('never starts implementation tasks before plan approval', async () => {
    const scenario = await createScenario({ objective: 'Add a health endpoint' });
    scenarios.push(scenario);

    const project = await scenario.intake('Add a health endpoint');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement the endpoint' })]);
    await scenario.reviewPlan(project.id, 'approved'); // phase: pending-approval

    const snapshot = await scenario.snapshot(project.id);
    expect(snapshot.tasks.every((task) => task.status === 'pending')).toBe(true);
    await expect(scenario.orchestrator.runExecution(project.id)).rejects.toThrow(/not executing/i);
    expect(scenario.provider.calls).toBe(0);
    expect(scenario.provider.unexpectedCalls).toEqual([]);
  });

  it('preserves the original plan and versions a revised plan after changes are requested', async () => {
    const scenario = await createScenario({ objective: 'Add a health endpoint' });
    scenarios.push(scenario);

    const project = await scenario.intake('Add a health endpoint');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement' })]);

    const original = (await scenario.snapshot(project.id)).plan!;
    await scenario.reviewPlan(project.id, 'violations'); // → changes-requested → planning

    const afterViolations = await scenario.snapshot(project.id);
    expect(afterViolations.phase).toBe('planning');
    const originalAfter = (await scenario.plans.get(original.id))!;
    expect(originalAfter.id).toBe(original.id);
    expect(originalAfter.status).toBe('needs-revision');

    // A revised plan is a new version record, never a rewrite of the original.
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement (with tests)' })]);
    const plans = await scenario.plans.listForProject(project.id);
    expect(plans).toHaveLength(2);
    expect(plans[0].id).toBe(original.id);
    expect(plans[1].id).not.toBe(original.id);

    // Findings reference the reviewed plan version.
    const architectureArtifacts = (await scenario.snapshot(project.id)).artifacts.filter(
      (artifact) => artifact.kind === 'architecture',
    );
    expect(architectureArtifacts.length).toBeGreaterThan(0);
    expect(architectureArtifacts[0]?.planId).toBe(original.id);
  });

  it('runs the plan revision loop and then authorizes the approved version', async () => {
    const scenario = await createScenario({ objective: 'Add a health endpoint' });
    scenarios.push(scenario);

    const project = await scenario.intake('Add a health endpoint');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement' })]);
    await scenario.reviewPlan(project.id, 'violations');
    expect(scenario.stages.current()).toBe('changes-requested');

    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement (revised)' })]);
    expect(scenario.stages.current()).toBe('planning');

    await scenario.reviewPlan(project.id, 'approved');
    expect(scenario.stages.current()).toBe('review-pending');

    await scenario.approve(project.id);
    expect(scenario.stages.current()).toBe('approved');
    // No implementation task has run at any point before authorization.
    expect(scenario.provider.calls).toBe(0);
    expect(scenario.provider.unexpectedCalls).toEqual([]);
  });

  it('models rejection and indeterminate plan review as canonical review outcomes', () => {
    // The current orchestrator review supports approved/violations; rejected and
    // indeterminate are canonical contracts that review agents may later produce.
    expect(validateStageTransition('review-pending', 'rejected').allowed).toBe(true);
    expect(validateStageTransition('review-pending', 'indeterminate').allowed).toBe(true);
    expect(validateStageTransition('changes-requested', 'rejected').allowed).toBe(true);
    // Rejected plans cannot leap to execution.
    expect(validateStageTransition('rejected', 'approved').allowed).toBe(false);
  });
});
