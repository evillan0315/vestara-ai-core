export type PipelineStage = 'permission' | 'policy' | 'execution' | 'verification' | 'trust';

export interface DecisionRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly stage: PipelineStage;
  readonly requestId: string;
  readonly jobId?: string;
  readonly runtimeId?: string;
  readonly workerId?: string;
  readonly data: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly parentRecordId?: string;
}
