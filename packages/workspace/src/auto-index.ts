/**
 * AutoIndex — Automatically propagates artifact changes into the knowledge graph.
 *
 * Whenever a Plan, ChangeSet, Verification, or Collaboration artifact is
 * created or modified, the knowledge graph is updated without requiring an
 * explicit `memory index` command.
 *
 * Architecture Traceability:
 *   Product Principle: Every capability should leave the workspace richer
 *   Foundation: KnowledgeGraphStorage, MemoryService
 */

import type { ChangeSetStorage } from './change-set-storage';
import type { CollaborationStorage } from './collaboration-storage';
import type { KnowledgeGraphStorage } from './knowledge-graph-storage';
import type { PlanStorage } from './plan-storage';
import type { IndexStats } from './types';
import type { WorkspaceSession } from './workspace-session';

export class AutoIndex {
  private graph: KnowledgeGraphStorage;
  private planStorage?: PlanStorage;
  private csStorage?: ChangeSetStorage;
  private collabStorage?: CollaborationStorage;
  private indexedCount = 0;

  constructor(opts: {
    graph: KnowledgeGraphStorage;
    planStorage?: PlanStorage;
    csStorage?: ChangeSetStorage;
    collabStorage?: CollaborationStorage;
  }) {
    this.graph = opts.graph;
    this.planStorage = opts.planStorage;
    this.csStorage = opts.csStorage;
    this.collabStorage = opts.collabStorage;
  }

  /**
   * Index all existing artifacts in the workspace.
   */
  async indexAll(session: WorkspaceSession): Promise<number> {
    let count = 0;

    // Index repository as a node
    const profile = session.profile;
    await this.graph.upsertNode({
      id: `auto-repo-${session.fingerprint.id}`,
      type: 'repository',
      name: profile.name,
      description: `${profile.language} project, ${profile.packageCount} packages`,
      sourceArtifacts: ['workspace.json'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    count++;

    // Index plans
    if (this.planStorage) {
      const plans = await this.planStorage.list(session.fingerprint.id);
      for (const plan of plans) {
        await this.graph.upsertNode({
          id: `auto-plan-${plan.id}`,
          type: 'decision',
          name: `Plan ${plan.id}: ${plan.title}`,
          description: plan.goal,
          sourceArtifacts: [`plan:${plan.id}`],
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
        });
        count++;
      }
    }

    // Index change sets
    if (this.csStorage) {
      const csList = await this.csStorage.listByWorkspace(session.fingerprint.id);
      for (const cs of csList) {
        await this.graph.upsertNode({
          id: `auto-cs-${cs.id}`,
          type: 'artifact',
          name: `Change Set ${cs.id}: ${cs.title}`,
          description: `${cs.files.length} files, status: ${cs.status}`,
          sourceArtifacts: [`changeset:${cs.id}`],
          createdAt: cs.createdAt,
          updatedAt: cs.appliedAt ?? cs.createdAt,
        });
        count++;
      }
    }

    // Index collaboration records
    if (this.collabStorage) {
      const records = await this.collabStorage.listByWorkspace(session.fingerprint.id);
      for (const rec of records) {
        await this.graph.upsertNode({
          id: `auto-cr-${rec.id}`,
          type: 'decision',
          name: `Review ${rec.id}: ${rec.status}`,
          description: `${rec.approvals.length} approvals, ${rec.comments.length} comments`,
          sourceArtifacts: [`collaboration:${rec.id}`],
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
        });
        count++;
      }
    }

    this.indexedCount = count;
    return count;
  }

  /**
   * Index a single new plan.
   */
  async indexPlan(planId: string): Promise<void> {
    if (!this.planStorage) return;
    const plan = await this.planStorage.get(planId);
    if (!plan) return;
    await this.graph.upsertNode({
      id: `auto-plan-${plan.id}`,
      type: 'decision',
      name: `Plan ${plan.id}: ${plan.title}`,
      description: plan.goal,
      sourceArtifacts: [`plan:${plan.id}`],
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    });
    this.indexedCount++;
  }

  /**
   * Index a single new change set.
   */
  async indexChangeSet(csId: string): Promise<void> {
    if (!this.csStorage) return;
    const cs = await this.csStorage.get(csId);
    if (!cs) return;
    await this.graph.upsertNode({
      id: `auto-cs-${cs.id}`,
      type: 'artifact',
      name: `Change Set ${cs.id}: ${cs.title}`,
      description: `${cs.files.length} files, status: ${cs.status}`,
      sourceArtifacts: [`changeset:${cs.id}`],
      createdAt: cs.createdAt,
      updatedAt: cs.appliedAt ?? cs.createdAt,
    });
    this.indexedCount++;
  }

  /**
   * Index a single collaboration record.
   */
  async indexCollaboration(crId: string): Promise<void> {
    if (!this.collabStorage) return;
    const rec = await this.collabStorage.get(crId);
    if (!rec) return;
    await this.graph.upsertNode({
      id: `auto-cr-${rec.id}`,
      type: 'decision',
      name: `Review ${rec.id}: ${rec.status}`,
      description: `${rec.approvals.length} approvals, ${rec.comments.length} comments`,
      sourceArtifacts: [`collaboration:${rec.id}`],
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    });
    this.indexedCount++;
  }

  getStats(): IndexStats {
    return {
      totalArtifacts: this.indexedCount,
      indexedArtifacts: this.indexedCount,
      lastIndexed: new Date().toISOString(),
    };
  }

  renderStats(stats: IndexStats): string {
    return [
      'Auto-Index Status',
      `  Artifacts indexed: ${stats.indexedArtifacts}`,
      `  Last indexed: ${stats.lastIndexed ?? 'never'}`,
    ].join('\n');
  }
}
