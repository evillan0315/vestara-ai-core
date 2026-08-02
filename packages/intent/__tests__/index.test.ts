import { describe, expect, it } from 'vitest';
import type { IntentId } from '../src/index';
import { IntentManager, Planner } from '../src/index';

describe('IntentManager lifecycle', () => {
  it('submits an intent in the submitted state with medium priority default', () => {
    const manager = new IntentManager();
    const intent = manager.submit({ goal: 'Add OAuth to the API', owner: 'runner-1' });
    expect(intent.state).toBe('submitted');
    expect(intent.priority).toBe('medium');
    expect(intent.info.owner).toBe('runner-1');
  });

  it('plans an intent and moves it to executing with an approved-able plan', () => {
    const manager = new IntentManager();
    const intent = manager.submit({ goal: 'Implement login feature', owner: 'runner-1' });
    const plan = manager.plan(intent.id, { maxJobs: 3 });

    expect(plan).not.toBeNull();
    expect(plan?.steps.length ?? 0).toBeGreaterThan(0);
    expect(plan?.jobs.length).toBeGreaterThan(0);
    expect(intent.state).toBe('executing');
    expect(plan?.approved).toBe(false);

    manager.approve(intent.id);
    expect(intent.plan?.approved).toBe(true);
  });

  it('completes an intent when criteria are met', () => {
    const manager = new IntentManager();
    const intent = manager.submit({
      goal: 'Add authentication',
      owner: 'runner-1',
      successCriteria: [{ id: 'c1', description: 'Login works', measurable: true, met: false }],
    });
    manager.plan(intent.id);
    manager.complete(intent.id, true);
    expect(intent.state).toBe('completed');
    expect(intent.completedAt).not.toBeNull();
  });

  it('fails an intent with an error message', () => {
    const manager = new IntentManager();
    const intent = manager.submit({ goal: 'Deploy the service', owner: 'runner-1' });
    manager.fail(intent.id, 'provider unavailable');
    expect(intent.state).toBe('failed');
    expect(intent.error).toBe('provider unavailable');
  });

  it('cancels a submitted intent', () => {
    const manager = new IntentManager();
    const intent = manager.submit({ goal: 'Delete the feature', owner: 'runner-1' });
    manager.cancel(intent.id, 'out of scope');
    expect(intent.state).toBe('cancelled');
  });

  it('pauses and resumes an executing intent', () => {
    const manager = new IntentManager();
    const intent = manager.submit({ goal: 'Implement feature', owner: 'runner-1' });
    manager.plan(intent.id);
    manager.pause(intent.id, 'waiting for approval');
    expect(intent.state).toBe('paused');
    manager.resume(intent.id);
    expect(intent.state).toBe('executing');
  });

  it('lists intents and exposes info', () => {
    const manager = new IntentManager();
    const a = manager.submit({ goal: 'One', owner: 'r1' });
    const b = manager.submit({ goal: 'Two', owner: 'r2' });
    expect(manager.list()).toHaveLength(2);
    expect(manager.getInfo(a.id)).not.toBeNull();
    expect(manager.listByStatus('submitted')).toHaveLength(2);
    expect(manager.hasActiveIntents()).toBe(true);
  });
});

describe('Planner', () => {
  it('produces a deterministic plan for a goal', () => {
    const planner = new Planner();
    const p1 = planner.plan('Implement the OAuth API service');
    const p2 = planner.plan('Implement the OAuth API service');
    expect(p1.jobs).toEqual(p2.jobs);
    expect(p1.dependencies).toEqual(p2.dependencies);
    expect(p1.jobs.length).toBeGreaterThan(0);
  });

  it('builds a dependency graph respecting step ordering', () => {
    const planner = new Planner();
    const plan = planner.plan('Implement the API service');
    for (const dep of plan.dependencies) {
      const fromIdx = plan.jobs.indexOf(dep.from);
      const toIdx = plan.jobs.indexOf(dep.to);
      expect(fromIdx).toBeLessThan(toIdx);
    }
    expect(plan.estimatedDuration).toBeGreaterThan(0);
  });

  it('honors a maxJobs constraint', () => {
    const planner = new Planner();
    const full = planner.plan('Implement the API service');
    const limited = planner.plan('Implement the API service', { maxJobs: 2 });
    expect(limited.jobs.length).toBeLessThanOrEqual(2);
    expect(limited.jobs.length).toBeLessThan(full.jobs.length);
  });

  it('has steps with capabilities and ids matching the plan', () => {
    const planner = new Planner();
    const plan = planner.plan('Verify the implementation');
    expect(plan.steps.length).toBe(plan.jobs.length);
    for (const step of plan.steps) {
      expect(step.capabilities.length).toBeGreaterThan(0);
      expect(plan.jobs).toContain(step.id);
    }
  });

  it('has no dangling dependency references', () => {
    const planner = new Planner();
    const plan = planner.plan('Implement and verify feature');
    for (const dep of plan.dependencies) {
      expect(plan.jobs).toContain(dep.from);
      expect(plan.jobs).toContain(dep.to);
    }
  });
});

describe('Intent model guards', () => {
  it('cannot transition from submitted directly to completed', () => {
    const intent = new IntentManager().submit({ goal: 'g', owner: 'o' });
    expect(() => intent.complete()).toThrow();
  });

  it('marking all criteria met makes the intent fulfilled', () => {
    const manager = new IntentManager();
    const intent = manager.submit({
      goal: 'Ship the release',
      owner: 'runner',
      successCriteria: [
        { id: 'c1', description: 'builds', measurable: true, met: false },
        { id: 'c2', description: 'tests pass', measurable: true, met: false },
      ],
    });
    expect(intent.isFulfilled()).toBe(false);
    manager.markCriterionMet(intent.id as IntentId, 'c1');
    manager.markCriterionMet(intent.id as IntentId, 'c2');
    expect(intent.isFulfilled()).toBe(true);
  });
});
