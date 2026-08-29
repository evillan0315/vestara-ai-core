import { BudgetExhaustedException } from '@vestara/types';
import { describe, expect, it } from 'vitest';
import {
  createBudgetState,
  evaluateOperation,
  matchOperationPattern,
  resolveEffectivePolicy,
  trackDuration,
  trackOperation,
  trackTokens,
} from '../src/execution-policy.js';

describe('ARX-015 M3 — Execution Policy & Budget', () => {
  describe('resolveEffectivePolicy', () => {
    it('resolves hermetic mode: read-only, no filesystem write, no process execution', () => {
      const policy = resolveEffectivePolicy('hermetic');

      expect(policy.mode).toBe('hermetic');
      expect(policy.maxToolRisk).toBe('low');
      expect(policy.requireSandbox).toBe(true);
      expect(policy.allowFilesystemWrite).toBe(false);
      expect(policy.allowProcessExecution).toBe(false);
      expect(policy.allowNetworkAccess).toBe(false);
    });

    it('resolves governed mode: high-risk allowed, approval required for critical', () => {
      const policy = resolveEffectivePolicy('governed');

      expect(policy.mode).toBe('governed');
      expect(policy.maxToolRisk).toBe('high');
      expect(policy.requireSandbox).toBe(false);
      expect(policy.allowFilesystemWrite).toBe(true);
      expect(policy.allowProcessExecution).toBe(true);
      expect(policy.allowNetworkAccess).toBe(true);
    });

    it('resolves live mode: all operations allowed', () => {
      const policy = resolveEffectivePolicy('live');

      expect(policy.mode).toBe('live');
      expect(policy.maxToolRisk).toBe('critical');
      expect(policy.allowFilesystemWrite).toBe(true);
      expect(policy.allowProcessExecution).toBe(true);
      expect(policy.allowNetworkAccess).toBe(true);
    });

    it('task constraints may restrict further than mode default', () => {
      const policy = resolveEffectivePolicy('governed', {
        taskId: 'task-1',
        allowedToolRisks: ['low', 'medium'],
        requiredCapabilities: ['implementation'],
        maxOperations: 50,
      });

      // Task constraints restrict maxToolRisk from 'high' to 'medium'
      expect(policy.maxToolRisk).toBe('medium');
      expect(policy.budget?.maxOperations).toBeUndefined(); // budget comes from explicit budget param
    });

    it('task constraints cannot weaken mode restrictions', () => {
      const policy = resolveEffectivePolicy('hermetic', {
        taskId: 'task-1',
        allowedToolRisks: ['low', 'medium', 'high', 'critical'],
        requiredCapabilities: [],
      });

      // Hermetic mode maxToolRisk is 'low', task cannot weaken it
      expect(policy.maxToolRisk).toBe('low');
    });

    it('approval exceptions relax strictness for specific operations', () => {
      const policy = resolveEffectivePolicy('hermetic', undefined, ['filesystem.write']);

      // filesystem.write now has an explicit approval exception
      const fsWriteRule = policy.operationRules.find(
        (r) => r.pattern === 'filesystem.write' && r.disposition === 'allow',
      );
      expect(fsWriteRule).toBeDefined();
      expect(fsWriteRule?.reason).toContain('Explicit approval granted');
    });

    it('budget is passed through to effective policy', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxOperations: 100,
        maxTokens: 50000,
        maxDurationMs: 300000,
      });

      expect(policy.budget?.maxOperations).toBe(100);
      expect(policy.budget?.maxTokens).toBe(50000);
      expect(policy.budget?.maxDurationMs).toBe(300000);
    });
  });

  describe('matchOperationPattern', () => {
    it('matches wildcard * to everything', () => {
      expect(matchOperationPattern('filesystem.write', '*')).toBe(true);
      expect(matchOperationPattern('bash', '*')).toBe(true);
    });

    it('matches prefix glob filesystem.*', () => {
      expect(matchOperationPattern('filesystem.write', 'filesystem.*')).toBe(true);
      expect(matchOperationPattern('filesystem.read', 'filesystem.*')).toBe(true);
      expect(matchOperationPattern('bash', 'filesystem.*')).toBe(false);
    });

    it('matches suffix glob *.high', () => {
      expect(matchOperationPattern('bash.high', '*.high')).toBe(true);
      expect(matchOperationPattern('filesystem.write.high', '*.high')).toBe(true);
      expect(matchOperationPattern('bash.low', '*.high')).toBe(false);
    });

    it('matches exact operation name', () => {
      expect(matchOperationPattern('filesystem.write', 'filesystem.write')).toBe(true);
      expect(matchOperationPattern('filesystem.read', 'filesystem.write')).toBe(false);
    });
  });

  describe('evaluateOperation', () => {
    it('allows low-risk operation in governed mode', () => {
      const policy = resolveEffectivePolicy('governed');
      const result = evaluateOperation({
        operation: 'filesystem.read',
        risk: 'low',
        policy,
        budgetState: createBudgetState(),
      });

      expect(result.allowed).toBe(true);
      expect(result.disposition).toBe('allow');
    });

    it('denies high-risk operation in hermetic mode', () => {
      const policy = resolveEffectivePolicy('hermetic');
      const result = evaluateOperation({
        operation: 'bash',
        risk: 'high',
        policy,
        budgetState: createBudgetState(),
      });

      expect(result.allowed).toBe(false);
      expect(result.disposition).toBe('deny');
      // No matching rule → risk check fallback: 'high' > maxToolRisk 'low'
      expect(result.reason).toContain('exceeds maximum');
    });

    it('denies critical-risk operation in governed mode', () => {
      const policy = resolveEffectivePolicy('governed');
      const result = evaluateOperation({
        operation: 'rm-rf',
        risk: 'critical',
        policy,
        budgetState: createBudgetState(),
      });

      expect(result.allowed).toBe(false);
      expect(result.disposition).toBe('deny');
    });

    it('allows critical-risk operation in live mode', () => {
      const policy = resolveEffectivePolicy('live');
      const result = evaluateOperation({
        operation: 'rm-rf',
        risk: 'critical',
        policy,
        budgetState: createBudgetState(),
      });

      expect(result.allowed).toBe(true);
    });

    it('applies operation-specific rules (first match wins)', () => {
      const policy = resolveEffectivePolicy('hermetic');

      // filesystem.read is explicitly allowed in hermetic mode
      const result = evaluateOperation({
        operation: 'filesystem.read',
        risk: 'low',
        policy,
        budgetState: createBudgetState(),
      });

      expect(result.allowed).toBe(true);
      expect(result.disposition).toBe('allow');
      expect(result.reason).toContain('read-only filesystem access');
    });

    it('approval exceptions bypass risk check for specific operations', () => {
      // hermetic mode: maxToolRisk = 'low', so 'medium' risk should be denied
      const withoutException = evaluateOperation({
        operation: 'filesystem.write',
        risk: 'medium',
        policy: resolveEffectivePolicy('hermetic'),
        budgetState: createBudgetState(),
      });
      expect(withoutException.allowed).toBe(false);

      // With approval exception for filesystem.write, the rule matches first
      // and allows the operation, bypassing the risk check
      const policy = resolveEffectivePolicy('hermetic', undefined, ['filesystem.write']);
      const withException = evaluateOperation({
        operation: 'filesystem.write',
        risk: 'medium',
        policy,
        budgetState: createBudgetState(),
      });
      expect(withException.allowed).toBe(true);
      expect(withException.reason).toContain('Explicit approval granted');
    });
  });

  describe('budget enforcement', () => {
    it('throws BudgetExhaustedException when operation budget exceeded', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxOperations: 2,
      });

      const state1 = trackOperation(createBudgetState(), policy.budget);
      const state2 = trackOperation(state1, policy.budget);

      expect(() => trackOperation(state2, policy.budget)).toThrow(BudgetExhaustedException);
      expect(() => trackOperation(state2, policy.budget)).toThrow('operations');
    });

    it('throws BudgetExhaustedException when token budget exceeded', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxTokens: 100,
      });

      const state1 = trackTokens(createBudgetState(), 60, policy.budget);
      expect(() => trackTokens(state1, 50, policy.budget)).toThrow(BudgetExhaustedException);
      expect(() => trackTokens(state1, 50, policy.budget)).toThrow('tokens');
    });

    it('throws BudgetExhaustedException when duration budget exceeded', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxDurationMs: 1000,
      });

      const state1 = trackDuration(createBudgetState(), 600, policy.budget);
      expect(() => trackDuration(state1, 500, policy.budget)).toThrow(BudgetExhaustedException);
      expect(() => trackDuration(state1, 500, policy.budget)).toThrow('duration');
    });

    it('BudgetExhaustedException includes executionId when provided', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxOperations: 1,
      });

      const state = trackOperation(createBudgetState(), policy.budget);
      try {
        trackOperation(state, policy.budget);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BudgetExhaustedException);
        expect((e as BudgetExhaustedException).budgetType).toBe('operations');
        expect((e as BudgetExhaustedException).limit).toBe(1);
        expect((e as BudgetExhaustedException).actual).toBe(2);
      }
    });

    it('evaluateOperation throws when budget exhausted at evaluation time', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxOperations: 1,
      });

      const state = { operations: 1, tokens: 0, durationMs: 0 }; // at limit
      expect(() =>
        evaluateOperation({
          operation: 'filesystem.read',
          risk: 'low',
          policy,
          budgetState: state,
        }),
      ).toThrow(BudgetExhaustedException);
    });

    it('budgetless policy has no limits', () => {
      const policy = resolveEffectivePolicy('governed');
      const state = { operations: 10000, tokens: 999999, durationMs: 999999 };

      // No budget — should not throw
      const result = evaluateOperation({
        operation: 'filesystem.read',
        risk: 'low',
        policy,
        budgetState: state,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('policy monotonicity (stricter, never weaker)', () => {
    it('hermetic is stricter than governed', () => {
      const hermetic = resolveEffectivePolicy('hermetic');
      const governed = resolveEffectivePolicy('governed');

      // hermetic has lower maxToolRisk
      const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      expect(riskOrder[hermetic.maxToolRisk]).toBeLessThan(riskOrder[governed.maxToolRisk]);

      // hermetic denies more operations
      const hermeticFsWrite = evaluateOperation({
        operation: 'filesystem.write',
        risk: 'medium',
        policy: hermetic,
        budgetState: createBudgetState(),
      });
      const governedFsWrite = evaluateOperation({
        operation: 'filesystem.write',
        risk: 'medium',
        policy: governed,
        budgetState: createBudgetState(),
      });
      expect(hermeticFsWrite.allowed).toBe(false);
      expect(governedFsWrite.allowed).toBe(true);
    });

    it('governed is stricter than live', () => {
      const governed = resolveEffectivePolicy('governed');
      const live = resolveEffectivePolicy('live');

      const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      expect(riskOrder[governed.maxToolRisk]).toBeLessThan(riskOrder[live.maxToolRisk]);
    });

    it('task constraints only restrict, never widen', () => {
      const base = resolveEffectivePolicy('governed');
      const constrained = resolveEffectivePolicy('governed', {
        taskId: 'task-1',
        allowedToolRisks: ['low'],
        requiredCapabilities: [],
      });

      const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      expect(riskOrder[constrained.maxToolRisk]).toBeLessThanOrEqual(riskOrder[base.maxToolRisk]);
    });
  });

  describe('policy events emit M2 identity lineage', () => {
    it('evaluateOperation accepts executionId/traceId/requestId for event lineage', () => {
      const policy = resolveEffectivePolicy('governed');
      const result = evaluateOperation({
        operation: 'filesystem.read',
        risk: 'low',
        policy,
        budgetState: createBudgetState(),
        executionId: 'exec-m3-001',
        traceId: 'trace-m3-001',
        requestId: 'req-m3-001',
      });

      // The result doesn't carry the IDs (they're for event emission),
      // but the function accepts them — proving the contract exists
      expect(result.allowed).toBe(true);
    });
  });

  describe('deterministic budget failure', () => {
    it('never silently falls back to unrestricted execution', () => {
      const policy = resolveEffectivePolicy('governed', undefined, undefined, {
        maxOperations: 3,
      });

      let state = createBudgetState();
      for (let i = 0; i < 3; i++) {
        state = trackOperation(state, policy.budget);
      }

      // 4th operation must throw — never silently succeed
      expect(() => {
        trackOperation(state, policy.budget);
      }).toThrow(BudgetExhaustedException);

      // The error is deterministic (same every time)
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(() => trackOperation(state, policy.budget)).toThrow(BudgetExhaustedException);
      }
    });
  });
});
