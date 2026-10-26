import { describe, expect, it } from 'vitest';
import { FailureBudget } from '../src/failure-budget';

describe('FailureBudget contract', () => {
  it('starts healthy and exhausts past the error-rate limit', () => {
    const budget = new FailureBudget();
    expect(budget.status).toBe('healthy');
    expect(budget.isExhausted).toBe(false);
    for (let i = 0; i < 5; i++) budget.recordOutcome(false);
    expect(budget.isExhausted).toBe(true);
    const state = budget.state();
    expect(state.status).toBe('exhausted');
    expect(state.errorRate).toBe(1);
    expect(state.failures).toBe(5);
  });

  it('tolerates occasional failures below the limit', () => {
    const budget = new FailureBudget();
    for (let i = 0; i < 4; i++) budget.recordOutcome(true);
    budget.recordOutcome(false);
    expect(budget.status).toBe('consuming');
    expect(budget.isExhausted).toBe(false);
  });
});
