import type { HistoryQuery } from './query';
import type { DecisionRecord } from './record';

export interface HistoryStore {
  append(record: DecisionRecord): void;
  get(id: string): DecisionRecord | undefined;
  find(query: HistoryQuery): readonly DecisionRecord[];
  timeline(entityId: string): readonly DecisionRecord[];
}
