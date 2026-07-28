import { DuplicateRecordError } from './types/errors';
import type { HistoryQuery } from './types/query';
import type { DecisionRecord } from './types/record';
import type { HistoryStore } from './types/store';

export class DefaultHistoryStore implements HistoryStore {
  private readonly records: DecisionRecord[] = [];

  append(record: DecisionRecord): void {
    if (this.records.some((r) => r.id === record.id)) {
      throw new DuplicateRecordError(record.id);
    }
    this.records.push(record);
  }

  get(id: string): DecisionRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  find(query: HistoryQuery): readonly DecisionRecord[] {
    let results = this.records;

    const { stage, requestId, jobId, runtimeId, workerId, fromTimestamp, toTimestamp, offset, limit } = query;

    if (stage) {
      results = results.filter((r) => r.stage === stage);
    }
    if (requestId) {
      results = results.filter((r) => r.requestId === requestId);
    }
    if (jobId) {
      results = results.filter((r) => r.jobId === jobId);
    }
    if (runtimeId) {
      results = results.filter((r) => r.runtimeId === runtimeId);
    }
    if (workerId) {
      results = results.filter((r) => r.workerId === workerId);
    }
    if (fromTimestamp) {
      results = results.filter((r) => r.timestamp >= fromTimestamp);
    }
    if (toTimestamp) {
      results = results.filter((r) => r.timestamp <= toTimestamp);
    }

    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    return results.slice(start, end);
  }

  timeline(entityId: string): readonly DecisionRecord[] {
    return this.records.filter((r) => r.requestId === entityId || r.jobId === entityId);
  }

  getAllRecords(): readonly DecisionRecord[] {
    return [...this.records];
  }
}
