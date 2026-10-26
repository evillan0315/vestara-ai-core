import { describe, expect, it } from 'vitest';
import { createCapabilityProfile, DefaultCapabilityMatcher } from '../src/model';

describe('capability matcher contract', () => {
  it('matches exact, wildcard, and subset capability sets', () => {
    const matcher = new DefaultCapabilityMatcher();
    expect(matcher.exact('fs.read', 'fs.read')).toBe(true);
    expect(matcher.exact('fs.read', 'fs.write')).toBe(false);
    expect(matcher.compatible('fs.*', 'fs.read')).toBe(true);
    expect(matcher.compatible('fs.read', 'net.fetch')).toBe(false);
    const result = matcher.subset(['fs.read'], ['fs.read', 'net.fetch']);
    expect(result.matched).toBe(true);
    expect(matcher.subset(['exec.shell'], ['fs.read']).matched).toBe(false);
  });

  it('builds excludable profiles that match required sets', () => {
    const profile = createCapabilityProfile(['fs.read', 'net.fetch'], ['net.fetch']);
    expect(profile.toList()).toEqual(['fs.read']);
    expect(profile.match(['fs.read']).matched).toBe(true);
    expect(profile.match(['net.fetch']).matched).toBe(false);
  });
});
