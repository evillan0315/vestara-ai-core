import * as path from 'node:path';
import type { Corpus } from './corpus';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

export const EV003B_CORPUS: Corpus = {
  entries: [
    {
      name: 'vite-react-basic',
      path: path.join(FIXTURES_DIR, 'vite-react-basic'),
      assertions: {
        language: { primary: 'typescript', minimumConfidence: 0.8 },
        framework: { kind: 'vite', minimumConfidence: 0.5 },
        architecture: { kind: 'single-module', minimumConfidence: 0.5 },
        maturity: { level: 'developing' },
        risks: { contains: [] },
        health: { scoreMin: 0, scoreMax: 10 },
      },
    },
    {
      name: 'nestjs-monorepo',
      path: path.join(FIXTURES_DIR, 'nestjs-monorepo'),
      assertions: {
        language: { primary: 'typescript', minimumConfidence: 0.8 },
        architecture: { kind: 'monorepo', minimumConfidence: 0.5 },
        maturity: { level: 'developing' },
        risks: { contains: [] },
      },
    },
    {
      name: 'empty-project',
      path: path.join(FIXTURES_DIR, 'empty-project'),
      assertions: {
        language: { primary: 'unknown', minimumConfidence: 0.5 },
        architecture: { kind: 'single-module', minimumConfidence: 0.3 },
        maturity: { level: 'early' },
        risks: { contains: [] },
      },
    },
  ],
};
