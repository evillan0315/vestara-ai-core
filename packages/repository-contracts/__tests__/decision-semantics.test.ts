/**
 * VES-REPO-002 — coordination decision semantics + ActiveRepositoryWork view.
 */
import { describe, expect, it } from 'vitest';
import { isMutationMode, isReadOnlyMode } from '../src/access-mode';
import { isActivelyMutating, isTerminalWorkState } from '../src/work';

describe('decision and work semantics', () => {
  it('only MUTATE carries mutation authority; reasoning modes never do', () => {
    expect(isMutationMode('MUTATE')).toBe(true);
    expect(isMutationMode('OBSERVE')).toBe(false);
    expect(isMutationMode('ANALYZE')).toBe(false);
    expect(isMutationMode('VERIFY')).toBe(false);
    expect(isReadOnlyMode('OBSERVE')).toBe(true);
    expect(isReadOnlyMode('MUTATE')).toBe(false);
  });

  it('active work view: mutating only when live AND mutation-authorized', () => {
    const base = { executionId: 'e1', repositoryId: 'r1', actorId: 'miMo' };
    expect(isActivelyMutating({ ...base, accessMode: 'MUTATE', state: 'active' } as never)).toBe(true);
    // Waiting with MUTATE: presence confers no authority.
    expect(isActivelyMutating({ ...base, accessMode: 'MUTATE', state: 'waiting' } as never)).toBe(false);
    // Active but read-only: concurrent reasoning, never mutation.
    expect(isActivelyMutating({ ...base, accessMode: 'ANALYZE', state: 'active' } as never)).toBe(false);
  });

  it('terminal states hold no authority', () => {
    expect(isTerminalWorkState('completed')).toBe(true);
    expect(isTerminalWorkState('failed')).toBe(true);
    expect(isTerminalWorkState('cancelled')).toBe(true);
    expect(isTerminalWorkState('active')).toBe(false);
    expect(isTerminalWorkState('verifying')).toBe(false);
  });
});
