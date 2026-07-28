import { describe, expect, it } from 'vitest';
import { PolicyError } from '../src/errors';
import type {
  ActionType,
  ComparisonExpression,
  ComparisonOperator,
  CompositionStrategy,
  ConflictInput,
  ConflictResolution,
  ConflictResolver,
  ExpressionNode,
  InExpression,
  LogicalExpression,
  LogicalOperator,
  MatchedPolicy,
  NotExpression,
  PolicyAction,
  PolicyContext,
  PolicyDecision,
  PolicyDecisionRecord,
  PolicyDefinition,
  PolicyEngine,
  PolicyEvaluationRequest,
  PolicyModification,
  PolicyRepository,
  PolicyResult,
  PolicyScope,
  ScopeLevel,
  SkippedPolicy,
  UnaryExpression,
  UnaryOperator,
} from '../src/index';

describe('@vestara/policy-types', () => {
  describe('PolicyDefinition', () => {
    it('can define a valid policy', () => {
      const policy: PolicyDefinition = {
        id: 'test.policy.1',
        name: 'Test Policy',
        version: 1,
        priority: 100,
        scope: { level: 'global' },
        enabled: true,
        conditions: {
          type: 'comparison',
          field: 'job.spec.branch',
          operator: 'eq',
          value: 'main',
        },
        actions: [
          {
            type: 'deny',
            config: { reason: 'Protected branch' },
          },
        ],
        metadata: {
          author: 'system',
          tags: ['security'],
          createdAt: '2026-07-27T00:00:00.000Z',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      };
      expect(policy.id).toBe('test.policy.1');
      expect(policy.actions.length).toBe(1);
    });

    it('can define a policy with compound conditions', () => {
      const conditions: ExpressionNode = {
        type: 'and',
        conditions: [
          {
            type: 'or',
            conditions: [
              { type: 'comparison', field: 'job.spec.operation', operator: 'eq', value: 'delete' },
              { type: 'comparison', field: 'job.spec.operation', operator: 'eq', value: 'force_push' },
            ],
          },
          { type: 'comparison', field: 'job.spec.branch', operator: 'eq', value: 'main' },
          { type: 'not', condition: { type: 'comparison', field: 'user.role', operator: 'eq', value: 'admin' } },
        ],
      };
      const policy: PolicyDefinition = {
        id: 'test.compound',
        name: 'Compound Test',
        version: 1,
        priority: 50,
        scope: { level: 'workspace', targets: [{ type: 'workspace', id: 'ws-1' }] },
        enabled: true,
        conditions,
        actions: [{ type: 'audit_only' }],
        metadata: { author: 'test', tags: [], createdAt: '', updatedAt: '' },
      };
      expect(policy.conditions.type).toBe('and');
      if (policy.conditions.type === 'and') {
        expect(policy.conditions.conditions.length).toBe(3);
      }
    });
  });

  describe('ExpressionNode', () => {
    it('supports comparison expressions', () => {
      const expr: ComparisonExpression = {
        type: 'comparison',
        field: 'runtime.monthlyCost',
        operator: 'gt',
        value: 100,
      };
      expect(expr.operator).toBe('gt');
    });

    it('supports logical expressions', () => {
      const expr: LogicalExpression = {
        type: 'and',
        conditions: [],
      };
      expect(expr.conditions).toEqual([]);
    });

    it('supports not expressions', () => {
      const inner: ComparisonExpression = { type: 'comparison', field: 'a', operator: 'eq', value: 1 };
      const expr: NotExpression = { type: 'not', condition: inner };
      expect(expr.condition.type).toBe('comparison');
    });

    it('supports unary expressions', () => {
      const expr: UnaryExpression = { type: 'unary', operator: 'exists', field: 'repository.branch' };
      expect(expr.operator).toBe('exists');
    });

    it('supports in expressions', () => {
      const expr: InExpression = {
        type: 'in',
        field: 'job.spec.provider',
        values: ['openai', 'anthropic'],
        negate: false,
      };
      expect(expr.values).toContain('openai');
    });
  });

  describe('PolicyAction', () => {
    it('supports all action types', () => {
      const actions: PolicyAction[] = [
        { type: 'allow' },
        { type: 'deny', config: { reason: 'denied' } },
        { type: 'require_approval', config: { reason: 'approve', approvalRole: 'manager' } },
        { type: 'modify_priority', config: { reason: 'reprioritize', priority: 1 } },
        { type: 'modify_retry', config: { reason: 'retry', maxRetries: 3, retryDelayMs: 1000 } },
        { type: 'delay', config: { reason: 'wait', delayMs: 5000 } },
        { type: 'inject_metadata', config: { reason: 'annotate', metadata: { key: 'value' } } },
        { type: 'request_verify', config: { reason: 'verify', verificationLevel: 'high' } },
        { type: 'escalate', config: { reason: 'escalate', escalationTarget: 'admin' } },
        { type: 'audit_only' },
      ];
      expect(actions.length).toBe(10);
    });
  });

  describe('PolicyScope', () => {
    it('supports all scope levels', () => {
      const levels: ScopeLevel[] = ['global', 'organization', 'workspace', 'project', 'runtime'];
      const scopes: PolicyScope[] = levels.map((level) => ({ level }));
      expect(scopes.length).toBe(5);
    });

    it('supports targeted scopes', () => {
      const scope: PolicyScope = {
        level: 'workspace',
        targets: [{ type: 'workspace', id: 'ws-123' }],
      };
      expect(scope.targets![0].id).toBe('ws-123');
    });
  });

  describe('PolicyContext', () => {
    it('is fully readonly', () => {
      const context: PolicyContext = {
        user: { id: 'user-1', role: 'developer', groups: ['engineering'] },
        workspace: { id: 'ws-1', organizationId: 'org-1', name: 'Test Workspace' },
        repository: { id: 'repo-1', name: 'test-repo', branch: 'main', isProtected: true },
        system: { currentHour: 14, currentDayOfWeek: 3, environment: 'production' },
        runtime: { id: 'rt-1', type: 'docker', monthlyCost: 50, tags: { env: 'prod' } },
        metadata: { requestId: 'req-123' },
      };
      expect(context.user.role).toBe('developer');
    });
  });

  describe('PolicyEvaluationRequest', () => {
    it('carries context and policies', () => {
      const request: PolicyEvaluationRequest = {
        context: {
          user: { id: 'u', role: 'dev', groups: [] },
          workspace: { id: 'w', name: 'W' },
          system: { currentHour: 10, currentDayOfWeek: 1, environment: 'dev' },
          metadata: {},
        },
        policies: [],
      };
      expect(request.policies).toEqual([]);
    });
  });

  describe('PolicyDecision', () => {
    it('supports allow result', () => {
      const decision: PolicyDecision = {
        id: 'dec-1',
        result: 'allow',
        matchedPolicies: [],
        skippedPolicies: [],
        conflictsResolved: [],
        actionsApplied: [],
        modifications: [],
        reason: 'All policies passed',
        evaluationDurationMs: 5,
        evaluatedAt: '2026-07-27T00:00:00.000Z',
      };
      expect(decision.result).toBe('allow');
    });

    it('supports deny result with matched policies', () => {
      const matched: MatchedPolicy = {
        policyId: 'repo.protected',
        policyVersion: 1,
        priority: 100,
        actionType: 'deny',
        reason: 'Protected branch',
      };
      const decision: PolicyDecision = {
        id: 'dec-2',
        result: 'deny',
        matchedPolicies: [matched],
        skippedPolicies: [],
        conflictsResolved: [],
        actionsApplied: [{ policyId: 'repo.protected', actionType: 'deny' }],
        modifications: [],
        reason: 'Denied by policy: Protected branch',
        evaluationDurationMs: 3,
        evaluatedAt: '2026-07-27T00:00:00.000Z',
      };
      expect(decision.matchedPolicies[0].actionType).toBe('deny');
    });

    it('supports modify result with modifications', () => {
      const mod: PolicyModification = {
        field: 'spec.priority',
        oldValue: 5,
        newValue: 1,
        source: 'policy.delay',
      };
      const decision: PolicyDecision = {
        id: 'dec-3',
        result: 'modify',
        matchedPolicies: [
          {
            policyId: 'policy.delay',
            policyVersion: 1,
            priority: 50,
            actionType: 'modify_priority',
            reason: 'Outside window',
          },
        ],
        skippedPolicies: [],
        conflictsResolved: [],
        actionsApplied: [{ policyId: 'policy.delay', actionType: 'modify_priority', config: { priority: 1 } }],
        modifications: [mod],
        reason: 'Job modified by policy: Outside deployment window',
        evaluationDurationMs: 4,
        evaluatedAt: '2026-07-27T00:00:00.000Z',
      };
      expect(decision.modifications[0].newValue).toBe(1);
    });

    it('tracks skipped policies', () => {
      const skipped: SkippedPolicy = {
        policyId: 'policy.unrelated',
        policyVersion: 2,
        reason: 'Conditions not met',
      };
      const decision: PolicyDecision = {
        id: 'dec-4',
        result: 'allow',
        matchedPolicies: [],
        skippedPolicies: [skipped],
        conflictsResolved: [],
        actionsApplied: [],
        modifications: [],
        reason: 'No matching policies',
        evaluationDurationMs: 2,
        evaluatedAt: '2026-07-27T00:00:00.000Z',
      };
      expect(decision.skippedPolicies[0].reason).toBe('Conditions not met');
    });

    it('tracks conflict resolution', () => {
      const conflict: ConflictResolution = {
        betweenPolicies: ['policy.allow_all', 'policy.deny_all'],
        strategy: 'deny_overrides',
        resolution: 'deny_overrides: deny_all wins',
      };
      const decision: PolicyDecision = {
        id: 'dec-5',
        result: 'deny',
        matchedPolicies: [],
        skippedPolicies: [],
        conflictsResolved: [conflict],
        actionsApplied: [],
        modifications: [],
        reason: 'Conflict resolved: deny_overrides',
        evaluationDurationMs: 3,
        evaluatedAt: '2026-07-27T00:00:00.000Z',
      };
      expect(decision.conflictsResolved[0].strategy).toBe('deny_overrides');
    });
  });

  describe('PolicyDecisionRecord', () => {
    it('wraps decision with metadata', () => {
      const decision: PolicyDecision = {
        id: 'dec-6',
        result: 'allow',
        matchedPolicies: [],
        skippedPolicies: [],
        conflictsResolved: [],
        actionsApplied: [],
        modifications: [],
        reason: '',
        evaluationDurationMs: 0,
        evaluatedAt: '',
      };
      const record: PolicyDecisionRecord = {
        decision,
        requestId: 'req-456',
        recordedAt: '2026-07-27T00:00:00.000Z',
      };
      expect(record.requestId).toBe('req-456');
    });
  });

  describe('PolicyEngine interface', () => {
    it('defines evaluate method', () => {
      const engine: PolicyEngine = {
        async evaluate() {
          return {
            id: 'dec',
            result: 'allow',
            matchedPolicies: [],
            skippedPolicies: [],
            conflictsResolved: [],
            actionsApplied: [],
            modifications: [],
            reason: '',
            evaluationDurationMs: 0,
            evaluatedAt: '',
          };
        },
      };
      expect(typeof engine.evaluate).toBe('function');
    });
  });

  describe('PolicyRepository interface', () => {
    it('defines repository methods', () => {
      const repo: PolicyRepository = {
        async get() {
          return null;
        },
        async list() {
          return [];
        },
        async find() {
          return [];
        },
      };
      expect(typeof repo.get).toBe('function');
      expect(typeof repo.list).toBe('function');
      expect(typeof repo.find).toBe('function');
    });
  });

  describe('ConflictResolver interface', () => {
    it('defines resolve method', () => {
      const resolver: ConflictResolver = {
        resolve(input: ConflictInput) {
          return input.decisions[0];
        },
      };
      expect(typeof resolver.resolve).toBe('function');
    });
  });

  describe('Error types', () => {
    it('PolicyError has code and message', () => {
      const err = new PolicyError('TEST', 'test error');
      expect(err.code).toBe('TEST');
      expect(err.message).toBe('test error');
    });
  });

  describe('Type exports are real types', () => {
    it('PolicyResult is a string union', () => {
      const results: PolicyResult[] = ['allow', 'deny', 'modify'];
      expect(results.length).toBe(3);
    });

    it('ActionType is a string union', () => {
      const types: ActionType[] = [
        'allow',
        'deny',
        'require_approval',
        'modify_priority',
        'modify_retry',
        'delay',
        'inject_metadata',
        'request_verify',
        'escalate',
        'audit_only',
      ];
      expect(types.length).toBe(10);
    });

    it('ComparisonOperator is a string union', () => {
      const ops: ComparisonOperator[] = [
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'contains',
        'matches',
        'startsWith',
        'endsWith',
      ];
      expect(ops.length).toBe(10);
    });

    it('LogicalOperator is a string union', () => {
      const ops: LogicalOperator[] = ['and', 'or'];
      expect(ops.length).toBe(2);
    });

    it('UnaryOperator is a string union', () => {
      const ops: UnaryOperator[] = ['exists', 'not_exists'];
      expect(ops.length).toBe(2);
    });

    it('CompositionStrategy is a string union', () => {
      const strategies: CompositionStrategy[] = [
        'deny_overrides',
        'allow_overrides',
        'priority_ordered',
        'first_match',
        'most_restrictive',
        'merge',
        'consensus',
      ];
      expect(strategies.length).toBe(7);
    });

    it('ScopeLevel is a string union', () => {
      const levels: ScopeLevel[] = ['global', 'organization', 'workspace', 'project', 'runtime'];
      expect(levels.length).toBe(5);
    });
  });
});
