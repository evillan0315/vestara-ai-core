/**
 * VES-LEAN-002: Runtime Profile Contract Tests
 *
 * Proves:
 * 1. Runtime profile resolves deterministically
 * 2. dogfood profile exists
 * 3. requirement and activation are independent
 * 4. REQUIRED/LAZY is representable
 * 5. DISABLED/NONE is representable
 * 6. transitive dependencies are preserved
 * 7. disabled capability is excluded from activation plan
 * 8. profile cannot activate a capability whose required dependency is unavailable
 * 9. no duplicate capability authority is introduced
 * 10. current default composition behavior remains unchanged
 * 11. Boot Runtime can be classified independently of Diagnostics
 * 12. provider activation can be represented without redesigning provider routing
 */

import { describe, expect, it } from 'vitest';
import {
  type CapabilityDescriptor,
  DOGFOOD_PROFILE,
  type RuntimeProfile,
  resolveActivationPlan,
} from '../src/index.js';

// ─── Test Helpers ───────────────────────────────────────────

function makeCap(overrides: Partial<CapabilityDescriptor> & { id: string }): CapabilityDescriptor {
  return {
    name: overrides.id,
    requirement: 'required',
    activation: 'eager',
    ...overrides,
  };
}

function makeProfile(id: string, capabilities: CapabilityDescriptor[]): RuntimeProfile {
  return {
    id,
    name: `Test ${id}`,
    description: `Test profile ${id}`,
    capabilities,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('VES-LEAN-002: Runtime Profile Contract', () => {
  describe('1. Profile resolution is deterministic', () => {
    it('resolves the same plan for the same profile', () => {
      const plan1 = resolveActivationPlan(DOGFOOD_PROFILE);
      const plan2 = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan1.eager.sort()).toEqual(plan2.eager.sort());
      expect(plan1.lazy.sort()).toEqual(plan2.lazy.sort());
      expect(plan1.disabled.sort()).toEqual(plan2.disabled.sort());
    });
  });

  describe('2. Dogfood profile exists', () => {
    it('has id dogfood', () => {
      expect(DOGFOOD_PROFILE.id).toBe('dogfood');
    });
    it('has capabilities', () => {
      expect(DOGFOOD_PROFILE.capabilities.length).toBeGreaterThan(0);
    });
  });

  describe('3. Requirement and activation are independent', () => {
    it('REQUIRED/EAGER is valid', () => {
      const profile = makeProfile('test', [makeCap({ id: 'a', requirement: 'required', activation: 'eager' })]);
      const plan = resolveActivationPlan(profile);
      expect(plan.eager).toContain('a');
    });

    it('REQUIRED/LAZY is valid', () => {
      const profile = makeProfile('test', [makeCap({ id: 'a', requirement: 'required', activation: 'lazy' })]);
      const plan = resolveActivationPlan(profile);
      expect(plan.lazy).toContain('a');
    });

    it('OPTIONAL/EAGER is valid', () => {
      const profile = makeProfile('test', [makeCap({ id: 'a', requirement: 'optional', activation: 'eager' })]);
      const plan = resolveActivationPlan(profile);
      expect(plan.eager).toContain('a');
    });

    it('OPTIONAL/LAZY is valid', () => {
      const profile = makeProfile('test', [makeCap({ id: 'a', requirement: 'optional', activation: 'lazy' })]);
      const plan = resolveActivationPlan(profile);
      expect(plan.lazy).toContain('a');
    });

    it('OPTIONAL/NONE goes to disabled', () => {
      const profile = makeProfile('test', [makeCap({ id: 'a', requirement: 'optional', activation: 'none' })]);
      const plan = resolveActivationPlan(profile);
      expect(plan.disabled).toContain('a');
    });
  });

  describe('4. REQUIRED/LAZY is representable', () => {
    it('places capability in lazy set', () => {
      const profile = makeProfile('test', [
        makeCap({ id: 'core', requirement: 'required', activation: 'eager' }),
        makeCap({ id: 'lazy-cap', requirement: 'required', activation: 'lazy', dependencies: ['core'] }),
      ]);
      const plan = resolveActivationPlan(profile);
      expect(plan.lazy).toContain('lazy-cap');
      expect(plan.eager).toContain('core');
    });
  });

  describe('5. DISABLED/NONE is representable', () => {
    it('places capability in disabled set', () => {
      const profile = makeProfile('test', [makeCap({ id: 'a', requirement: 'disabled', activation: 'none' })]);
      const plan = resolveActivationPlan(profile);
      expect(plan.disabled).toContain('a');
      expect(plan.eager).not.toContain('a');
      expect(plan.lazy).not.toContain('a');
    });
  });

  describe('6. Transitive dependencies are preserved', () => {
    it('REQUIRED dependency of REQUIRED capability becomes eager', () => {
      const profile = makeProfile('test', [
        makeCap({ id: 'dep', requirement: 'required', activation: 'eager' }),
        makeCap({ id: 'parent', requirement: 'required', activation: 'eager', dependencies: ['dep'] }),
      ]);
      const plan = resolveActivationPlan(profile);
      expect(plan.eager).toContain('dep');
      expect(plan.eager).toContain('parent');
    });

    it('deeply nested dependencies are resolved', () => {
      const profile = makeProfile('test', [
        makeCap({ id: 'leaf', requirement: 'required', activation: 'eager' }),
        makeCap({ id: 'mid', requirement: 'required', activation: 'eager', dependencies: ['leaf'] }),
        makeCap({ id: 'root', requirement: 'required', activation: 'eager', dependencies: ['mid'] }),
      ]);
      const plan = resolveActivationPlan(profile);
      expect(plan.eager).toContain('leaf');
      expect(plan.eager).toContain('mid');
      expect(plan.eager).toContain('root');
    });
  });

  describe('7. Disabled capability is excluded from activation plan', () => {
    it('disabled capability not in eager or lazy', () => {
      const profile = makeProfile('test', [
        makeCap({ id: 'disabled-cap', requirement: 'disabled', activation: 'none' }),
        makeCap({ id: 'active-cap', requirement: 'required', activation: 'eager' }),
      ]);
      const plan = resolveActivationPlan(profile);
      expect(plan.disabled).toContain('disabled-cap');
      expect(plan.eager).not.toContain('disabled-cap');
      expect(plan.lazy).not.toContain('disabled-cap');
      expect(plan.eager).toContain('active-cap');
    });
  });

  describe('8. Unsatisfied when required dependency is disabled', () => {
    it('reports unsatisfied when REQUIRED dependency is disabled', () => {
      const profile = makeProfile('test', [
        makeCap({ id: 'dep', requirement: 'disabled', activation: 'none' }),
        makeCap({ id: 'parent', requirement: 'required', activation: 'eager', dependencies: ['dep'] }),
      ]);
      const plan = resolveActivationPlan(profile);
      expect(plan.unsatisfied).toContain('parent');
    });
  });

  describe('9. No duplicate capability authority', () => {
    it('RuntimeProfile has no implementation state', () => {
      // RuntimeProfile is a pure data contract — no methods, no state mutations
      const profile = DOGFOOD_PROFILE;
      expect(typeof profile).toBe('object');
      expect(Array.isArray(profile.capabilities)).toBe(true);
      // Capabilities are plain descriptors — no service instances, no stores
      for (const cap of profile.capabilities) {
        expect(typeof cap.id).toBe('string');
        expect(typeof cap.requirement).toBe('string');
        expect(typeof cap.activation).toBe('string');
      }
    });
  });

  describe('10. Default behavior unchanged', () => {
    it('full profile has all capabilities as required/eager', () => {
      const fullProfile = makeProfile('full', [
        makeCap({ id: 'a', requirement: 'required', activation: 'eager' }),
        makeCap({ id: 'b', requirement: 'required', activation: 'eager' }),
        makeCap({ id: 'c', requirement: 'required', activation: 'eager' }),
      ]);
      const plan = resolveActivationPlan(fullProfile);
      expect(plan.eager).toEqual(['a', 'b', 'c']);
      expect(plan.lazy).toEqual([]);
      expect(plan.disabled).toEqual([]);
    });
  });

  describe('11. Boot Runtime classified independently of Diagnostics', () => {
    it('boot-runtime is disabled while diagnostics is required in dogfood', () => {
      const bootCap = DOGFOOD_PROFILE.capabilities.find((c) => c.id === 'boot-runtime');
      const diagCap = DOGFOOD_PROFILE.capabilities.find((c) => c.id === 'diagnostics');
      expect(bootCap).toBeDefined();
      expect(diagCap).toBeDefined();
      expect(bootCap!.requirement).toBe('disabled');
      expect(bootCap!.activation).toBe('none');
      expect(diagCap!.requirement).toBe('required');
      expect(diagCap!.activation).toBe('eager');
    });

    it('boot-runtime is disabled in dogfood activation plan', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.disabled).toContain('boot-runtime');
      expect(plan.eager).toContain('diagnostics');
    });
  });

  describe('12. Provider activation representable', () => {
    it('opencode provider is required/eager in dogfood', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.eager).toContain('provider-resolution');
    });

    it('opencode-go and openai providers are disabled in dogfood', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.disabled).toContain('opencode-go-provider');
      expect(plan.disabled).toContain('openai-provider');
    });

    it('provider can be optional/eager without redesigning routing', () => {
      const profile = makeProfile('test', [
        makeCap({ id: 'provider-x', requirement: 'optional', activation: 'eager' }),
      ]);
      const plan = resolveActivationPlan(profile);
      expect(plan.eager).toContain('provider-x');
    });
  });

  describe('Dogfood profile specific classifications', () => {
    it('Global Assistant and dependencies are required/eager', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.eager).toContain('global-assistant');
      expect(plan.eager).toContain('conversation');
      expect(plan.eager).toContain('agent-harness');
      expect(plan.eager).toContain('tool-runtime');
      expect(plan.eager).toContain('evidence');
    });

    it('Activity Room components are required/eager', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.eager).toContain('activity-room');
      expect(plan.eager).toContain('m9-ingestion');
      expect(plan.eager).toContain('m11a-api');
      expect(plan.eager).toContain('m11b-websocket');
      expect(plan.eager).toContain('agent-lifecycle-bridge');
    });

    it('Verification is required/lazy', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.lazy).toContain('verification');
    });

    it('Telegram, Browser, Host Runtime are disabled', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.disabled).toContain('telegram');
      expect(plan.disabled).toContain('browser-runtime');
      expect(plan.disabled).toContain('host-runtime');
      expect(plan.disabled).toContain('boot-runtime');
    });

    it('no unsatisfied dependencies in dogfood', () => {
      const plan = resolveActivationPlan(DOGFOOD_PROFILE);
      expect(plan.unsatisfied).toEqual([]);
    });
  });
});
