/**
 * VES-REPO-002 — semantic scope hierarchy, not paths alone.
 */
import { describe, expect, it } from 'vitest';
import { isValidChangeIntent } from '../src/intent';
import { isValidScopeChain, scopeChain, scopeDepth, scopeRootName } from '../src/scope';

const repo = { level: 'repository' as const, name: 'vestara-ai-core' };
const app = { level: 'application' as const, name: 'conversation', parent: repo };
const pkg = { level: 'package' as const, name: 'persistence', parent: app };

describe('scope hierarchy', () => {
  it('navigates repository -> application -> package structurally', () => {
    expect(scopeDepth(repo)).toBe(1);
    expect(scopeDepth(pkg)).toBe(3);
    expect(scopeRootName(pkg)).toBe('vestara-ai-core');
    expect(scopeChain(pkg)).toBe('vestara-ai-core / conversation / persistence');
  });

  it('accepts strictly ascending chains', () => {
    expect(isValidScopeChain(pkg)).toBe(true);
  });

  it('rejects descending or flat parent links', () => {
    const inverted = { level: 'repository' as const, name: 'r', parent: pkg };
    expect(isValidScopeChain(inverted)).toBe(false);
    const sameLevel = { level: 'package' as const, name: 'a', parent: { level: 'package' as const, name: 'b' } };
    expect(isValidScopeChain(sameLevel)).toBe(false);
    expect(isValidScopeChain({ level: 'path' as const, name: '' })).toBe(false);
  });

  it('change intent requires semantic scopes — paths alone never suffice', () => {
    const base = {
      executionId: 'e1',
      repositoryId: 'r1',
      purpose: 'persistence change',
      mutationKind: 'source' as const,
    };
    expect(isValidChangeIntent({ ...base, scopes: [pkg] })).toBe(true);
    expect(isValidChangeIntent({ ...base, scopes: [], expectedPaths: ['packages/**'] })).toBe(false);
    expect(isValidChangeIntent({ ...base, expectedPaths: ['packages/**'] })).toBe(false);
  });
});
