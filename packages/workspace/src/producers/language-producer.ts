import type { ProducerResult, UnderstandingProducer, WorkspaceObservation } from '@vestara/understanding';

const SOURCE_WEIGHT: Record<string, number> = {
  ts: 3,
  tsx: 3,
  js: 3,
  jsx: 3,
  py: 3,
  rs: 3,
  go: 3,
  java: 2,
  rb: 2,
  kt: 2,
  swift: 2,
};

const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  php: 'php',
  vue: 'vue',
  svelte: 'svelte',
  scala: 'scala',
  html: 'html',
  css: 'css',
  sql: 'sql',
  sh: 'shell',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
};

export class LanguageProducer implements UnderstandingProducer {
  readonly id = 'language';

  async produce(observation: WorkspaceObservation): Promise<ProducerResult> {
    const signals = Object.entries(observation.files.byExtension).map(([ext, count]) => ({
      extension: ext,
      fileCount: count,
      weight: SOURCE_WEIGHT[ext] ?? 1,
    }));

    let bestLang = 'unknown';
    let bestScore = 0;
    let totalScore = 0;

    for (const s of signals) {
      const lang = EXT_LANGUAGE[s.extension] ?? s.extension;
      const score = s.fileCount * s.weight;
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestLang = lang;
      }
    }

    const confidence = totalScore > 0 ? Math.min(bestScore / totalScore, 1) : 0;

    return {
      fields: {
        identity: {
          primaryLanguage: bestLang,
          languageConfidence: confidence,
          packageManager: observation.config.detectedPackageManager,
          buildTool: observation.config.detectedBuildTool,
          testFramework: observation.config.detectedTestFramework,
        },
      },
      confidence,
      evidence: [`extension-counts:${JSON.stringify(observation.files.byExtension)}`],
    };
  }
}
