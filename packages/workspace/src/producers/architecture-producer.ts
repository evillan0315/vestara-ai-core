import type { UnderstandingProducer, ProducerResult, WorkspaceObservation } from '@vestara/understanding';
import type { ArchitectureKind } from '@vestara/understanding';

export class ArchitectureProducer implements UnderstandingProducer {
  readonly id = 'architecture';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const o = observation;
    const evidence: string[] = [];

    let kind: ArchitectureKind;
    let confidence: number;

    if (o.config.isMonorepo) {
      kind = 'monorepo';
      evidence.push('config:isMonorepo=true');
      confidence = 0.95;
      if (o.files.configFilesPresent.includes('pnpm-workspace.yaml')) {
        evidence.push('config:pnpm-workspace.yaml');
        confidence = 0.99;
      }
    } else if (o.dependencies.packages.length > 1) {
      kind = 'multi-module';
      evidence.push(`packages:${o.dependencies.packages.length}`);
      confidence = 0.75;
    } else {
      kind = 'single-module';
      evidence.push(`packages:${o.dependencies.packages.length}`);
      confidence = 0.6;
    }

    return {
      fields: {
        architecture: {
          kind,
          layers: [],
          dependencyCycles: [],
          entryPoints: o.entryPoints.map((ep) => ({
            path: ep.path,
            role: ep.type,
            confidence: ep.source === 'package.json' ? 1 : 0.6,
          })),
        },
      },
      confidence,
      evidence,
    };
  }
}
