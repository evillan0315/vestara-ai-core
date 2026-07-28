import type { PolicyDefinition } from '@vestara/policy-types';
import { describe, expect, it } from 'vitest';
import { DefaultPolicyEngine } from '../src/default-policy-engine';
import { ConditionEvaluator } from '../src/evaluation/condition-evaluator';

function makeContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    user: { id: 'user-1', role: 'developer', groups: ['engineering'] },
    workspace: { id: 'ws-1', name: 'Test' },
    system: { currentHour: 14, currentDayOfWeek: 3, environment: 'development' },
    metadata: {},
    ...overrides,
  };
}

function allowPolicy(id: string, priority = 50): PolicyDefinition {
  return {
    id,
    name: `Allow ${id}`,
    version: 1,
    priority,
    scope: { level: 'global' },
    enabled: true,
    conditions: { type: 'comparison', field: 'user.role', operator: 'eq', value: 'developer' },
    actions: [{ type: 'allow' }],
    metadata: { author: 'test', tags: [], createdAt: '', updatedAt: '' },
  };
}

function denyPolicy(id: string, priority = 50): PolicyDefinition {
  return {
    id,
    name: `Deny ${id}`,
    version: 1,
    priority,
    scope: { level: 'global' },
    enabled: true,
    conditions: { type: 'comparison', field: 'user.role', operator: 'eq', value: 'developer' },
    actions: [{ type: 'deny', config: { reason: `Denied by ${id}` } }],
    metadata: { author: 'test', tags: [], createdAt: '', updatedAt: '' },
  };
}

