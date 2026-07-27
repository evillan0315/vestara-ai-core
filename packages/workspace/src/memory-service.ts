/**
 * MemoryService — Indexes workspace artifacts into a knowledge graph.
 *
 * Builds persistent organizational memory across repositories, artifacts,
 * decisions, agents, failures, and architectural evolution.
 *
 * Architecture Traceability:
 *   PCS: PCS-008 — Memory & Knowledge Graph
 *   Safety: Memory may inform decisions. Memory may not silently change decisions.
 *   Every learned fact must have provenance.
 */

import type { AgentStorage } from './agent-storage';
import type { ChangeSetStorage } from './change-set-storage';
import type { CollaborationStorage } from './collaboration-storage';
import type { KnowledgeGraphStorage } from './knowledge-graph-storage';
import type { PlanStorage } from './plan-storage';
import type { KnowledgeNode, KnowledgeRelation } from './types';
import type { VerificationStorage } from './verification-storage';
import type { WorkspaceSession } from './workspace-session';

export interface IndexReport {
  nodes: number;
  relations: number;
  duration: number;
}

export class MemoryService {
  private graph: KnowledgeGraphStorage;
  private planStorage?: PlanStorage;
  private csStorage?: ChangeSetStorage;
  private vrStorage?: VerificationStorage;
  private collabStorage?: CollaborationStorage;
  private agentStorage?: AgentStorage;

  constructor(opts: {
    graph: KnowledgeGraphStorage;
    planStorage?: PlanStorage;
    csStorage?: ChangeSetStorage;
    vrStorage?: VerificationStorage;
    collabStorage?: CollaborationStorage;
    agentStorage?: AgentStorage;
  }) {
    this.graph = opts.graph;
    this.planStorage = opts.planStorage;
    this.csStorage = opts.csStorage;
    this.vrStorage = opts.vrStorage;
    this.collabStorage = opts.collabStorage;
    this.agentStorage = opts.agentStorage;
  }

