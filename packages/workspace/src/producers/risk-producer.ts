import type { UnderstandingProducer, ProducerResult, WorkspaceObservation } from '@vestara/understanding';

export class RiskProducer implements UnderstandingProducer {
  readonly id = 'risks';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const o = observation;
    const evidence: string[] = [];
    const riskCount = o.health.risks.length;
    evidence.push(`risks:${riskCount} from health`);

    return {
      fields: {
        maturity: {
          risks: o.health.risks.map((r) => ({
            category: r.category,
            severity: r.severity,
            summary: r.detail,
            observationSource: r.location,
          })),
        },
      },
      confidence: riskCount > 0 ? 0.9 : 0.5,
      evidence,
    };
  }
}
