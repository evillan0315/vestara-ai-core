import { describe, expect, it } from 'vitest';

const {
  DefaultCapabilityMatcher,
  DefaultCapabilityCatalog,
  DefaultCapabilityHierarchy,
  createCapabilityProfile,
  BUILTIN_TAXONOMY,
  getBuiltinDefinitions,
  getBuiltinRelationships,
  isBuiltinCapability,
} = require('../dist/index.js');

describe('Capability model', () => {
  it('creates builtin capability definitions', () => {
    const defs = getBuiltinDefinitions();
    expect(defs.length).toBeGreaterThan(80);
  });

  it('each capability has required fields', () => {
    const defs = getBuiltinDefinitions();
    for (const d of defs) {
      expect(d.id).toBeTruthy();
      expect(d.category).toBeTruthy();
      expect(d.name).toBeTruthy();
      expect(d.version).toBe('1.0.0');
      expect(['stable', 'beta', 'alpha', 'deprecated']).toContain(d.stability);
      expect(d.description).toBeTruthy();
    }
  });

  it('builtin capabilities have unique ids', () => {
    const defs = getBuiltinDefinitions();
    const ids = defs.map((d: any) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('CapabilityHierarchy', () => {
  it('builds tree from definitions', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    const roots = h.getRoots();
    expect(roots.length).toBeGreaterThan(5);
  });

  it('returns children for a category', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    const children = h.getChildren('repository');
    expect(children.length).toBeGreaterThan(5);
    expect(children.every((c: any) => c.capability?.category === 'repository')).toBe(true);
  });

  it('returns parent for a leaf', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    const parent = h.getParent('repository.commit');
    expect(parent?.id).toBe('repository');
  });

  it('returns ancestors for deep capability', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    const ancestors = h.getAncestors('repository.commit');
    expect(ancestors).toContain('repository');
  });

  it('returns descendants for a category', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    const descendants = h.getDescendants('docker');
    expect(descendants.length).toBeGreaterThan(3);
    expect(descendants).toContain('docker.build');
  });

  it('isChildOf checks ancestry', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    expect(h.isChildOf('docker.build', 'docker')).toBe(true);
    expect(h.isChildOf('repository.commit', 'docker')).toBe(false);
  });

  it('findLeaves returns all leaf capabilities', () => {
    const defs = getBuiltinDefinitions();
    const h = new DefaultCapabilityHierarchy(defs);
    const leaves = h.findLeaves();
    expect(leaves.length).toBeGreaterThan(80);
  });
});

describe('CapabilityMatcher', () => {
  const m = new DefaultCapabilityMatcher();

  it('exact match', () => {
    expect(m.exact('repository.commit', 'repository.commit')).toBe(true);
    expect(m.exact('repository.commit', 'repository.write')).toBe(false);
  });

  it('compatible with wildcard', () => {
    expect(m.compatible('repository.*', 'repository.commit')).toBe(true);
    expect(m.compatible('repository.*', 'git.commit')).toBe(false);
    expect(m.compatible('*', 'anything')).toBe(true);
  });

  it('subset detects unmatched', () => {
    const result = m.subset(['repository.commit', 'docker.build'], ['repository.commit', 'repository.write']);
    expect(result.matched).toBe(false);
    expect(result.unmatched).toEqual(['docker.build']);
  });

  it('subset returns full match', () => {
    const result = m.subset(['repository.commit'], ['repository.commit', 'docker.build']);
    expect(result.matched).toBe(true);
    expect(result.unmatched).toEqual([]);
  });

  it('subset with wildcards', () => {
    const result = m.subset(['repository.*'], ['repository.commit', 'repository.write']);
    expect(result.matched).toBe(true);
  });

  it('distance is 0 for exact match', () => {
    expect(m.distance('a.b.c', 'a.b.c')).toBe(0);
  });

  it('distance increases with fewer common segments', () => {
    expect(m.distance('a.b.c', 'a.b.d')).toBe(2);
    expect(m.distance('a.b.c', 'x.y.z')).toBe(6);
  });
});

