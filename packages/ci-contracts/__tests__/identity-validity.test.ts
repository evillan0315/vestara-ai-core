/**
 * CI-OBS-001B — Identity validity.
 *
 * All identity validators must correctly accept valid values and reject
 * invalid ones. CI identities are provider-neutral — no GitHub-specific
 * validation. CICommitId accepts any non-empty string; the adapter layer
 * enforces provider-native format (e.g. 40-hex for Git SHA-1).
 */
import { describe, expect, it } from 'vitest';
import {
  isValidCIAttempt,
  isValidCICheckId,
  isValidCICommitId,
  isValidCIJobId,
  isValidCIRepositoryRef,
  isValidCIRunId,
  isValidCISha,
  makeCIRepositoryRef,
} from '../src/identity';

describe('CIRunId validity', () => {
  it('accepts non-empty strings', () => {
    expect(isValidCIRunId('run-123')).toBe(true);
    expect(isValidCIRunId('abc')).toBe(true);
  });

  it('rejects empty strings and non-strings', () => {
    expect(isValidCIRunId('')).toBe(false);
    expect(isValidCIRunId(null)).toBe(false);
    expect(isValidCIRunId(undefined)).toBe(false);
    expect(isValidCIRunId(42)).toBe(false);
  });
});

describe('CIJobId validity', () => {
  it('accepts non-empty strings', () => {
    expect(isValidCIJobId('job-456')).toBe(true);
  });

  it('rejects empty strings and non-strings', () => {
    expect(isValidCIJobId('')).toBe(false);
    expect(isValidCIJobId(null)).toBe(false);
  });
});

describe('CICheckId validity', () => {
  it('accepts non-empty strings', () => {
    expect(isValidCICheckId('check-789')).toBe(true);
  });

  it('rejects empty strings and non-strings', () => {
    expect(isValidCICheckId('')).toBe(false);
    expect(isValidCICheckId(null)).toBe(false);
  });
});

describe('CICommitId validity', () => {
  it('accepts any non-empty string — provider-neutral, VCS-agnostic', () => {
    // Git SHA-1 (40 hex)
    expect(isValidCICommitId('a'.repeat(40))).toBe(true);
    // Git SHA-256 (64 hex) — future-proof
    expect(isValidCICommitId('a'.repeat(64))).toBe(true);
    // Non-hex formats — other VCS or future providers
    expect(isValidCICommitId('abc123')).toBe(true);
    expect(isValidCICommitId('D173E039B802')).toBe(true);
  });

  it('rejects empty strings and non-strings', () => {
    expect(isValidCICommitId('')).toBe(false);
    expect(isValidCICommitId(null)).toBe(false);
    expect(isValidCICommitId(undefined)).toBe(false);
    expect(isValidCICommitId(42)).toBe(false);
  });
});

describe('CISha (deprecated alias) validity', () => {
  it('delegates to isValidCICommitId — accepts any non-empty string', () => {
    // CISha is now an alias for CICommitId; no SHA-1 assumption
    expect(isValidCISha('a'.repeat(40))).toBe(true);
    expect(isValidCISha('short-hash')).toBe(true);
    expect(isValidCISha('')).toBe(false);
    expect(isValidCISha(null)).toBe(false);
  });
});

describe('CIAttempt validity', () => {
  it('accepts positive integers', () => {
    expect(isValidCIAttempt(1)).toBe(true);
    expect(isValidCIAttempt(2)).toBe(true);
    expect(isValidCIAttempt(100)).toBe(true);
  });

  it('rejects zero and negative', () => {
    expect(isValidCIAttempt(0)).toBe(false);
    expect(isValidCIAttempt(-1)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(isValidCIAttempt(1.5)).toBe(false);
    expect(isValidCIAttempt(NaN)).toBe(false);
  });

  it('rejects non-numbers', () => {
    expect(isValidCIAttempt('1')).toBe(false);
    expect(isValidCIAttempt(null)).toBe(false);
  });
});

describe('CIRepositoryRef validity', () => {
  it('accepts valid refs', () => {
    expect(isValidCIRepositoryRef({ owner: 'vestara', name: 'vestara-ai-core' })).toBe(true);
    expect(isValidCIRepositoryRef({ owner: 'vestara', name: 'vestara-ai-core', provider: 'github' })).toBe(true);
  });

  it('rejects missing owner or name', () => {
    expect(isValidCIRepositoryRef({ owner: 'vestara' })).toBe(false);
    expect(isValidCIRepositoryRef({ name: 'vestara-ai-core' })).toBe(false);
    expect(isValidCIRepositoryRef({})).toBe(false);
  });

  it('rejects empty owner or name', () => {
    expect(isValidCIRepositoryRef({ owner: '', name: 'test' })).toBe(false);
    expect(isValidCIRepositoryRef({ owner: 'test', name: '' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isValidCIRepositoryRef(null)).toBe(false);
    expect(isValidCIRepositoryRef('string')).toBe(false);
  });

  it('makeCIRepositoryRef constructs valid ref', () => {
    const ref = makeCIRepositoryRef('owner', 'repo', 'github');
    expect(ref).toEqual({ owner: 'owner', name: 'repo', provider: 'github' });
    expect(isValidCIRepositoryRef(ref)).toBe(true);
  });
});