  async index(session: WorkspaceSession): Promise<IndexReport> {
    const startTime = performance.now();
    const profile = session.profile;

    const repoNode: KnowledgeNode = {
      id: `kg-repo-${session.fingerprint.id}`,
      type: 'repository',
      name: profile.name,
      description: `${profile.language} project with ${profile.packageCount} packages`,
      sourceArtifacts: ['workspace.json'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.graph.upsertNode(repoNode);

    for (const pkg of profile.packages) {
      const node: KnowledgeNode = {
        id: `kg-module-${pkg.name.replace(/[^a-zA-Z0-9]/g, '-')}`,
        type: 'module',
        name: pkg.name,
        description: `Package at ${pkg.path} with ${pkg.dependencies.length} dependencies`,
        sourceArtifacts: [`${pkg.path}/package.json`],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.graph.upsertNode(node);
      await this.graph.addRelation({
        id: `kg-rel-${repoNode.id}-${node.id}`,
        sourceId: repoNode.id,
        targetId: node.id,
        type: 'depends-on',
        createdAt: new Date().toISOString(),
      });
    }

    if (this.planStorage) {
      const plans = await this.planStorage.list(session.fingerprint.id);
      for (const plan of plans) {
        await this.graph.upsertNode({
          id: `kg-plan-${plan.id}`,
          type: 'decision',
          name: `Plan ${plan.id}: ${plan.title}`,
          description: plan.goal,
          sourceArtifacts: [`plan:${plan.id}`],
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
        });
      }
    }

    if (this.csStorage) {
      const csList = await this.csStorage.listByWorkspace(session.fingerprint.id);
      for (const cs of csList) {
        await this.graph.upsertNode({
          id: `kg-cs-${cs.id}`,
          type: 'artifact',
          name: `Change Set ${cs.id}: ${cs.title}`,
          description: `${cs.files.length} files modified, status: ${cs.status}`,
          sourceArtifacts: [`changeset:${cs.id}`],
          createdAt: cs.createdAt,
          updatedAt: cs.appliedAt ?? cs.createdAt,
        });
      }
    }

    if (this.collabStorage) {
      const records = await this.collabStorage.listByWorkspace(session.fingerprint.id);
      for (const rec of records) {
        await this.graph.upsertNode({
          id: `kg-cr-${rec.id}`,
          type: 'decision',
          name: `Review ${rec.id}: ${rec.status}`,
          description: `${rec.approvals.length} approvals, ${rec.comments.length} comments`,
          sourceArtifacts: [`collaboration:${rec.id}`],
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
        });
      }
    }

    if (this.agentStorage) {
      const execs = await this.agentStorage.listExecutions();
      for (const exec of execs) {
        await this.graph.upsertNode({
          id: `kg-exec-${exec.id}`,
          type: 'agent',
          name: `Agent execution: ${exec.agentId}`,
          description: exec.task,
          sourceArtifacts: [`execution:${exec.id}`],
          createdAt: exec.startedAt,
          updatedAt: exec.completedAt ?? exec.startedAt,
        });
      }
    }

    const stats = await this.graph.getStats();
    return {
      nodes: stats.nodes,
      relations: stats.relations,
      duration: Math.round(performance.now() - startTime),
    };
  }

  async search(query: string, limit = 10): Promise<{ node: KnowledgeNode; relations: KnowledgeRelation[] }[]> {
    const nodes = await this.graph.searchNodes(query, limit);
    const results: { node: KnowledgeNode; relations: KnowledgeRelation[] }[] = [];
    for (const node of nodes) {
      const relations = await this.graph.getRelations(node.id);
      results.push({ node, relations });
    }
    return results;
  }

  async explain(concept: string): Promise<string> {
    const nodes = await this.graph.searchNodes(concept, 5);
    if (nodes.length === 0) return `No knowledge found for "${concept}".`;

    const lines: string[] = [];
    for (const node of nodes) {
      lines.push(`${node.name}`);
      lines.push(`Type: ${node.type}`);
      lines.push(`Description: ${node.description}`);
      lines.push('');

      const relations = await this.graph.getRelations(node.id);
      if (relations.length > 0) {
        for (const rel of relations) {
          const relatedId = rel.sourceId === node.id ? rel.targetId : rel.sourceId;
          const related = await this.graph.getNode(relatedId);
          if (related) {
            lines.push(`  ${rel.type}: ${related.name}`);
          }
        }
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  async getGraph(): Promise<string> {
    const stats = await this.graph.getStats();
    const nodes = await this.graph.getAllNodes();
    const relations = await this.graph.getAllRelations();

    const lines: string[] = [];
    lines.push(`Knowledge Graph (${stats.nodes} nodes, ${stats.relations} relations)`);
    lines.push('');

    const byType: Record<string, KnowledgeNode[]> = {};
    for (const node of nodes) {
      (byType[node.type] ??= []).push(node);
    }

    for (const [type, typeNodes] of Object.entries(byType)) {
      lines.push(`${type}s:`);
      for (const node of typeNodes.slice(0, 10)) {
        const outRels = relations.filter((r) => r.sourceId === node.id);
        lines.push(`  • ${node.name}`);
        if (outRels.length > 0) {
          lines.push(`     outgoing: ${outRels.length} relations`);
        }
      }
      if (typeNodes.length > 10) {
        lines.push(`     ... and ${typeNodes.length - 10} more`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  renderSearchResults(results: { node: KnowledgeNode; relations: KnowledgeRelation[] }[]): string {
    if (results.length === 0) return 'No results found.';
    const lines: string[] = [];
    for (const { node, relations } of results) {
      lines.push(`• ${node.name}`);
      lines.push(`  Type: ${node.type}`);
      if (relations.length > 0) {
        lines.push(`  Relations: ${relations.length}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}
