/**
 * DefaultUnderstandingAssembler — merges producer contributions into
 * a single immutable WorkspaceUnderstanding snapshot.
 */

import type { UnderstandingAssembler, UnderstandingProducer, WorkspaceObservation, WorkspaceUnderstanding, ProducerResult } from '@vestara/understanding';

export class DefaultUnderstandingAssembler implements UnderstandingAssembler {
  async assemble(
    observation: WorkspaceObservation,
    producers: readonly UnderstandingProducer[],
  ): Promise<WorkspaceUnderstanding> {
    const results = await Promise.all(
      producers.map((p) => p.produce(observation)),
    );

    const snapshotId = `${observation.identity.id}:${observation.timestamp}`;
    const now = new Date().toISOString();

    // Start with a base understanding
    const base: WorkspaceUnderstanding = {
      id: snapshotId,
      generatedAt: now,
      fromObservationTimestamp: observation.timestamp,
      identity: {
        name: observation.identity.name,
        primaryLanguage: 'unknown',
        languageConfidence: 0,
        framework: null,
        packageManager: observation.config.detectedPackageManager,
        buildTool: observation.config.detectedBuildTool,
        testFramework: observation.config.detectedTestFramework,
      },
      architecture: {
        kind: 'unknown',
        layers: [],
        dependencyCycles: [],
        entryPoints: observation.entryPoints.map((ep) => ({
          path: ep.path,
          role: ep.type,
          confidence: ep.source === 'package.json' ? 1 : 0.6,
        })),
      },
      maturity: {
        level: 'early',
        healthScore: observation.health.overall,
        testCoverage: 'low',
        documentationLevel: 'low',
        codeQuality: 'fair',
        risks: [],
      },
      activity: {
        currentMilestone: null,
        recentChanges: [],
        activeBranches: [],
        uncommittedWork: false,
        stalledSince: null,
      },
      memory: {
        recentDecisions: [],
        keyFacts: [],
        memoryCount: 0,
      },
      state: {
        status: observation.workspace.status,
        isIndexed: observation.workspace.knowledge.documentsIndexed > 0,
        indexFreshness: observation.workspace.knowledge.lastIndexedAt
          ? (Date.now() - new Date(observation.workspace.knowledge.lastIndexedAt).getTime() < 86400000
            ? 'fresh' as const : 'stale' as const)
          : 'missing' as const,
        isCached: observation.workspace.lastOpenedAt !== null,
      },
      summary: '',
    };

    // Apply each producer's partial fields on top of the base
    for (const result of results) {
      this.applyPartial(base, result.fields);
    }

    const summary = this.generateSummary(base);
    return { ...base, summary };
  }

  private applyPartial(target: WorkspaceUnderstanding, partial: ProducerResult['fields']): void {
    const t = target as any;
    if (partial.identity) {
      for (const [k, v] of Object.entries(partial.identity)) {
        if (v !== undefined) t.identity[k] = v;
      }
    }
    if (partial.architecture) {
      for (const [k, v] of Object.entries(partial.architecture)) {
        if (v !== undefined) t.architecture[k] = v;
      }
    }
    if (partial.maturity) {
      for (const [k, v] of Object.entries(partial.maturity)) {
        if (v !== undefined && !(k === 'risks' && Array.isArray(v) && v.length === 0)) {
          t.maturity[k] = v;
        }
      }
    }
    if (partial.activity) {
      for (const [k, v] of Object.entries(partial.activity)) {
        if (v !== undefined) t.activity[k] = v;
      }
    }
    if (partial.memory) {
      for (const [k, v] of Object.entries(partial.memory)) {
        if (v !== undefined) t.memory[k] = v;
      }
    }
    if (partial.state) {
      for (const [k, v] of Object.entries(partial.state)) {
        if (v !== undefined) t.state[k] = v;
      }
    }
  }

  private generateSummary(u: WorkspaceUnderstanding): string {
    const parts: string[] = [];

    parts.push(`${u.identity.name} is a ${u.identity.primaryLanguage} ${u.architecture.kind === 'monorepo' ? 'monorepo' : u.architecture.kind === 'multi-module' ? 'multi-module project' : 'project'}`);

    if (u.architecture.entryPoints.length > 0) {
      parts.push(`with ${u.architecture.entryPoints.length} entry point${u.architecture.entryPoints.length > 1 ? 's' : ''}`);
    }

    parts.push(`Health: ${u.maturity.healthScore.toFixed(1)}/10 (${u.maturity.level})`);

    const high = u.maturity.risks.filter((r) => r.severity === 'high').length;
    if (high > 0) parts.push(`${high} high-severity risk${high > 1 ? 's' : ''} detected`);

    if (u.activity.recentChanges.length > 0) {
      parts.push(`Last change: ${u.activity.recentChanges[0].description}`);
    }
    if (u.activity.uncommittedWork) parts.push('Uncommitted changes present');

    return parts.join('. ') + '.';
  }
}
