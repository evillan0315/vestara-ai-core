import { describe, expect, it } from 'vitest';

describe('@vestara/types', () => {
  it('exports common types', () => {
    const mod = require('../dist/index.js');
    expect(mod).toBeDefined();
  });

  it('exports branded ID types', () => {
    const mod = require('../dist/index.js');
    expect(mod).toBeDefined();
  });

  it('exports runtime types', () => {
    const mod = require('../dist/index.js');
    expect(mod.RuntimeHealthLevel).toBeUndefined();
    expect(mod).toBeDefined();
  });

  it('exports permission roles and operations', () => {
    const mod = require('../dist/index.js');
    expect(mod.ROLE_LEVELS).toBeDefined();
    expect(mod.ROLE_PERMISSIONS).toBeDefined();
    expect(mod.ROLE_LEVELS.owner).toBe(100);
    expect(mod.ROLE_LEVELS.guest).toBe(10);
    expect(mod.ROLE_PERMISSIONS.owner.length).toBeGreaterThan(mod.ROLE_PERMISSIONS.observer.length);
  });

  it('owner has all permissions', () => {
    const mod = require('../dist/index.js');
    expect(mod.ROLE_PERMISSIONS.owner).toContain('runtime:delete');
    expect(mod.ROLE_PERMISSIONS.owner).toContain('permission:grant');
    expect(mod.ROLE_PERMISSIONS.owner).toContain('runtime:create');
    expect(mod.ROLE_PERMISSIONS.owner).toContain('system:shutdown');
  });

  it('guest has minimal permissions', () => {
    const mod = require('../dist/index.js');
    expect(mod.ROLE_PERMISSIONS.guest).not.toContain('runtime:create');
    expect(mod.ROLE_PERMISSIONS.guest).not.toContain('job:submit');
    expect(mod.ROLE_PERMISSIONS.guest).toContain('runtime:read');
    expect(mod.ROLE_PERMISSIONS.guest).toContain('resource:read');
  });

  describe('formatCapability', () => {
    it('formats capability without proficiency', () => {
      const mod = require('../dist/index.js');
      const result = mod.formatCapability({
        domain: 'language',
        category: 'typescript',
        action: 'develop',
      });
      expect(result).toBe('language:typescript:develop');
    });

    it('formats capability with proficiency', () => {
      const mod = require('../dist/index.js');
      const result = mod.formatCapability({
        domain: 'language',
        category: 'rust',
        action: 'develop',
        proficiency: 3,
      });
      expect(result).toBe('language:rust:develop@3');
    });

    it('formats capability with level 0 proficiency', () => {
      const mod = require('../dist/index.js');
      const result = mod.formatCapability({
        domain: 'security',
        category: 'audit',
        action: 'review',
        proficiency: 0,
      });
      expect(result).toBe('security:audit:review@0');
    });
  });

  describe('parseCapability', () => {
    it('parses standard capability string', () => {
      const mod = require('../dist/index.js');
      const result = mod.parseCapability('language:typescript:develop');
      expect(result).toEqual({
        domain: 'language',
        category: 'typescript',
        action: 'develop',
        proficiency: undefined,
      });
    });

    it('parses capability with proficiency', () => {
      const mod = require('../dist/index.js');
      const result = mod.parseCapability('language:rust:develop@3');
      expect(result).toEqual({
        domain: 'language',
        category: 'rust',
        action: 'develop',
        proficiency: 3,
      });
    });

    it('returns null for malformed string', () => {
      const mod = require('../dist/index.js');
      expect(mod.parseCapability('invalid')).toBeNull();
    });

    it('returns null for out-of-range proficiency', () => {
      const mod = require('../dist/index.js');
      expect(mod.parseCapability('language:rust:develop@9')).toBeNull();
    });
  });

  describe('matchCapability', () => {
    it('matches exact capability', () => {
      const mod = require('../dist/index.js');
      const result = mod.matchCapability(
        { domain: 'language', category: 'typescript', action: 'develop', proficiency: 2 },
        { domain: 'language', category: 'typescript', action: 'develop', proficiency: 2 },
      );
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1);
    });

    it('matches with higher proficiency', () => {
      const mod = require('../dist/index.js');
      const result = mod.matchCapability(
        { domain: 'language', category: 'typescript', action: 'develop', proficiency: 2 },
        { domain: 'language', category: 'typescript', action: 'develop', proficiency: 4 },
      );
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails on mismatched domain', () => {
      const mod = require('../dist/index.js');
      const result = mod.matchCapability(
        { domain: 'language', category: 'rust', action: 'develop' },
        { domain: 'infrastructure', category: 'rust', action: 'develop' },
      );
      expect(result.matched).toBe(false);
      expect(result.score).toBe(0);
    });

    it('fails on mismatched action', () => {
      const mod = require('../dist/index.js');
      const result = mod.matchCapability(
        { domain: 'language', category: 'typescript', action: 'develop' },
        { domain: 'language', category: 'typescript', action: 'review' },
      );
      expect(result.matched).toBe(false);
      expect(result.score).toBe(0);
    });

    it('partial match when proficiency is lower', () => {
      const mod = require('../dist/index.js');
      const result = mod.matchCapability(
        { domain: 'language', category: 'typescript', action: 'develop', proficiency: 4 },
        { domain: 'language', category: 'typescript', action: 'develop', proficiency: 2 },
      );
      expect(result.matched).toBe(false);
      expect(result.score).toBe(0.5);
    });

    it('matches with no proficiency required', () => {
      const mod = require('../dist/index.js');
      const result = mod.matchCapability(
        { domain: 'repository', category: 'git', action: 'analyze' },
        { domain: 'repository', category: 'git', action: 'analyze', proficiency: 2 },
      );
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1);
    });
  });
});