describe('DefaultPolicyEngine', () => {
  describe('Determinism', () => {
    it('same request + same policies = same decision', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [denyPolicy('p1', 100)];

      const request: PolicyEvaluationRequest = { context, policies };
      const result1 = await engine.evaluate(request);
      const result2 = await engine.evaluate(request);

      expect(result1.result).toBe(result2.result);
      expect(result1.matchedPolicies.length).toBe(result2.matchedPolicies.length);
      expect(result1.matchedPolicies[0].policyId).toBe(result2.matchedPolicies[0].policyId);
    });

    it('deterministic across multiple evaluations with same inputs', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [
        allowPolicy('allow-all', 50),
        {
          ...denyPolicy('deny-prod', 100),
          conditions: { type: 'comparison', field: 'system.environment', operator: 'eq', value: 'production' } as const,
        },
      ];

      const request: PolicyEvaluationRequest = { context, policies };

      const results = await Promise.all(Array.from({ length: 10 }, () => engine.evaluate(request)));
      const first = results[0];
      for (const r of results) {
        expect(r.result).toBe(first.result);
        expect(r.matchedPolicies.length).toBe(first.matchedPolicies.length);
      }
    });

    it('clock is provided via context, not read internally', async () => {
      const engine = new DefaultPolicyEngine();
      const morning = makeContext({ system: { currentHour: 3, currentDayOfWeek: 1, environment: 'development' } });
      const afternoon = makeContext({ system: { currentHour: 14, currentDayOfWeek: 1, environment: 'development' } });

      const policy = {
        ...denyPolicy('night-only', 50),
        conditions: { type: 'comparison', field: 'system.currentHour', operator: 'gte', value: 12 } as const,
      };

      const morningResult = await engine.evaluate({ context: morning, policies: [policy] });
      const afternoonResult = await engine.evaluate({ context: afternoon, policies: [policy] });

      expect(morningResult.result).toBe('allow');
      expect(afternoonResult.result).toBe('deny');
    });
  });

  describe('Condition Evaluation', () => {
    it('AND composition — all conditions must match', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext({ repository: { id: 'repo-1', name: 'core', branch: 'main', isProtected: true } });

      const policy: PolicyDefinition = {
        ...denyPolicy('protected-main', 100),
        conditions: {
          type: 'and',
          conditions: [
            { type: 'comparison', field: 'repository.branch', operator: 'eq', value: 'main' },
            { type: 'comparison', field: 'repository.isProtected', operator: 'eq', value: true },
          ],
        },
      };

      const result = await engine.evaluate({ context, policies: [policy] });
      expect(result.result).toBe('deny');

      const unprotectedContext = makeContext({
        repository: { id: 'repo-1', name: 'core', branch: 'feature', isProtected: false },
      });
      const allowResult = await engine.evaluate({ context: unprotectedContext, policies: [policy] });
      expect(allowResult.result).toBe('allow');
    });

    it('OR composition — any condition can match', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext({ system: { currentHour: 14, currentDayOfWeek: 3, environment: 'production' } });

      const policy: PolicyDefinition = {
        ...denyPolicy('dangerous-ops', 100),
        conditions: {
          type: 'or',
          conditions: [
            { type: 'comparison', field: 'system.environment', operator: 'eq', value: 'production' },
            { type: 'comparison', field: 'system.environment', operator: 'eq', value: 'staging' },
          ],
        },
      };

      const result = await engine.evaluate({ context, policies: [policy] });
      expect(result.result).toBe('deny');
    });

    it('NOT composition — negates condition', async () => {
      const engine = new DefaultPolicyEngine();
      const admin = makeContext({ user: { id: 'admin-1', role: 'admin', groups: ['admins'] } });
      const dev = makeContext();

      const policy: PolicyDefinition = {
        ...denyPolicy('no-admin-bypass', 100),
        conditions: {
          type: 'not',
          condition: { type: 'comparison', field: 'user.role', operator: 'eq', value: 'admin' },
        },
      };

      const adminResult = await engine.evaluate({ context: admin, policies: [policy] });
      const devResult = await engine.evaluate({ context: dev, policies: [policy] });

      expect(adminResult.result).toBe('allow');
      expect(devResult.result).toBe('deny');
    });

    it('UNARY exists — field presence check', () => {
      const evaluator = new ConditionEvaluator();
      const withRepo = makeContext({ repository: { id: 'r1', name: 'r', isProtected: false } });
      const withoutRepo = makeContext();

      expect(evaluator.evaluate({ type: 'unary', operator: 'exists', field: 'repository' }, withRepo)).toBe(true);
      expect(evaluator.evaluate({ type: 'unary', operator: 'exists', field: 'repository' }, withoutRepo)).toBe(false);
    });

    it('IN — field membership check', () => {
      const evaluator = new ConditionEvaluator();
      const context = makeContext({ repository: { id: 'r1', name: 'r', branch: 'main', isProtected: true } });

      expect(
        evaluator.evaluate(
          { type: 'in', field: 'repository.branch', values: ['main', 'master'], negate: false },
          context,
        ),
      ).toBe(true);

      expect(
        evaluator.evaluate({ type: 'in', field: 'repository.branch', values: ['develop'], negate: false }, context),
      ).toBe(false);
    });

    it('comparison operators work correctly', () => {
      const evaluator = new ConditionEvaluator();
      const context = makeContext({ runtime: { id: 'r1', type: 'docker', tags: { env: 'prod' } } });

      expect(
        evaluator.evaluate({ type: 'comparison', field: 'runtime.type', operator: 'eq', value: 'docker' }, context),
      ).toBe(true);
      expect(
        evaluator.evaluate({ type: 'comparison', field: 'runtime.type', operator: 'neq', value: 'docker' }, context),
      ).toBe(false);
      expect(
        evaluator.evaluate({ type: 'comparison', field: 'runtime.tags.env', operator: 'eq', value: 'prod' }, context),
      ).toBe(true);
      expect(
        evaluator.evaluate({ type: 'comparison', field: 'runtime.tags.env', operator: 'eq', value: 'dev' }, context),
      ).toBe(false);
    });
  });

  describe('Conflict Resolution', () => {
    it('deny_overrides: one deny wins', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [allowPolicy('allow-all', 30), denyPolicy('deny-all', 50)];

      const result = await engine.evaluate({
        context,
        policies,
        metadata: { compositionStrategy: 'deny_overrides' },
      });
      expect(result.result).toBe('deny');
    });

    it('allow_overrides: one allow wins', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [denyPolicy('deny-all', 50), allowPolicy('allow-all', 30)];

      const result = await engine.evaluate({
        context,
        policies,
        metadata: { compositionStrategy: 'allow_overrides' },
      });
      expect(result.result).toBe('allow');
    });

    it('most_restrictive: deny > modify > allow', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const modifyPolicy: PolicyDefinition = {
        ...allowPolicy('modify-priority', 50),
        actions: [{ type: 'modify_priority', config: { reason: 'lower', priority: 1 } }],
      };

      const result = await engine.evaluate({
        context,
        policies: [allowPolicy('allow-all', 50), modifyPolicy, denyPolicy('deny-all', 50)],
        metadata: { compositionStrategy: 'most_restrictive' },
      });
      expect(result.result).toBe('deny');
    });

    it('priority_ordered: highest priority wins', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [allowPolicy('allow-low', 10), denyPolicy('deny-high', 100)];

      const result = await engine.evaluate({
        context,
        policies,
        metadata: { compositionStrategy: 'priority_ordered' },
      });
      expect(result.result).toBe('deny');
    });

    it('first_match: first policy in list wins', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [allowPolicy('allow-first', 50), denyPolicy('deny-second', 100)];

      const result = await engine.evaluate({
        context,
        policies,
        metadata: { compositionStrategy: 'first_match' },
      });
      expect(result.result).toBe('allow');
    });
  });

  describe('Modifications', () => {
    it('modify_priority action produces modifications', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policy: PolicyDefinition = {
        ...allowPolicy('priority-adjust', 50),
        actions: [{ type: 'modify_priority', config: { reason: 'Lower priority', priority: 1 } }],
      };

      const result = await engine.evaluate({ context, policies: [policy] });
      expect(result.result).toBe('modify');
      expect(result.modifications.length).toBeGreaterThan(0);
      expect(result.modifications[0].field).toBe('spec.priority');
      expect(result.modifications[0].newValue).toBe(1);
    });

    it('delay action produces modifications', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policy: PolicyDefinition = {
        ...allowPolicy('deployment-window', 50),
        actions: [{ type: 'delay', config: { reason: 'Outside window', delayMs: 28800000 } }],
      };

      const result = await engine.evaluate({ context, policies: [policy] });
      expect(result.result).toBe('modify');
      expect(result.modifications[0].field).toBe('spec.delayMs');
      expect(result.modifications[0].newValue).toBe(28800000);
    });
  });

  describe('Audit trail', () => {
    it('decision includes all matched policies', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const policies = [allowPolicy('policy-a', 30), allowPolicy('policy-b', 40)];

      const result = await engine.evaluate({ context, policies });
      expect(result.matchedPolicies.length).toBeGreaterThanOrEqual(1);
      expect(result.matchedPolicies.map((m) => m.policyId)).toContain('policy-b');
    });

    it('decision includes skipped policies and reasons', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext({ user: { id: 'admin-1', role: 'admin', groups: ['admins'] } });

      const adminOnly: PolicyDefinition = {
        ...denyPolicy('admin-only', 100),
        conditions: { type: 'comparison', field: 'user.role', operator: 'eq', value: 'admin' },
      };

      const result = await engine.evaluate({ context, policies: [adminOnly] });
      expect(result.matchedPolicies.length).toBe(1);
    });

    it('disabled policies are skipped', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const disabled: PolicyDefinition = {
        ...denyPolicy('disabled-policy', 100),
        enabled: false,
      };

      const result = await engine.evaluate({ context, policies: [disabled] });
      expect(result.result).toBe('allow');
      expect(result.skippedPolicies.length).toBe(1);
      expect(result.skippedPolicies[0].policyId).toBe('disabled-policy');
      expect(result.skippedPolicies[0].reason).toBe('Policy disabled');
    });
  });

  describe('Edge cases', () => {
    it('no matching policies returns allow with empty matched list', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();

      const noMatch: PolicyDefinition = {
        ...denyPolicy('never-match', 100),
        conditions: { type: 'comparison', field: 'user.role', operator: 'eq', value: 'nonexistent' },
      };

      const result = await engine.evaluate({ context, policies: [noMatch] });
      expect(result.result).toBe('allow');
      expect(result.matchedPolicies).toHaveLength(0);
    });

    it('complex condition tree evaluates correctly', () => {
      const evaluator = new ConditionEvaluator();
      const context = makeContext({
        user: { id: 'dev-1', role: 'developer', groups: ['engineering'] },
        repository: { id: 'repo-1', name: 'core', branch: 'main', isProtected: true },
      });

      const tree = {
        type: 'and' as const,
        conditions: [
          {
            type: 'or' as const,
            conditions: [
              { type: 'comparison' as const, field: 'repository.branch', operator: 'eq' as const, value: 'main' },
              { type: 'comparison' as const, field: 'repository.branch', operator: 'eq' as const, value: 'master' },
            ],
          },
          {
            type: 'not' as const,
            condition: { type: 'comparison' as const, field: 'user.role', operator: 'eq' as const, value: 'admin' },
          },
        ],
      };

      expect(evaluator.evaluate(tree, context)).toBe(true);
    });
  });

  describe('Order independence', () => {
    it('identical priority policies produce same result regardless of order (deny_overrides)', async () => {
      const engine = new DefaultPolicyEngine();
      const context = makeContext();
      const a = allowPolicy('a', 50);
      const b = allowPolicy('b', 50);

      const r1 = await engine.evaluate({ context, policies: [a, b] });
      const r2 = await engine.evaluate({ context, policies: [b, a] });

      expect(r1.result).toBe(r2.result);
    });
  });
});
