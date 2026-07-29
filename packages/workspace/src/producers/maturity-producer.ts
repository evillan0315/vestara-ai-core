import type {
  MaturityLevel,
  ProducerResult,
  UnderstandingProducer,
  WorkspaceObservation,
} from '@vestara/understanding';

export class MaturityProducer implements UnderstandingProducer {
  readonly id = 'maturity';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const o = observation;
    const health = o.health.overall;
    const evidence: string[] = [`health:overall=${health.toFixed(1)}`];

    let level: MaturityLevel;
    let confidence: number;

    if (health >= 8) {
      level = 'mature';
      confidence = 0.85;
    } else if (health >= 6) {
      level = 'established';
      confidence = 0.75;
    } else if (health >= 3) {
      level = 'developing';
      confidence = 0.65;
    } else {
      level = 'early';
      confidence = 0.6;
    }

    const testCov = o.health.testCoverage;
    const doc = o.health.documentation;
    const codeQual = o.health.codeQuality;

    evidence.push(`testCoverage=${testCov.toFixed(1)}`);
    evidence.push(`doc=${doc.toFixed(1)}`);
    evidence.push(`codeQuality=${codeQual.toFixed(1)}`);

    return {
      fields: {
        maturity: {
          level,
          testCoverage: testCov >= 8 ? 'high' : testCov >= 5 ? 'medium' : 'low',
          documentationLevel: doc >= 7 ? 'high' : doc >= 4 ? 'medium' : 'low',
          codeQuality: codeQual >= 7 ? 'good' : codeQual >= 4 ? 'fair' : 'needs-attention',
        },
      },
      confidence,
      evidence,
    };
  }
}
