/**
 * Execution Center domain package.
 *
 * Owns the DTOs consumed by the Execution Center UI and the pure projections
 * (queue, metrics, approvals, filesystem) that produce them from store records.
 */

export type { MetricsSource, QueueSource } from './projections';
export { buildQueue, computeMetrics, countFsOps, countPendingApprovals, queueSummary } from './projections';
export * from './types';