describe('CapabilityCatalog', () => {
  it('registers definitions', () => {
    const cat = new DefaultCapabilityCatalog();
    cat.register({
      id: 'test.alpha',
      category: 'test',
      name: 'alpha',
      version: '1.0.0',
      stability: 'stable',
      description: 'Test',
    });
    expect(cat.exists('test.alpha')).toBe(true);
    expect(cat.find('test.alpha')?.name).toBe('alpha');
  });

  it('registers relationships', () => {
    const cat = new DefaultCapabilityCatalog();
    cat.register({
      id: 'test.a',
      category: 'test',
      name: 'a',
      version: '1.0.0',
      stability: 'stable',
      description: 'A',
    });
    cat.register({
      id: 'test.b',
      category: 'test',
      name: 'b',
      version: '1.0.0',
      stability: 'stable',
      description: 'B',
    });
    cat.registerRelationships('test.a', { requires: ['test.b'] });
    const rels = cat.getRelationships('test.a');
    expect(rels.requires).toContain('test.b');
  });

  it('search finds by id, name, category, description', () => {
    const cat = new DefaultCapabilityCatalog();
    cat.register({
      id: 'custom.build',
      category: 'custom',
      name: 'build',
      version: '1.0.0',
      stability: 'stable',
      description: 'Custom build tool',
    });
    expect(cat.search('build').length).toBeGreaterThan(0);
    expect(cat.search('custom').length).toBeGreaterThan(0);
  });

  it('list returns all registered', () => {
    const defs = getBuiltinDefinitions();
    const cat = new DefaultCapabilityCatalog();
    for (const d of defs) cat.register(d);
    expect(cat.list().length).toBe(defs.length);
  });

  it('validate checks existence and reference integrity', () => {
    const cat = new DefaultCapabilityCatalog();
    cat.register({
      id: 'test.x',
      category: 'test',
      name: 'x',
      version: '1.0.0',
      stability: 'stable',
      description: 'X',
    });
    cat.registerRelationships('test.x', { requires: ['test.y'] });
    const results = cat.validate(['test.x', 'nonexistent']);
    expect(results.find((r: any) => r.id === 'nonexistent')?.valid).toBe(false);
    expect(results.find((r: any) => r.id === 'test.x')?.valid).toBe(false);
  });

  it('findChildren returns capabilities under a category', () => {
    const defs = getBuiltinDefinitions();
    const cat = new DefaultCapabilityCatalog();
    for (const d of defs) cat.register(d);
    const children = cat.findChildren('repository');
    expect(children.length).toBeGreaterThan(5);
  });

  it('findDescendants returns all nested capabilities', () => {
    const defs = getBuiltinDefinitions();
    const cat = new DefaultCapabilityCatalog();
    for (const d of defs) cat.register(d);
    const descendants = cat.findDescendants('docker');
    expect(descendants.length).toBeGreaterThan(3);
  });
});

describe('CapabilityProfile', () => {
  it('creates profile from capability list', () => {
    const p = createCapabilityProfile(['repository.commit', 'docker.build']);
    expect(p.toList()).toEqual(['repository.commit', 'docker.build']);
  });

  it('match returns true when all required capabilities present', () => {
    const p = createCapabilityProfile(['repository.commit', 'docker.build', 'agent.implement']);
    const result = p.match(['repository.commit', 'docker.build']);
    expect(result.matched).toBe(true);
  });

  it('match returns false when capability missing', () => {
    const p = createCapabilityProfile(['repository.commit']);
    const result = p.match(['docker.build']);
    expect(result.matched).toBe(false);
    expect(result.unmatched).toEqual(['docker.build']);
  });

  it('matchProfile compares two profiles', () => {
    const worker = createCapabilityProfile(['repository.*', 'docker.build']);
    const job = createCapabilityProfile(['repository.commit', 'docker.build']);
    const result = worker.matchProfile(job);
    expect(result.matched).toBe(true);
  });

  it('excluded capabilities are removed', () => {
    const p = createCapabilityProfile(['repository.*', 'docker.build'], ['docker.build']);
    expect(p.toList()).not.toContain('docker.build');
  });

  it('match with wildcard against specific', () => {
    const p = createCapabilityProfile(['repository.*']);
    const result = p.match(['repository.commit', 'repository.write']);
    expect(result.matched).toBe(true);
  });
});

