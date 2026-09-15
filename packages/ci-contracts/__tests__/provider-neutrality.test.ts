/**
 * CI-OBS-001B — Provider neutrality.
 *
 * No GitHub-specific, GitLab-specific, or any provider-specific types
 * or values must exist in the canonical contracts. Provider concepts
 * belong to the adapter layer.
 */
import { describe, expect, it } from 'vitest';
import * as classification from '../src/classification';
import * as conclusion from '../src/conclusion';
import * as evidence from '../src/evidence';
import * as identity from '../src/identity';
import * as status from '../src/status';

describe('provider neutrality', () => {
  const allModules = [identity, status, conclusion, classification, evidence];

  it('no exported string literal contains github/gitlab/circle/jenkins', () => {
    const providerTerms = ['github', 'gitlab', 'circle', 'jenkins', 'travis', 'bitbucket'];
    for (const mod of allModules) {
      for (const [, value] of Object.entries(mod)) {
        if (typeof value === 'string') {
          for (const term of providerTerms) {
            expect(value.toLowerCase()).not.toContain(term);
          }
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string') {
              for (const term of providerTerms) {
                expect(item.toLowerCase()).not.toContain(term);
              }
            }
          }
        }
      }
    }
  });

  it('CIRepositoryRef provider field is optional and informational', () => {
    // The provider field exists but is not required for validity
    const refWithoutProvider = { owner: 'test', name: 'repo' };
    const refWithProvider = { owner: 'test', name: 'repo', provider: 'anything' };
    expect(identity.isValidCIRepositoryRef(refWithoutProvider)).toBe(true);
    expect(identity.isValidCIRepositoryRef(refWithProvider)).toBe(true);
  });

  it('CISha validation is hex-only, not provider-specific', () => {
    // 40 hex chars — standard git SHA, works for any provider
    expect(identity.isValidCISha('a'.repeat(40))).toBe(true);
    // No provider-specific format checks
  });
});
