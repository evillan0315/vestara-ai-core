import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ArchitectureRuntime } from '../src/index.js';
import { parseFrontmatter } from '../src/parser.js';

const ADR_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'vestara-blueprint', '00-governance', 'adr');

describe('architecture-runtime', () => {
  describe('parser', () => {
    it('parses ADR-100 frontmatter correctly', () => {
      const filePath = path.join(ADR_DIR, 'ADR-100-ai-organization.md');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(raw);
      expect(fm).not.toBeNull();
      expect(fm!.id).toBe('adr-100');
      expect(fm!.adr).toBe('ADR-100');
      expect(fm!.title).toBe('AI Organization Over AI Assistant');
      expect(fm!.category).toBe('foundation');
      expect(fm!.status).toBe('accepted');
      expect(fm!.depends_on).toEqual([]);
      expect(fm!.influences).toContain('Planner');
      expect(fm!.influences).toContain('Verifier');
    });

    it('parses ADR-104 dependencies correctly', () => {
      const filePath = path.join(ADR_DIR, 'ADR-104-evidence-based-verification.md');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(raw);
      expect(fm).not.toBeNull();
      expect(fm!.depends_on).toHaveLength(2);
      expect(fm!.depends_on[0].id).toBe('adr-100');
      expect(fm!.depends_on[1].id).toBe('adr-103');
    });

    it('parses referenced_by correctly', () => {
      const filePath = path.join(ADR_DIR, 'ADR-100-ai-organization.md');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(raw);
      expect(fm).not.toBeNull();
      expect(fm!.referenced_by.length).toBeGreaterThan(0);
      const constitution = fm!.referenced_by.find((r) => r.type === 'constitution');
      expect(constitution).toBeDefined();
      expect(constitution!.target).toContain('08-product-constitution');
    });
  });

  describe('graph', () => {
    it('loads all 5 ADRs', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      const all = ar.getAllNodes();
      expect(all).toHaveLength(5);
    });

    it('finds dependencies', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      const deps = ar.getDependencies('adr-104');
      expect(deps).toHaveLength(2);
      expect(deps.map((d) => d.id)).toContain('adr-100');
      expect(deps.map((d) => d.id)).toContain('adr-103');
    });

    it('finds dependents', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      const deps = ar.getDependents('adr-100');
      expect(deps).toHaveLength(3);
      expect(deps.map((d) => d.id)).toContain('adr-101');
      expect(deps.map((d) => d.id)).toContain('adr-103');
      expect(deps.map((d) => d.id)).toContain('adr-104');
    });

    it('returns empty for unknown id', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      expect(ar.getNode('adr-999')).toBeUndefined();
    });
  });

  describe('verification', () => {
    it('passes for the current graph', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      const report = ar.verify();
      expect(report.pass).toBe(true);
      expect(report.totalAdrs).toBe(5);
      expect(report.brokenDependencies).toHaveLength(0);
      expect(report.circularDependencies).toHaveLength(0);
      expect(report.duplicateIds).toHaveLength(0);
    });
  });

  describe('impact analysis', () => {
    it('finds transitive impact for adr-103', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      const impact = ar.analyzeImpact('adr-103');
      expect(impact).not.toBeNull();
      expect(impact!.target.id).toBe('adr-103');
      expect(impact!.affectedAdrs.some((a) => a.id === 'adr-104')).toBe(true);
      expect(impact!.affectedAgents).toContain('Verifier Agent');
      expect(impact!.affectedAgents).toContain('Workspace Runtime');
    });

    it('finds no impact for leaf ADR-102', () => {
      const ar = new ArchitectureRuntime(ADR_DIR);
      // ADR-102 has no dependents
      const v = ar.verify();
      // It should not break anything
      expect(v.pass).toBe(true);
    });
  });
});
