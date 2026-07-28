import type { UnderstandingProducer, ProducerResult, WorkspaceObservation } from '@vestara/understanding';

export class FrameworkProducer implements UnderstandingProducer {
  readonly id = 'framework';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const configs = observation.files.configFilesPresent;
    const evidence: string[] = [];

    let framework: string | null = null;

    if (configs.some((f) => f === 'turbo.json')) {
      framework = 'turborepo';
      evidence.push('config:turbo.json');
    } else if (configs.some((f) => f === 'next.config.ts' || f === 'next.config.js')) {
      framework = 'next.js';
      evidence.push('config:next.config');
    } else if (configs.some((f) => f.startsWith('vite.config'))) {
      framework = 'vite';
      evidence.push('config:vite.config');
    } else {
      framework = observation.config.detectedBuildTool ?? null;
      if (framework) evidence.push(`buildTool:${framework}`);
    }

    if (!framework) {
      return {
        fields: {},
        confidence: 0,
        evidence: ['no-framework-detected'],
      };
    }

    return {
      fields: {
        identity: { framework },
      },
      confidence: evidence.length > 0 ? 0.95 : 0.3,
      evidence,
    };
  }
}
