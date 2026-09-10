import { describe, expect, it } from 'vitest';
import {
  ALL_AGENT_CAPABILITIES,
  ALL_AGENT_ROLES,
  ALL_ROUTING_ROLES,
  CAPABILITY_DESCRIPTIONS,
  isAgentCapability,
  isAgentRole,
  isRoutingRole,
  mapAgentRoleToRoutingRole,
  normalizeLegacyRole,
  routingRoleToAgentRole,
} from '../src/index.js';

describe('AgentRole', () => {
  it('has exactly 28 values', () => {
    expect(ALL_AGENT_ROLES).toHaveLength(28);
  });

  it('is closed and deterministic', () => {
    const unique = new Set(ALL_AGENT_ROLES);
    expect(unique.size).toBe(ALL_AGENT_ROLES.length);
  });

  it('isAgentRole accepts all canonical values', () => {
    for (const role of ALL_AGENT_ROLES) {
      expect(isAgentRole(role)).toBe(true);
    }
  });

  it('isAgentRole rejects unknown values', () => {
    expect(isAgentRole('engineer')).toBe(false);
    expect(isAgentRole('planner')).toBe(false);
    expect(isAgentRole('documentation')).toBe(false);
    expect(isAgentRole('unknown')).toBe(false);
    expect(isAgentRole('')).toBe(false);
  });

  it('does NOT contain legacy divergent values', () => {
    expect(ALL_AGENT_ROLES).not.toContain('engineer');
    expect(ALL_AGENT_ROLES).not.toContain('planner');
    expect(ALL_AGENT_ROLES).not.toContain('documentation');
  });
});

describe('AgentCapability', () => {
  it('has exactly 42 values', () => {
    expect(ALL_AGENT_CAPABILITIES).toHaveLength(42);
  });

  it('is closed and deterministic', () => {
    const unique = new Set(ALL_AGENT_CAPABILITIES);
    expect(unique.size).toBe(ALL_AGENT_CAPABILITIES.length);
  });

  it('has descriptions for every capability', () => {
    for (const cap of ALL_AGENT_CAPABILITIES) {
      expect(CAPABILITY_DESCRIPTIONS[cap]).toBeDefined();
      expect(typeof CAPABILITY_DESCRIPTIONS[cap]).toBe('string');
      expect(CAPABILITY_DESCRIPTIONS[cap].length).toBeGreaterThan(0);
    }
  });

  it('descriptions cover all capabilities', () => {
    const descKeys = Object.keys(CAPABILITY_DESCRIPTIONS);
    expect(descKeys).toHaveLength(ALL_AGENT_CAPABILITIES.length);
  });

  it('isAgentCapability accepts all canonical values', () => {
    for (const cap of ALL_AGENT_CAPABILITIES) {
      expect(isAgentCapability(cap)).toBe(true);
    }
  });

  it('isAgentCapability rejects unknown values', () => {
    expect(isAgentCapability('filesystem.read')).toBe(false);
    expect(isAgentCapability('unknown')).toBe(false);
    expect(isAgentCapability('')).toBe(false);
  });

  it('does NOT contain the (string & {}) escape hatch — type is closed', () => {
    // This test verifies that arbitrary strings are rejected at runtime.
    // The TypeScript type system enforces this at compile time.
    expect(isAgentCapability('arbitrary-capability')).toBe(false);
  });
});

describe('RoutingRole', () => {
  it('has exactly 6 values', () => {
    expect(ALL_ROUTING_ROLES).toHaveLength(6);
  });

  it('is closed and deterministic', () => {
    const unique = new Set(ALL_ROUTING_ROLES);
    expect(unique.size).toBe(ALL_ROUTING_ROLES.length);
  });

  it('isRoutingRole accepts all canonical values', () => {
    for (const role of ALL_ROUTING_ROLES) {
      expect(isRoutingRole(role)).toBe(true);
    }
  });

  it('isRoutingRole rejects non-routing values', () => {
    // 'developer' IS a valid RoutingRole (shared with AgentRole)
    expect(isRoutingRole('planning')).toBe(false);
    expect(isRoutingRole('documenter')).toBe(false);
    expect(isRoutingRole('security')).toBe(false);
    expect(isRoutingRole('unknown')).toBe(false);
  });
});

describe('Role normalization', () => {
  describe('mapAgentRoleToRoutingRole', () => {
    it('maps planning → planner', () => {
      expect(mapAgentRoleToRoutingRole('planning')).toBe('planner');
    });

    it('maps documenter → documentation', () => {
      expect(mapAgentRoleToRoutingRole('documenter')).toBe('documentation');
    });

    it('maps documentation-agent → documentation', () => {
      expect(mapAgentRoleToRoutingRole('documentation-agent')).toBe('documentation');
    });

    it('maps developer → developer', () => {
      expect(mapAgentRoleToRoutingRole('developer')).toBe('developer');
    });

    it('maps frontend → developer', () => {
      expect(mapAgentRoleToRoutingRole('frontend')).toBe('developer');
    });

    it('maps refactoring → developer', () => {
      expect(mapAgentRoleToRoutingRole('refactoring')).toBe('developer');
    });

    it('maps architect → architect', () => {
      expect(mapAgentRoleToRoutingRole('architect')).toBe('architect');
    });

    it('maps reviewer → reviewer', () => {
      expect(mapAgentRoleToRoutingRole('reviewer')).toBe('reviewer');
    });

    it('maps verifier → verifier', () => {
      expect(mapAgentRoleToRoutingRole('verifier')).toBe('verifier');
    });

    it('returns undefined for unmapped roles', () => {
      expect(mapAgentRoleToRoutingRole('custom')).toBeUndefined();
      expect(mapAgentRoleToRoutingRole('security')).toBeUndefined();
      expect(mapAgentRoleToRoutingRole('context')).toBeUndefined();
    });
  });

  describe('routingRoleToAgentRole', () => {
    it('maps planner → planning', () => {
      expect(routingRoleToAgentRole('planner')).toBe('planning');
    });

    it('maps documentation → documenter', () => {
      expect(routingRoleToAgentRole('documentation')).toBe('documenter');
    });

    it('maps architect → architect', () => {
      expect(routingRoleToAgentRole('architect')).toBe('architect');
    });

    it('maps developer → developer', () => {
      expect(routingRoleToAgentRole('developer')).toBe('developer');
    });

    it('maps reviewer → reviewer', () => {
      expect(routingRoleToAgentRole('reviewer')).toBe('reviewer');
    });

    it('maps verifier → verifier', () => {
      expect(routingRoleToAgentRole('verifier')).toBe('verifier');
    });
  });

  describe('normalizeLegacyRole', () => {
    it('normalizes engineer → developer', () => {
      expect(normalizeLegacyRole('engineer')).toBe('developer');
    });

    it('normalizes planner → planning', () => {
      expect(normalizeLegacyRole('planner')).toBe('planning');
    });

    it('normalizes documentation → documenter', () => {
      expect(normalizeLegacyRole('documentation')).toBe('documenter');
    });

    it('passes through canonical values', () => {
      expect(normalizeLegacyRole('developer')).toBe('developer');
      expect(normalizeLegacyRole('architect')).toBe('architect');
      expect(normalizeLegacyRole('planning')).toBe('planning');
    });

    it('returns undefined for unknown values', () => {
      expect(normalizeLegacyRole('unknown')).toBeUndefined();
      expect(normalizeLegacyRole('')).toBeUndefined();
    });
  });
});
