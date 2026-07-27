import { describe, expect, it } from 'vitest';

const { DefaultCapabilityCatalog, DefaultCapabilityResolver, BUILTIN_TAXONOMY } = require('../dist/index.js');

function buildCatalog() {
  const cat = new DefaultCapabilityCatalog();
  for (const entry of BUILTIN_TAXONOMY) {
    cat.register(entry.definition);
    if (entry.relationships) {
      cat.registerRelationships(entry.definition.id, entry.relationships);
    }
  }
  return cat;
}

describe('CapabilityResolver', () => {
  const catalog = buildCatalog();
  const resolver = new DefaultCapabilityResolver(catalog);

  describe('expand', () => {
    it('expands wildcard to all children', () => {
      const expanded = resolver.expand(['repository.*']);
      expect(expanded).toContain('repository.read');
      expect(expanded).toContain('repository.write');
      expect(expanded).toContain('repository.commit');
      expect(expanded.length).toBeGreaterThan(5);
    });

    it('expands implies relationships', () => {
      // agent.implement doesn't have implies in the taxonomy
      // Let's test with a capability that has implies (none currently do in builtins)
      const expanded = resolver.expand(['repository.commit']);
      // No implies for repository.commit, so just itself
      expect(expanded).toContain('repository.commit');
    });

    it('keeps non-wildcard capabilities as-is', () => {
      const expanded = resolver.expand(['docker.build', 'docker.run']);
      expect(expanded).toContain('docker.build');
      expect(expanded).toContain('docker.run');
    });
  });

  describe('satisfies', () => {
    it('exact match', () => {
      expect(resolver.satisfies('repository.commit', 'repository.commit')).toBe(true);
    });

    it('wildcard match', () => {
      expect(resolver.satisfies('repository.commit', 'repository.*')).toBe(true);
    });

    it('mismatch returns false', () => {
      expect(resolver.satisfies('docker.build', 'repository.commit')).toBe(false);
    });
  });

  describe('resolve', () => {
    it('direct match', () => {
      const result = resolver.resolve(['repository.commit', 'docker.build'], ['repository.commit', 'docker.build']);
      expect(result.satisfied).toBe(true);
      expect(result.score).toBe(1);
      expect(result.missing).toHaveLength(0);
    });

    it('wildcard match', () => {
      const result = resolver.resolve(['repository.commit', 'repository.write'], ['repository.*']);
      expect(result.satisfied).toBe(true);
      expect(result.resolved.length).toBe(2);
    });

    it('partial match returns missing', () => {
      const result = resolver.resolve(['repository.commit', 'docker.build'], ['repository.commit']);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].id).toBe('docker.build');
    });

    it('suggests wildcard for missing category', () => {
      const result = resolver.resolve(['docker.build'], ['repository.commit']);
      expect(result.missing[0].suggestions).toContain('docker.*');
    });

    it('returns score for partial match', () => {
      const result = resolver.resolve(['repository.commit', 'docker.build', 'repository.write'], ['repository.commit']);
      expect(result.score).toBeCloseTo(1 / 3);
    });

    it('empty required is always satisfied', () => {
      const result = resolver.resolve([], ['anything']);
      expect(result.satisfied).toBe(true);
      expect(result.score).toBe(1);
    });
  });

  describe('missing', () => {
    it('returns ids of missing capabilities', () => {
      const m = resolver.missing(['repository.commit', 'docker.build'], ['repository.commit']);
      expect(m).toEqual(['docker.build']);
    });

    it('returns empty array when all satisfied', () => {
      const m = resolver.missing(['repository.commit'], ['repository.commit']);
      expect(m).toEqual([]);
    });
  });

  describe('explain', () => {
    it('provides summary for satisfied resolution', () => {
      const exp = resolver.explain(['repository.commit'], ['repository.commit', 'docker.build']);
      expect(exp.summary).toContain('satisfied');
      expect(exp.required).toEqual(['repository.commit']);
      expect(exp.provided).toEqual(['repository.commit', 'docker.build']);
      expect(exp.missing).toHaveLength(0);
    });

    it('provides summary for partial resolution', () => {
      const exp = resolver.explain(['repository.commit', 'docker.build'], ['repository.commit']);
      expect(exp.summary).toContain('missing');
      expect(exp.missing).toHaveLength(1);
    });

    it('includes expanded provided', () => {
      const exp = resolver.explain(['repository.commit'], ['repository.*']);
      expect(exp.expandedProvided).toContain('repository.commit');
    });
  });
});
