export type CapabilityStability = 'stable' | 'beta' | 'alpha' | 'deprecated';

export interface CapabilityDefinition {
  id: string;
  category: string;
  name: string;
  version: string;
  stability: CapabilityStability;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityRelationships {
  requires: string[];
  mayProduce: string[];
  verifies: string[];
  conflicts: string[];
  implies: string[];
}

export const EMPTY_RELATIONSHIPS: CapabilityRelationships = {
  requires: [],
  mayProduce: [],
  verifies: [],
  conflicts: [],
  implies: [],
};

export interface CapabilityMatchResult {
  matched: boolean;
  score: number;
  unmatched: string[];
}

export interface CapabilityMatcher {
  exact(required: string, provided: string): boolean;

  compatible(required: string, provided: string): boolean;

  subset(required: string[], provided: string[]): CapabilityMatchResult;

  superset(required: string[], provided: string[]): CapabilityMatchResult;

  distance(required: string, provided: string): number;
}

export class DefaultCapabilityMatcher implements CapabilityMatcher {
  exact(required: string, provided: string): boolean {
    return required === provided;
  }

  compatible(required: string, provided: string): boolean {
    if (required === provided) return true;
    const reqParts = required.split('.');
    const provParts = provided.split('.');
    const minLen = Math.min(reqParts.length, provParts.length);
    for (let i = 0; i < minLen; i++) {
      if (reqParts[i] === '*' || provParts[i] === '*') continue;
      if (reqParts[i] !== provParts[i]) return false;
    }
    return minLen > 0;
  }

  subset(required: string[], provided: string[]): CapabilityMatchResult {
    const unmatched: string[] = [];
    for (const req of required) {
      const found = provided.some((p) => this.compatible(req, p));
      if (!found) unmatched.push(req);
    }
    return {
      matched: unmatched.length === 0,
      score: provided.length > 0 ? 1 - unmatched.length / required.length : 0,
      unmatched,
    };
  }

  superset(required: string[], provided: string[]): CapabilityMatchResult {
    const unmatched: string[] = [];
    for (const prov of provided) {
      const found = required.some((r) => this.compatible(r, prov));
      if (!found) unmatched.push(prov);
    }
    return {
      matched: unmatched.length === 0,
      score: required.length > 0 ? 1 - unmatched.length / provided.length : 0,
      unmatched,
    };
  }

  distance(required: string, provided: string): number {
    if (required === provided) return 0;
    const reqParts = required.split('.');
    const provParts = provided.split('.');
    const minLen = Math.min(reqParts.length, provParts.length);
    let common = 0;
    for (let i = 0; i < minLen; i++) {
      if (reqParts[i] === provParts[i]) common++;
      else break;
    }
    return reqParts.length + provParts.length - 2 * common;
  }
}

export interface CapabilityProfile {
  capabilities: string[];
  excluded?: string[];

  match(required: string[]): CapabilityMatchResult;

  matchProfile(other: CapabilityProfile, matcher?: CapabilityMatcher): CapabilityMatchResult;

  toList(): string[];
}

export function createCapabilityProfile(capabilities: string[], excluded?: string[]): CapabilityProfile {
  const effective = excluded ? capabilities.filter((c) => !excluded.includes(c)) : [...capabilities];

  return {
    capabilities: effective,
    excluded,

    match(required: string[]): CapabilityMatchResult {
      const m = new DefaultCapabilityMatcher();
      return m.subset(required, effective);
    },

    matchProfile(other: CapabilityProfile, matcher?: CapabilityMatcher): CapabilityMatchResult {
      const m = matcher ?? new DefaultCapabilityMatcher();
      return m.subset(other.capabilities, effective);
    },

    toList(): string[] {
      return [...effective];
    },
  };
}