describe('Built-in taxonomy integrity', () => {
  it('all relationship targets are valid capability ids', () => {
    const defs = getBuiltinDefinitions();
    const ids = new Set(defs.map((d: any) => d.id));
    for (const entry of BUILTIN_TAXONOMY) {
      const rels = entry.relationships;
      if (!rels) continue;
      for (const key of ['requires', 'mayProduce', 'verifies', 'conflicts', 'implies'] as const) {
        for (const target of rels[key] ?? []) {
          expect(ids.has(target)).toBe(true);
        }
      }
    }
  });

  it('isBuiltinCapability works', () => {
    expect(isBuiltinCapability('repository.commit')).toBe(true);
    expect(isBuiltinCapability('nonexistent')).toBe(false);
  });

  it('getBuiltinRelationships returns relationships', () => {
    const rels = getBuiltinRelationships('repository.commit');
    expect(rels).toBeTruthy();
    expect(rels?.requires).toContain('repository.write');
  });

  it('capabilities are organized into categories', () => {
    const defs = getBuiltinDefinitions();
    const categories = new Set(defs.map((d: any) => d.category));
    expect(categories).toContain('repository');
    expect(categories).toContain('git');
    expect(categories).toContain('agent');
    expect(categories).toContain('ai');
    expect(categories).toContain('docker');
    expect(categories).toContain('verification');
    expect(categories).toContain('tool');
    expect(categories).toContain('infrastructure');
    expect(categories).toContain('knowledge');
    expect(categories).toContain('human');
    expect(categories).toContain('system');
  });
});

// ── Success criteria: 6 questions ──────────────────────────

describe('Success criteria: 6 questions', () => {
  const defs = getBuiltinDefinitions();
  const cat = new DefaultCapabilityCatalog();
  for (const d of defs) cat.register(d);
  for (const entry of BUILTIN_TAXONOMY) {
    if (entry.relationships) {
      cat.registerRelationships(entry.definition.id, entry.relationships);
    }
  }

  it('Q1: Can this worker execute this job?', () => {
    const aiWorker = createCapabilityProfile([
      'repository.*',
      'agent.*',
      'ai.*',
      'verification.*',
      'tool.filesystem-read',
      'tool.filesystem-write',
      'tool.shell-exec',
    ]);
    const job = createCapabilityProfile(['agent.implement', 'repository.commit', 'verification.test']);
    const result = aiWorker.matchProfile(job);
    expect(result.matched).toBe(true);

    const limitedWorker = createCapabilityProfile(['ai.chat']);
    const cannotResult = limitedWorker.matchProfile(job);
    expect(cannotResult.matched).toBe(false);
  });

  it('Q2: Which workers support repository.commit?', () => {
    const allWorkers = [
      { id: 'ai-worker-1', caps: ['repository.*', 'agent.*'] },
      { id: 'human-reviewer', caps: ['human.review', 'human.approve'] },
      { id: 'ci-runner', caps: ['docker.build', 'verification.*'] },
    ];
    const supporting = allWorkers.filter((w) => {
      const p = createCapabilityProfile(w.caps);
      return p.match(['repository.commit']).matched;
    });
    expect(supporting.map((w) => w.id)).toEqual(['ai-worker-1']);
  });

  it('Q3: What capabilities does an AIWorker advertise?', () => {
    const aiWorkerCaps = [
      'ai.chat',
      'ai.reason',
      'ai.generate',
      'ai.analyze',
      'ai.summarize',
      'ai.explain',
      'ai.suggest',
    ];
    const p = createCapabilityProfile(aiWorkerCaps);
    const list = p.toList();
    expect(list).toContain('ai.chat');
    expect(list).toContain('ai.reason');
    expect(list).toContain('ai.generate');
    expect(list.length).toBe(7);
  });

  it('Q4: Which capabilities are implied by agent.implement?', () => {
    const rels = cat.getRelationships('agent.implement');
    expect(rels.requires).toContain('agent.plan');
    expect(rels.mayProduce).toContain('repository.commit');
    expect(rels.mayProduce).toContain('agent.review');
  });

  it('Q5: Is repository.write sufficient for repository.commit?', () => {
    // repository.commit requires repository.write
    const rels = cat.getRelationships('repository.commit');
    expect(rels.requires).toContain('repository.write');
    // Check: can repository.write satisfy repository.commit?
    const profile = createCapabilityProfile(['repository.write']);
    const result = profile.match(['repository.commit']);
    // repository.write is NOT sufficient — you need repository.commit itself
    expect(result.matched).toBe(false);
  });

  it('Q6: Which jobs require docker.build?', () => {
    const jobs = [
      { id: 'job-deploy', caps: ['docker.build', 'docker.push'] },
      { id: 'job-test', caps: ['verification.test'] },
      { id: 'job-build', caps: ['docker.build'] },
    ];
    const requiringDocker = jobs.filter((j) => {
      const p = createCapabilityProfile(j.caps);
      return p.match(['docker.build']).matched;
    });
    expect(requiringDocker.map((j) => j.id)).toEqual(['job-deploy', 'job-build']);
  });
});
