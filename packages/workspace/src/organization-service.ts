/**
 * OrganizationService — Cross-repository intelligence for organizations.
 *
 * Extends the knowledge graph across multiple repositories for:
 *   - Cross-repo search
 *   - Dependency discovery
 *   - Impact analysis
 *   - Organization knowledge graph
 *
 * Architecture Traceability:
 *   PCS: PCS-012 — Multi-Repository Intelligence
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { OrganizationStorage } from './organization-storage';
import type { Organization, OrganizationRepository } from './types';

export class OrganizationService {
  private storage: OrganizationStorage;

  constructor(opts: { storage: OrganizationStorage }) {
    this.storage = opts.storage;
  }

  async createOrganization(name: string, description: string): Promise<Organization> {
    return this.storage.create(name, description);
  }

  async listOrganizations(): Promise<Organization[]> {
    return this.storage.list();
  }

  async getOrganization(id: string): Promise<Organization | null> {
    return this.storage.get(id);
  }

  async addRepository(orgId: string, repoPath: string): Promise<OrganizationRepository> {
    const resolvedPath = path.resolve(repoPath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`Path does not exist: ${resolvedPath}`);

    const name = path.basename(resolvedPath);
    const repo: OrganizationRepository = {
      id: `repo-${Date.now()}`,
      path: resolvedPath,
      name,
      lastIndexed: null,
    };

    await this.storage.addRepository(orgId, repo);

    // Detect dependencies with other repos in the org
    const org = await this.storage.get(orgId);
    if (org) {
      for (const other of org.repositories) {
        if (other.id === repo.id) continue;
        if (this.hasDependency(resolvedPath, other.path)) {
          await this.storage.addRelation(repo.name, other.name, 'depends-on', `${repo.name} depends on ${other.name}`);
        }
        if (this.hasDependency(other.path, resolvedPath)) {
          await this.storage.addRelation(other.name, repo.name, 'depends-on', `${other.name} depends on ${repo.name}`);
        }
      }
    }

    return repo;
  }

  async searchCrossRepo(orgId: string, query: string): Promise<Array<{ repo: string; matches: string[] }>> {
    const repos = await this.storage.getReposForOrg(orgId);
    const results: Array<{ repo: string; matches: string[] }> = [];
    const lowerQuery = query.toLowerCase();

    for (const repo of repos) {
      try {
        const entries = fs.readdirSync(repo.path, { withFileTypes: true });
        const matchedFiles: string[] = [];
        for (const entry of entries) {
          if (entry.isFile() && entry.name.toLowerCase().includes('package.json')) {
            const pkg = JSON.parse(fs.readFileSync(path.join(repo.path, entry.name), 'utf-8'));
            const searchable = JSON.stringify(pkg).toLowerCase();
            if (searchable.includes(lowerQuery)) {
              matchedFiles.push(entry.name);
            }
          }
        }
        if (matchedFiles.length > 0) {
          results.push({ repo: repo.name, matches: matchedFiles });
        }
      } catch {
        // skip repos that can't be read
      }
    }
    return results;
  }

  async impactAnalysis(_orgId: string, repoName: string): Promise<Array<{ dependent: string; type: string }>> {
    const relations = await this.storage.getRelations();
    return relations
      .filter((r) => r.sourceRepo === repoName || r.targetRepo === repoName)
      .map((r) => ({
        dependent: r.sourceRepo === repoName ? r.targetRepo : r.sourceRepo,
        type: r.type,
      }));
  }

  async getGraph(orgId: string): Promise<{ nodes: string[]; edges: string[] }> {
    const org = await this.storage.get(orgId);
    if (!org) return { nodes: [], edges: [] };
    const relations = await this.storage.getRelations();
    return {
      nodes: org.repositories.map((r) => r.name),
      edges: relations.map((r) => `${r.sourceRepo} → ${r.targetRepo} [${r.type}]`),
    };
  }

  private hasDependency(repoPath: string, potentialDepPath: string): boolean {
    try {
      const pkgPath = path.join(repoPath, 'package.json');
      if (!fs.existsSync(pkgPath)) return false;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depName = path.basename(potentialDepPath);
      return Object.keys(allDeps).some((d) => d.includes(depName));
    } catch {
      return false;
    }
  }

  renderOrg(org: Organization): string {
    const lines: string[] = [];
    lines.push(`Organization: ${org.name}`);
    lines.push(`ID: ${org.id}`);
    lines.push(`Description: ${org.description}`);
    lines.push(`Repositories: ${org.repositories.length}`);
    lines.push('');
    for (const repo of org.repositories) {
      const indexed = repo.lastIndexed ?? 'never';
      lines.push(`  • ${repo.name} (${repo.path}) — last indexed: ${indexed}`);
    }
    return lines.join('\n');
  }

  renderGraph(graph: { nodes: string[]; edges: string[] }): string {
    if (graph.nodes.length === 0) return 'No repositories in organization.';
    const lines: string[] = [];
    lines.push('Organization Knowledge Graph');
    lines.push(`Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}`);
    lines.push('');
    lines.push('Repositories:');
    for (const node of graph.nodes) {
      lines.push(`  • ${node}`);
    }
    lines.push('');
    if (graph.edges.length > 0) {
      lines.push('Dependencies:');
      for (const edge of graph.edges) {
        lines.push(`  ${edge}`);
      }
    }
    return lines.join('\n');
  }

  renderImpact(results: Array<{ dependent: string; type: string }>): string {
    if (results.length === 0) return 'No dependencies found.';
    const lines: string[] = [];
    lines.push('Impact Analysis:');
    for (const r of results) {
      lines.push(`  • ${r.dependent} (${r.type})`);
    }
    return lines.join('\n');
  }
}
