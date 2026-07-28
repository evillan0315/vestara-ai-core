import type { PolicyDecisionRecord } from './decision';

export interface AuditRecord {
  readonly decisionRecord: PolicyDecisionRecord;
  readonly source: string;
  readonly traceId: string;
}
