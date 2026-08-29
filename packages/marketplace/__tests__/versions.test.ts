import { satisfies } from '@vestara/extension-runtime';
import { afterAll, describe, expect, it } from 'vitest';
import {
  compareSemver,
  isSemver,
  isStable,
  latestStableVersion,
  latestVersion,
  parseSemver,
  selectVersion,
  sortVersionsDesc,
  versionBumpType,
} from '../src/index.js';
import { cleanup } from './helpers.js';

afterAll(cleanup);

describe('versions', () => {
  it('parses major/minor/patch and prerelease identifiers', () => {
    const parsed = parseSemver('1.2.3-beta.4+build.5');
    expect(parsed.major).toBe(1);
    expect(parsed.minor).toBe(2);
    expect(parsed.patch).toBe(3);
    expect(parsed.prerelease).toEqual(['beta', 4]);
    expect(parsed.build).toEqual(['build', '5']);
  });

  it('validates semver shapes', () => {
    expect(isSemver('1.2.3')).toBe(true);
    expect(isSemver('0.0.1-alpha.1')).toBe(true);
    expect(isSemver('v1.2.3')).toBe(false);
    expect(isSemver('1.2')).toBe(false);
    expect(isSemver('1.2.3.4')).toBe(false);
  });

  it('orders versions correctly, including prereleases', () => {
    const sorted = sortVersionsDesc(['1.0.0', '2.0.0', '1.5.0', '1.10.0', '1.0.0-rc.1', '1.0.0-alpha.1']);
    expect(sorted).toEqual(['2.0.0', '1.10.0', '1.5.0', '1.0.0', '1.0.0-rc.1', '1.0.0-alpha.1']);
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(isStable('1.0.0')).toBe(true);
    expect(isStable('1.0.0-beta')).toBe(false);
  });

  it('picks the latest stable by default and falls back to prereleases', () => {
    expect(latestVersion(['1.0.0', '1.1.0'])).toBe('1.1.0');
    expect(latestStableVersion(['1.0.0', '2.0.0-beta.1'])).toBe('1.0.0');
    expect(latestStableVersion(['2.0.0-beta.1'])).toBe('2.0.0-beta.1');
  });

  it('selects versions by exact, caret, and comparator ranges with stability preference', () => {
    const versions = ['1.0.0', '1.4.2', '2.0.0', '2.0.0-rc.1'];
    expect(selectVersion(versions, '1.4.2', satisfies)).toBe('1.4.2');
    expect(selectVersion(versions, '^1.0.0', satisfies)).toBe('1.4.2');
    expect(selectVersion(versions, '>=2.0.0', satisfies)).toBe('2.0.0');
    expect(selectVersion(versions, '*', satisfies)).toBe('2.0.0');
  });

  it('classifies version bumps', () => {
    expect(versionBumpType('1.0.0', '2.0.0')).toBe('major');
    expect(versionBumpType('1.0.0', '1.1.0')).toBe('minor');
    expect(versionBumpType('1.0.0', '1.0.1')).toBe('patch');
    expect(versionBumpType('1.0.0', '1.0.0-beta.1')).toBe('prerelease');
  });
});
