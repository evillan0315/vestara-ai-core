/**
 * VES-LEAN-002: Runtime Profile Resolver Tests
 *
 * Tests the composition seam:
 * - Profile resolution from env
 * - Default profile selection
 * - Helper functions (isCapabilityActive, etc.)
 */

import { describe, expect, it } from 'vitest';
import {
  getActiveCapabilities,
  getDisabledCapabilities,
  isCapabilityActive,
  isCapabilityDisabled,
  isCapabilityEager,
  isCapabilityLazy,
  resolveRuntimeProfile,
} from '../src/runtime-profile.js';

describe('VES-LEAN-002: Runtime Profile Resolver', () => {
  describe('resolveRuntimeProfile', () => {
    it('defaults to full profile when no env var set', () => {
      const { profile, plan } = resolveRuntimeProfile({});
      expect(profile.id).toBe('full');
      expect(plan.eager.length).toBeGreaterThan(0);
    });

    it('resolves dogfood profile from env', () => {
      const { profile } = resolveRuntimeProfile({ VESTARA_RUNTIME_PROFILE: 'dogfood' });
      expect(profile.id).toBe('dogfood');
    });

    it('throws on unknown profile', () => {
      expect(() => resolveRuntimeProfile({ VESTARA_RUNTIME_PROFILE: 'nonexistent' })).toThrow(
        "Unknown runtime profile: 'nonexistent'",
      );
    });

    it('full profile has boot-runtime as required/eager', () => {
      const { plan } = resolveRuntimeProfile({});
      expect(plan.eager).toContain('boot-runtime');
    });

    it('dogfood profile has boot-runtime as disabled', () => {
      const { plan } = resolveRuntimeProfile({ VESTARA_RUNTIME_PROFILE: 'dogfood' });
      expect(plan.disabled).toContain('boot-runtime');
    });
  });

  describe('Helper functions', () => {
    const plan = {
      profileId: 'test',
      eager: ['a', 'b'],
      lazy: ['c'],
      disabled: ['d'],
      unsatisfied: [],
    };

    it('isCapabilityActive returns true for eager and lazy', () => {
      expect(isCapabilityActive(plan, 'a')).toBe(true);
      expect(isCapabilityActive(plan, 'c')).toBe(true);
      expect(isCapabilityActive(plan, 'd')).toBe(false);
    });

    it('isCapabilityEager returns true only for eager', () => {
      expect(isCapabilityEager(plan, 'a')).toBe(true);
      expect(isCapabilityEager(plan, 'c')).toBe(false);
    });

    it('isCapabilityLazy returns true only for lazy', () => {
      expect(isCapabilityLazy(plan, 'c')).toBe(true);
      expect(isCapabilityLazy(plan, 'a')).toBe(false);
    });

    it('isCapabilityDisabled returns true only for disabled', () => {
      expect(isCapabilityDisabled(plan, 'd')).toBe(true);
      expect(isCapabilityDisabled(plan, 'a')).toBe(false);
    });

    it('getActiveCapabilities returns eager + lazy', () => {
      expect(getActiveCapabilities(plan).sort()).toEqual(['a', 'b', 'c']);
    });

    it('getDisabledCapabilities returns disabled', () => {
      expect(getDisabledCapabilities(plan)).toEqual(['d']);
    });
  });
});
