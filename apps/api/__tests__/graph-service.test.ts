import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EngineeringGraphService } from '../src/graph/service.js';

// Point the service at the actual repo root so the documentation source
// contributes real entities.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function mockCtx(): any {
  const empty = async () => [];
  return {
    repoPath: REPO_ROOT,
    workspaceDir: path.join(REPO_ROOT, '.vestara'),
    runtime: {
      getSession: () => ({ fingerprint: { id: 'test-workspace' }, profile: {} }),
    },
    plans: { list: empty },
    changeSets: { listByWorkspace: empty },
    verifications: { listByWorkspace: empty },
    collaboration: { listByWorkspace: empty },
    agents: {
      listAgents: empty,
      listExecutions: empty,
      listExecutionSessions: empty,
    },
    projects: { listProjects: empty },
    telemetry: {
      getAllAgents: () => [],
      getEvents: () => [],
    },
  };
}

describe('EngineeringGraphService', () => {
  it('hydrates a graph with a repository and real documents', async () => {
    const svc = new EngineeringGraphService(mockCtx());
    const stats = await svc.stats();
    expect(stats.nodes).toBeGreaterThan(0);
    expect(stats.kinds.repository).toBe(1);
    expect(stats.kinds.document ?? 0).toBeGreaterThan(0);
    expect(stats.kinds.plan).toBeUndefined(); // no plans in the empty mock
  });

  it('resolves the repository entity and searches it', async () => {
    const svc = new EngineeringGraphService(mockCtx());
    const repo = await svc.entity('repository://vestara-ai-core');
    expect(repo).not.toBeNull();
    const results = await svc.search('readme');
    expect(results.length).toBeGreaterThan(0);
  });

  it('produces health checks and insights without crashing on empty data', async () => {
    const svc = new EngineeringGraphService(mockCtx());
    const health = await svc.health();
    expect(health.checks.length).toBeGreaterThan(0);
    const insights = await svc.insights();
    expect(Array.isArray(insights)).toBe(true);
  });

  it('builds relationships between documents and the repository', async () => {
    const svc = new EngineeringGraphService(mockCtx());
    const repo = await svc.entity('repository://vestara-ai-core');
    const rels = await svc.relationships(repo!.id, { direction: 'in', limit: 100 });
    const docEdges = rels.filter((r) => r.type === 'documents');
    expect(docEdges.length).toBeGreaterThan(0);
  });
});
