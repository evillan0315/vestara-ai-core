import type { DecisionContext, HistoryRecord } from './context';

/**
 * Append-only history recorder — the History stage of the pipeline. Records
 * are immutable and never edited or deleted; an error is recorded as a new
 * record that references the original decision.
 */
export class HistoryRecorder {
  private readonly _records: HistoryRecord[] = [];

  record(context: DecisionContext): HistoryRecord {
    const record: HistoryRecord = {
      decisionId: context.request.id,
      recordedAt: new Date().toISOString(),
    };
    this._records.push(record);
    return record;
  }

  recordFailure(decisionId: string, _reason: string): HistoryRecord {
    const record: HistoryRecord = {
      decisionId,
      recordedAt: new Date().toISOString(),
    };
    this._records.push(record);
    return record;
  }

  list(): readonly HistoryRecord[] {
    return [...this._records];
  }

  count(): number {
    return this._records.length;
  }
}
