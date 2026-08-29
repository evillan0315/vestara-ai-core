import type { DecisionContext } from './context';

export const STAGE_ORDER = ['permission', 'policy', 'execution', 'verification', 'trust', 'history'] as const;

export type StageName = (typeof STAGE_ORDER)[number];

export interface StageResult {
  readonly field: keyof DecisionContext;
  readonly value: DecisionContext[keyof DecisionContext];
}

export interface StageRunner {
  readonly stage: StageName;
  readonly run: (context: DecisionContext) => StageResult | Promise<StageResult>;
}

export interface StageDefinition extends StageRunner {
  readonly enabled: boolean;
  readonly description: string;
}

export interface DecisionPipelineOptions {
  stages?: StageRunner[];
  requirePermission?: boolean;
}

export class StageError extends Error {
  readonly stage: StageName;

  constructor(stage: StageName, message: string) {
    super(`[${stage}] ${message}`);
    this.name = 'StageError';
    this.stage = stage;
  }
}
