import type { PipelineStage } from './record';

export interface HistoryQuery {
  readonly stage?: PipelineStage;
  readonly requestId?: string;
  readonly jobId?: string;
  readonly runtimeId?: string;
  readonly workerId?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit?: number;
  readonly offset?: number;
}
