import type { UnderstandingProducer, ProducerResult, WorkspaceObservation } from '@vestara/understanding';

export class HealthProducer implements UnderstandingProducer {
  readonly id = 'health';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const o = observation;
    const evidence: string[] = [];
    const overall = o.health.overall;
    evidence.push(`overall=${overall.toFixed(1)}`);

    return {
      fields: {
        maturity: {
          healthScore: overall,
        },
        state: {
          status: o.workspace.status,
          isIndexed: o.workspace.knowledge.documentsIndexed > 0,
          indexFreshness: o.workspace.knowledge.lastIndexedAt
            ? (Date.now() - new Date(o.workspace.knowledge.lastIndexedAt).getTime() < 86400000 ? 'fresh' as const : 'stale' as const)
            : 'missing' as const,
          isCached: o.workspace.lastOpenedAt !== null,
        },
      },
      confidence: overall > 0 ? 0.9 : 0.3,
      evidence,
    };
  }
}
